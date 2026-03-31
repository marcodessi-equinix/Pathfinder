import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import ExcelJS from 'exceljs'
import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
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

type ReportRow = {
  usid: string
  searches: number
  up: number
  down: number
  lastActivity: string
}

type UploadedImage = {
  fileName: string
  name: string
  path: string
}

type BuildingTemplate = {
  fileName: string
  name: string
  building: string
  path: string
  showOnHome: boolean
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendDir = path.resolve(__dirname, '..')
const projectDir = path.resolve(backendDir, '..')
const dataDir = path.join(backendDir, 'data')
const uploadsDir = path.join(backendDir, 'uploads')
const buildingTemplatesDir = path.join(backendDir, 'FR2_Grundriss')
const databaseFile = path.join(dataDir, 'pathfinder.sqlite')
dotenv.config({ path: path.join(projectDir, '.env') })

const legacyDatabaseCandidates = [
  path.join(backendDir, 'legacy', 'db.json'),
  path.join(projectDir, 'db.json'),
]
const port = Number(process.env.PORT ?? 3000)
const adminPassword = process.env.ADMIN_PASSWORD ?? 'change-me'
const frontendOrigin = process.env.FRONTEND_ORIGIN
const cookieSecure = (process.env.COOKIE_SECURE ?? 'false').toLowerCase() === 'true'
const sessionCookieName = 'pathfinder_admin'
const sessionDurationMs = 8 * 60 * 60 * 1000
const supportedImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'])

mkdirSync(dataDir, { recursive: true })
mkdirSync(uploadsDir, { recursive: true })
mkdirSync(buildingTemplatesDir, { recursive: true })

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

  CREATE TABLE IF NOT EXISTS building_template_settings (
    file_name TEXT PRIMARY KEY,
    show_on_home INTEGER NOT NULL DEFAULT 1 CHECK (show_on_home IN (0, 1))
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

const imageQuerySchema = z.object({
  query: z.string().trim().max(120).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(24),
})

const renameImageSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

const buildingTemplateVisibilitySchema = z.object({
  showOnHome: z.boolean(),
})

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
const listTemplateSettingsStatement = database.prepare(
  'SELECT file_name AS fileName, show_on_home AS showOnHome FROM building_template_settings',
)
const upsertTemplateVisibilityStatement = database.prepare(`
  INSERT INTO building_template_settings (file_name, show_on_home)
  VALUES (?, ?)
  ON CONFLICT(file_name) DO UPDATE SET show_on_home = excluded.show_on_home
`)
const renameTemplateSettingsStatement = database.prepare(
  'UPDATE building_template_settings SET file_name = ? WHERE file_name = ?',
)
const deleteTemplateSettingsStatement = database.prepare(
  'DELETE FROM building_template_settings WHERE file_name = ?',
)
const updateRoomImageStatement = database.prepare('UPDATE rooms SET image = ? WHERE image = ?')
const clearRoomImageStatement = database.prepare('UPDATE rooms SET image = ? WHERE image = ?')

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

function buildReportRows(): ReportRow[] {
  const rows = new Map<string, ReportRow>()
  const analytics = listAnalyticsStatement.all() as Array<{ usid: string; timestamp: string }>
  const feedback = listFeedbackStatement.all() as Array<{
    usid: string
    rating: 'up' | 'down'
    timestamp: string
  }>

  function getOrCreateRow(usid: string, timestamp: string) {
    const existing = rows.get(usid)
    if (existing) {
      if (timestamp > existing.lastActivity) {
        existing.lastActivity = timestamp
      }
      return existing
    }

    const created: ReportRow = {
      usid,
      searches: 0,
      up: 0,
      down: 0,
      lastActivity: timestamp,
    }
    rows.set(usid, created)
    return created
  }

  for (const row of analytics) {
    const current = getOrCreateRow(row.usid, row.timestamp)
    current.searches += 1
  }

  for (const row of feedback) {
    const current = getOrCreateRow(row.usid, row.timestamp)
    if (row.rating === 'up') {
      current.up += 1
    } else {
      current.down += 1
    }
  }

  return Array.from(rows.values()).sort((left, right) => {
    if (left.lastActivity !== right.lastActivity) {
      return right.lastActivity.localeCompare(left.lastActivity)
    }

    if (left.searches !== right.searches) {
      return right.searches - left.searches
    }

    return left.usid.localeCompare(right.usid)
  })
}

function styleWorksheetHeader(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  }

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.autoFilter = {
    from: 'A1',
    to: `${worksheet.getRow(1).cellCount > 0 ? worksheet.getColumn(worksheet.getRow(1).cellCount).letter : 'A'}1`,
  }
}

async function buildReportWorkbookBuffer() {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Report')
  const rows = buildReportRows()

  worksheet.columns = [
    { header: 'USID', key: 'usid', width: 14 },
    { header: 'Searches', key: 'searches', width: 14 },
    { header: 'Thumbs Up', key: 'up', width: 14 },
    { header: 'Thumbs Down', key: 'down', width: 16 },
    { header: 'Last Activity', key: 'lastActivity', width: 24 },
  ]

  for (const row of rows) {
    worksheet.addRow({
      usid: row.usid,
      searches: row.searches,
      up: row.up,
      down: row.down,
      lastActivity: row.lastActivity,
    })
  }

  styleWorksheetHeader(worksheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function buildFeedbackWorkbookBuffer() {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Feedback')
  const rows = listFeedbackStatement.all() as FeedbackRow[]

  worksheet.columns = [
    { header: 'USID', key: 'usid', width: 14 },
    { header: 'Rating', key: 'rating', width: 12 },
    { header: 'Comment', key: 'comment', width: 48 },
    { header: 'Timestamp', key: 'timestamp', width: 24 },
  ]

  for (const row of rows) {
    worksheet.addRow({
      usid: row.usid,
      rating: row.rating,
      comment: row.comment,
      timestamp: row.timestamp,
    })
  }

  styleWorksheetHeader(worksheet)
  worksheet.getColumn('comment').alignment = { wrapText: true, vertical: 'top' }
  return Buffer.from(await workbook.xlsx.writeBuffer())
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

function getUploadExtension(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase()
  if (/^\.[a-z0-9]+$/.test(extension)) {
    return extension
  }

  switch (file.mimetype) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    case 'image/svg+xml':
      return '.svg'
    default:
      return ''
  }
}

function sanitizeAssetBaseName(name: string) {
  const normalized = name
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')

  return normalized.slice(0, 80).trim() || `asset-${Date.now()}`
}

function buildUniqueFileName(directory: string, rawName: string, extension: string, currentFileName?: string) {
  const safeBaseName = sanitizeAssetBaseName(rawName)
  const safeExtension = extension.toLowerCase()
  let candidate = `${safeBaseName}${safeExtension}`
  let counter = 2

  while (candidate !== currentFileName && existsSync(path.join(directory, candidate))) {
    candidate = `${safeBaseName} (${counter})${safeExtension}`
    counter += 1
  }

  return candidate
}

function buildUniqueImageFileName(rawName: string, extension: string, currentFileName?: string) {
  return buildUniqueFileName(uploadsDir, rawName, extension, currentFileName)
}

function buildUniqueTemplateFileName(rawName: string, extension: string, currentFileName?: string) {
  return buildUniqueFileName(buildingTemplatesDir, rawName, extension, currentFileName)
}

function getImageDisplayName(fileName: string) {
  return path.basename(fileName, path.extname(fileName))
}

function formatTemplateName(fileName: string) {
  return getImageDisplayName(fileName).trim()
}

function toUploadedImage(fileName: string): UploadedImage {
  return {
    fileName,
    name: getImageDisplayName(fileName),
    path: `/uploads/${encodeURIComponent(fileName)}`,
  }
}

function listUploadedImages() {
  return readdirSync(uploadsDir)
    .filter((fileName) => !fileName.startsWith('.'))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => toUploadedImage(fileName))
}

function listBuildingTemplates(): BuildingTemplate[] {
  if (!existsSync(buildingTemplatesDir)) {
    return []
  }

  const templateSettings = new Map(
    (listTemplateSettingsStatement.all() as Array<{ fileName: string; showOnHome: number }>).map((row) => [
      row.fileName,
      row.showOnHome !== 0,
    ]),
  )

  const preferredTemplateOrder = new Map([
    ['fr2office', 10],
    ['fr2logistic', 20],
    ['fr2phase12', 30],
    ['fr2phase34', 40],
    ['fr2phase25', 50],
    ['fr2phase26', 60],
  ])

  return readdirSync(buildingTemplatesDir)
    .filter((fileName) => supportedImageExtensions.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => {
      const leftKey = normalizeTemplateName(left)
      const rightKey = normalizeTemplateName(right)
      const leftRank = preferredTemplateOrder.get(leftKey) ?? Number.MAX_SAFE_INTEGER
      const rightRank = preferredTemplateOrder.get(rightKey) ?? Number.MAX_SAFE_INTEGER

      if (leftRank !== rightRank) {
        return leftRank - rightRank
      }

      return left.localeCompare(right)
    })
    .map((fileName) => withBuildingTemplateSettings(toBuildingTemplate(fileName), templateSettings))
}

function listPublicBuildingTemplates(): BuildingTemplate[] {
  return listBuildingTemplates().filter(
    (template) => template.showOnHome && normalizeTemplateName(template.fileName) !== 'fr2grundriss',
  )
}

function normalizeTemplateName(value: string) {
  return getImageDisplayName(value)
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function renameImageFile(fileName: string, name: string) {
  const sourceFile = path.basename(fileName)
  const sourcePath = path.join(uploadsDir, sourceFile)

  if (!existsSync(sourcePath)) {
    throw new Error('Image not found.')
  }

  const extension = path.extname(sourceFile).toLowerCase()
  const targetFileName = buildUniqueImageFileName(name, extension, sourceFile)

  if (targetFileName !== sourceFile) {
    renameSync(sourcePath, path.join(uploadsDir, targetFileName))
    updateRoomImageStatement.run(`/uploads/${encodeURIComponent(targetFileName)}`, `/uploads/${encodeURIComponent(sourceFile)}`)
  }

  return toUploadedImage(targetFileName)
}

function toBuildingTemplate(fileName: string): BuildingTemplate {
  const name = formatTemplateName(fileName)

  return {
    fileName,
    name,
    building: name,
    path: `/building-templates/${encodeURIComponent(fileName)}`,
    showOnHome: true,
  }
}

function withBuildingTemplateSettings(
  template: BuildingTemplate,
  templateSettings: Map<string, boolean>,
): BuildingTemplate {
  return {
    ...template,
    showOnHome: templateSettings.get(template.fileName) ?? true,
  }
}

function renameBuildingTemplateFile(fileName: string, name: string) {
  const sourceFile = path.basename(fileName)
  const sourcePath = path.join(buildingTemplatesDir, sourceFile)

  if (!existsSync(sourcePath)) {
    throw new Error('Building template not found.')
  }

  const extension = path.extname(sourceFile).toLowerCase()
  const targetFileName = buildUniqueTemplateFileName(name, extension, sourceFile)

  if (targetFileName !== sourceFile) {
    renameSync(sourcePath, path.join(buildingTemplatesDir, targetFileName))
    renameTemplateSettingsStatement.run(targetFileName, sourceFile)
    updateRoomImageStatement.run(
      `/building-templates/${encodeURIComponent(targetFileName)}`,
      `/building-templates/${encodeURIComponent(sourceFile)}`,
    )
  }

  return toBuildingTemplate(targetFileName)
}

function deleteBuildingTemplateFile(fileName: string) {
  const sourceFile = path.basename(fileName)
  const sourcePath = path.join(buildingTemplatesDir, sourceFile)

  if (!existsSync(sourcePath)) {
    throw new Error('Building template not found.')
  }

  unlinkSync(sourcePath)
  deleteTemplateSettingsStatement.run(sourceFile)
  clearRoomImageStatement.run('', `/building-templates/${encodeURIComponent(sourceFile)}`)
}

function updateBuildingTemplateVisibility(fileName: string, showOnHome: boolean) {
  const sourceFile = path.basename(fileName)
  const sourcePath = path.join(buildingTemplatesDir, sourceFile)

  if (!existsSync(sourcePath)) {
    throw new Error('Building template not found.')
  }

  upsertTemplateVisibilityStatement.run(sourceFile, showOnHome ? 1 : 0)
}

ensureLegacyImport()

if (adminPassword === 'change-me') {
  console.warn('Pathfinder backend is using the default admin password. Set ADMIN_PASSWORD before production use.')
}

const app = express()
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, uploadsDir)
    },
    filename: (_req, file, callback) => {
      const extension = getUploadExtension(file)
      const originalBaseName = path.basename(file.originalname, path.extname(file.originalname))
      callback(null, buildUniqueImageFileName(originalBaseName, extension || '.bin'))
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 50,
  },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'))
  },
})
const templateUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, buildingTemplatesDir)
    },
    filename: (_req, file, callback) => {
      const extension = getUploadExtension(file)
      const originalBaseName = path.basename(file.originalname, path.extname(file.originalname))
      callback(null, buildUniqueTemplateFileName(originalBaseName, extension || '.bin'))
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 50,
  },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'))
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
app.use('/building-templates', express.static(buildingTemplatesDir))

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

