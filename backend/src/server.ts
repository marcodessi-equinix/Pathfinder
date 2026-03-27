import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

type Room = {
  usid: string
  building: string
  level: string
  room: string
  door: string
  image: string
}

type FeedbackRow = {
  id: number
  usid: string
  rating: 'up' | 'down'
  comment: string
  timestamp: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendDir = path.resolve(__dirname, '..')
const projectDir = path.resolve(backendDir, '..')
const dataDir = path.join(backendDir, 'data')
const uploadsDir = path.join(backendDir, 'uploads')
const databaseFile = path.join(dataDir, 'pathfinder.sqlite')
const legacyDatabaseCandidates = [
  path.join(backendDir, 'legacy', 'db.json'),
  path.join(projectDir, 'db.json'),
  path.join(projectDir, 'old pascal', 'db.json'),
]
const port = Number(process.env.PORT ?? 3000)
const adminPassword = process.env.ADMIN_PASSWORD ?? 'change-me'
const frontendOrigin = process.env.FRONTEND_ORIGIN
const cookieSecure = (process.env.COOKIE_SECURE ?? 'false').toLowerCase() === 'true'
const sessionCookieName = 'pathfinder_admin'
const sessionDurationMs = 8 * 60 * 60 * 1000

mkdirSync(dataDir, { recursive: true })
mkdirSync(uploadsDir, { recursive: true })

const database = new DatabaseSync(databaseFile)
const sessions = new Map<string, number>()

database.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS rooms (
    usid TEXT PRIMARY KEY,
    building TEXT NOT NULL,
    level TEXT NOT NULL,
    room TEXT NOT NULL,
    door TEXT NOT NULL,
    image TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usid TEXT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    comment TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usid TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
`)

const roomSchema = z.object({
  usid: z.string().trim().regex(/^\d{6}$/),
  building: z.string().trim().min(1).max(120),
  level: z.string().trim().min(1).max(120),
  room: z.string().trim().min(1).max(120),
  door: z.string().trim().min(1).max(120),
  image: z.string().trim().max(255).default(''),
})

const searchSchema = z.object({
  usid: z.string().trim().regex(/^\d{6}$/),
})

const feedbackSchema = z
  .object({
    usid: z.string().trim().regex(/^\d{6}$/),
    rating: z.enum(['up', 'down']),
    comment: z.string().trim().max(500).optional().default(''),
  })
  .superRefine((value, ctx) => {
    if (value.comment.length > 0 && value.comment.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'Comment must be at least 10 characters long.',
      })
    }
  })

const importSchema = z.union([
  z.record(z.string(), roomSchema.omit({ usid: true })),
  z.array(roomSchema),
])

const loginSchema = z.object({
  password: z.string().min(1),
})

const saveRoomStatement = database.prepare(`
  INSERT INTO rooms (usid, building, level, room, door, image)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(usid) DO UPDATE SET
    building = excluded.building,
    level = excluded.level,
    room = excluded.room,
    door = excluded.door,
    image = excluded.image
`)

const deleteRoomStatement = database.prepare('DELETE FROM rooms WHERE usid = ?')
const selectRoomStatement = database.prepare(
  'SELECT usid, building, level, room, door, image FROM rooms WHERE usid = ?',
)
const listRoomsStatement = database.prepare(
  'SELECT usid, building, level, room, door, image FROM rooms ORDER BY usid ASC',
)
const insertAnalyticsStatement = database.prepare(
  'INSERT INTO analytics (usid, timestamp) VALUES (?, ?)',
)
const insertFeedbackStatement = database.prepare(
  'INSERT INTO feedback (usid, rating, comment, timestamp) VALUES (?, ?, ?, ?)',
)
const listFeedbackStatement = database.prepare(
  'SELECT id, usid, rating, comment, timestamp FROM feedback ORDER BY timestamp DESC',
)
const listAnalyticsStatement = database.prepare(
  'SELECT usid, timestamp FROM analytics ORDER BY timestamp DESC',
)

function normalizeImagePath(image: string): string {
  if (!image) {
    return ''
  }

  if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('/')) {
    return image
  }

  return `/${image}`
}

function saveRoom(room: Room) {
  saveRoomStatement.run(
    room.usid,
    room.building,
    room.level,
    room.room,
    room.door,
    normalizeImagePath(room.image),
  )
}

function listRooms(): Room[] {
  return listRoomsStatement.all() as Room[]
}

function buildReportCsv() {
  const rows = new Map<string, { searches: number; up: number; down: number }>()
  const analytics = listAnalyticsStatement.all() as Array<{ usid: string }>
  const feedback = listFeedbackStatement.all() as Array<{ usid: string; rating: 'up' | 'down' }>

  for (const row of analytics) {
    const current = rows.get(row.usid) ?? { searches: 0, up: 0, down: 0 }
    current.searches += 1
    rows.set(row.usid, current)
  }

  for (const row of feedback) {
    const current = rows.get(row.usid) ?? { searches: 0, up: 0, down: 0 }
    if (row.rating === 'up') {
      current.up += 1
    } else {
      current.down += 1
    }
    rows.set(row.usid, current)
  }

  const lines = ['USID,Searches,Up,Down']
  for (const [usid, values] of rows.entries()) {
    lines.push(`${usid},${values.searches},${values.up},${values.down}`)
  }

  return lines.join('\n')
}

function buildFeedbackCsv() {
  const rows = listFeedbackStatement.all() as FeedbackRow[]
  const lines = ['USID,Rating,Comment,Timestamp']

  for (const row of rows) {
    const safeComment = row.comment.replaceAll('"', '""')
    lines.push(`${row.usid},${row.rating},"${safeComment}",${row.timestamp}`)
  }

  return lines.join('\n')
}

function runInTransaction<T>(callback: () => T) {
  database.exec('BEGIN')

  try {
    const result = callback()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function ensureLegacyImport() {
  const countRow = database.prepare('SELECT COUNT(*) AS count FROM rooms').get() as { count: number }
  const legacyDatabaseFile = legacyDatabaseCandidates.find((candidate) => existsSync(candidate))

  if (countRow.count > 0 || !legacyDatabaseFile) {
    return
  }

  const legacyRaw = JSON.parse(readFileSync(legacyDatabaseFile, 'utf8')) as {
    rooms?: Record<string, Omit<Room, 'usid'>>
    feedback?: Array<{ usid: string; rating: 'up' | 'down'; comment?: string; timestamp?: string }>
    analytics?: Array<{ usid: string; ts?: string; timestamp?: string }>
  }

  runInTransaction(() => {
    for (const [usid, room] of Object.entries(legacyRaw.rooms ?? {})) {
      saveRoom({
        usid,
        building: room.building ?? '',
        level: room.level ?? '',
        room: room.room ?? '',
        door: room.door ?? '',
        image: room.image ?? '',
      })
    }

    for (const item of legacyRaw.feedback ?? []) {
      insertFeedbackStatement.run(
        item.usid,
        item.rating,
        item.comment ?? '',
        item.timestamp ?? new Date().toISOString(),
      )
    }

    for (const item of legacyRaw.analytics ?? []) {
      insertAnalyticsStatement.run(item.usid, item.timestamp ?? item.ts ?? new Date().toISOString())
    }
  })
}

function createSession() {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, Date.now() + sessionDurationMs)
  return token
}

function clearExpiredSessions() {
  const now = Date.now()
  for (const [token, expiresAt] of sessions.entries()) {
    if (expiresAt <= now) {
      sessions.delete(token)
    }
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  clearExpiredSessions()
  const token = req.cookies[sessionCookieName] as string | undefined
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const expiresAt = sessions.get(token)
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(token)
    res.clearCookie(sessionCookieName)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  sessions.set(token, Date.now() + sessionDurationMs)
  next()
}

function parseImportPayload(payload: unknown): Room[] {
  const result = importSchema.parse(payload)

  if (Array.isArray(result)) {
    return result.map((room) => ({ ...room, image: normalizeImagePath(room.image) }))
  }

  return Object.entries(result).map(([usid, room]) => ({
    usid,
    building: room.building,
    level: room.level,
    room: room.room,
    door: room.door,
    image: normalizeImagePath(room.image),
  }))
}

ensureLegacyImport()

if (adminPassword === 'change-me') {
  console.warn('Pathfinder backend is using the default admin password. Set ADMIN_PASSWORD before production use.')
}

const app = express()
const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
})

app.use(
  cors({
    origin: frontendOrigin
      ? [frontendOrigin]
      : true,
    credentials: true,
  }),
)
app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))
app.use('/uploads', express.static(uploadsDir))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/search', (req, res) => {
  const payload = searchSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: 'Invalid USID' })
    return
  }

  const room = selectRoomStatement.get(payload.data.usid) as Room | undefined
  if (!room) {
    res.status(404).json({ error: 'No room found for this USID.' })
    return
  }

  insertAnalyticsStatement.run(payload.data.usid, new Date().toISOString())
  res.json(room)
})

app.post('/api/feedback', (req, res) => {
  const payload = feedbackSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  const timestamp = new Date().toISOString()
  insertFeedbackStatement.run(
    payload.data.usid,
    payload.data.rating,
    payload.data.comment,
    timestamp,
  )

  res.status(201).json({ ok: true })
})

app.get('/api/admin/session', (req, res) => {
  const token = req.cookies[sessionCookieName] as string | undefined
  const authenticated = Boolean(token && sessions.get(token) && sessions.get(token)! > Date.now())
  res.json({ authenticated })
})

app.post('/api/admin/login', (req, res) => {
  const payload = loginSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: 'Password is required.' })
    return
  }

  if (payload.data.password !== adminPassword) {
    res.status(401).json({ error: 'Wrong password.' })
    return
  }

  const token = createSession()
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: sessionDurationMs,
  })

  res.json({ ok: true })
})

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = req.cookies[sessionCookieName] as string | undefined
  if (token) {
    sessions.delete(token)
  }

  res.clearCookie(sessionCookieName)
  res.json({ ok: true })
})

app.get('/api/admin/rooms', requireAdmin, (_req, res) => {
  res.json(listRooms())
})

app.post('/api/admin/rooms', requireAdmin, (req, res) => {
  const payload = roomSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  saveRoom({ ...payload.data, image: normalizeImagePath(payload.data.image) })
  res.status(201).json({ ok: true })
})

app.delete('/api/admin/rooms/:usid', requireAdmin, (req, res) => {
  const usid = String(req.params.usid ?? '')
  if (!/^\d{6}$/.test(usid)) {
    res.status(400).json({ error: 'Invalid USID' })
    return
  }

  deleteRoomStatement.run(usid)
  res.json({ ok: true })
})

app.post('/api/admin/import', requireAdmin, (req, res) => {
  let rooms: Room[]
  try {
    rooms = parseImportPayload(req.body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.flatten() })
      return
    }

    throw error
  }

  runInTransaction(() => {
    database.exec('DELETE FROM rooms')
    for (const room of rooms) {
      saveRoom(room)
    }
  })

  res.json({ ok: true, imported: rooms.length })
})

app.post('/api/admin/upload-image', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image uploaded.' })
    return
  }

  res.status(201).json({
    fileName: req.file.filename,
    path: `/uploads/${req.file.filename}`,
  })
})

app.get('/api/admin/images', requireAdmin, (_req, res) => {
  const files = readdirSync(uploadsDir)
    .filter((fileName) => !fileName.startsWith('.'))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => ({
      name: fileName,
      path: `/uploads/${fileName}`,
    }))

  res.json(files)
})

app.get('/api/admin/feedback', requireAdmin, (_req, res) => {
  res.json(listFeedbackStatement.all() as FeedbackRow[])
})

app.get('/api/admin/report.csv', requireAdmin, (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="pathfinder-report.csv"')
  res.send(buildReportCsv())
})

app.get('/api/admin/feedback.csv', requireAdmin, (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="pathfinder-feedback.csv"')
  res.send(buildFeedbackCsv())
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Pathfinder backend listening on http://localhost:${port}`)
})