app.get('/api/building-templates', (_req, res) => {
  res.json(listPublicBuildingTemplates())
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

app.post('/api/admin/upload-images', requireAdmin, upload.array('images', 50), (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[]

  if (files.length === 0) {
    res.status(400).json({ error: 'No valid images uploaded.' })
    return
  }

  res.status(201).json({
    uploaded: files.map((file) => toUploadedImage(file.filename)),
  })
})

app.get('/api/admin/images', requireAdmin, (req, res) => {
  const payload = imageQuerySchema.safeParse(req.query)
  if (!payload.success) {
    res.status(400).json({ error: 'Invalid image query.' })
    return
  }

  const query = payload.data.query.toLowerCase()
  const allImages = listUploadedImages().filter((image) => {
    if (!query) {
      return true
    }

    return [image.fileName, image.name, image.path].some((value) => value.toLowerCase().includes(query))
  })

  const total = allImages.length
  const totalPages = Math.max(1, Math.ceil(total / payload.data.pageSize))
  const page = Math.min(payload.data.page, totalPages)
  const startIndex = (page - 1) * payload.data.pageSize
  const items = allImages.slice(startIndex, startIndex + payload.data.pageSize)

  res.json({
    items,
    total,
    page,
    pageSize: payload.data.pageSize,
    totalPages,
  })
})

app.get('/api/admin/building-templates', requireAdmin, (_req, res) => {
  res.json(listBuildingTemplates())
})

app.post('/api/admin/building-templates', requireAdmin, templateUpload.array('templates', 50), (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[]

  if (files.length === 0) {
    res.status(400).json({ error: 'No valid building templates uploaded.' })
    return
  }

  res.status(201).json({
    uploaded: files.map((file) => toBuildingTemplate(file.filename)),
  })
})

app.patch('/api/admin/building-templates/:fileName', requireAdmin, (req, res) => {
  const payload = renameImageSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  try {
    const template = renameBuildingTemplateFile(String(req.params.fileName ?? ''), payload.data.name)
    res.json({ ok: true, template })
  } catch (error) {
    if (error instanceof Error) {
      res.status(404).json({ error: error.message })
      return
    }

    throw error
  }
})

app.patch('/api/admin/building-templates/:fileName/visibility', requireAdmin, (req, res) => {
  const fileName = String(req.params.fileName ?? '')
  const payload = buildingTemplateVisibilitySchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  try {
    updateBuildingTemplateVisibility(fileName, payload.data.showOnHome)
    const template = listBuildingTemplates().find((entry) => entry.fileName === path.basename(fileName))

    if (!template) {
      res.status(404).json({ error: 'Building template not found.' })
      return
    }

    res.json({ ok: true, template })
  } catch (error) {
    if (error instanceof Error) {
      res.status(404).json({ error: error.message })
      return
    }

    throw error
  }
})

app.delete('/api/admin/building-templates/:fileName', requireAdmin, (req, res) => {
  try {
    deleteBuildingTemplateFile(String(req.params.fileName ?? ''))
    res.json({ ok: true })
  } catch (error) {
    if (error instanceof Error) {
      res.status(404).json({ error: error.message })
      return
    }

    throw error
  }
})

app.patch('/api/admin/images/:fileName', requireAdmin, (req, res) => {
  const payload = renameImageSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  try {
    const image = renameImageFile(String(req.params.fileName ?? ''), payload.data.name)
    res.json({ ok: true, image })
  } catch (error) {
    if (error instanceof Error) {
      res.status(404).json({ error: error.message })
      return
    }

    throw error
  }
})

app.get('/api/admin/feedback', requireAdmin, (_req, res) => {
  res.json(listFeedbackStatement.all() as FeedbackRow[])
})

app.get('/api/admin/report', requireAdmin, (_req, res) => {
  res.json(buildReportRows())
})

app.get('/api/admin/report.xlsx', requireAdmin, async (_req, res) => {
  const workbook = await buildReportWorkbookBuffer()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="pathfinder-report.xlsx"')
  res.send(workbook)
})

app.get('/api/admin/feedback.xlsx', requireAdmin, async (_req, res) => {
  const workbook = await buildFeedbackWorkbookBuffer()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="pathfinder-feedback.xlsx"')
  res.send(workbook)
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Pathfinder backend listening on http://localhost:${port}`)
})
