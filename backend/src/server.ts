import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import ExcelJS from 'exceljs'
import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
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
  rating: number
  comment: string
  timestamp: string
}

type ReportRow = {
  usid: string
  searches: number
  positive: number
  neutral: number
  negative: number
  lastActivity: string
}

type UploadedImage = {
  fileName: string
  name: string
  path: string
}

type SearchAttemptState = {
  failedAttempts: number
  escalationLevel: number
  lockedUntil: number
  lastActivityAt: number
}

type IbxConfig = {
  current: string
  available: string[]
  isPrepared: boolean
}

type QuickLink = {
  id: number
  label: string
  usid: string
  sortOrder: number
}

const maxAssetUploadFileSizeBytes = 25 * 1024 * 1024
const minFeedbackRating = 1
const neutralFeedbackRating = 2
const maxFeedbackRating = 3

function normalizeFeedbackRating(value: number | string | null | undefined): number {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (trimmed === 'up') {
      return maxFeedbackRating
    }

    if (trimmed === 'down') {
      return minFeedbackRating
    }

    const parsed = Number.parseInt(trimmed, 10)
    return Number.isNaN(parsed) ? neutralFeedbackRating : normalizeFeedbackRating(parsed)
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return neutralFeedbackRating
  }

  if (value <= 2) {
    return minFeedbackRating
  }

  if (value === 3) {
    return neutralFeedbackRating
  }

  return maxFeedbackRating
}

function formatFileSizeLimit(bytes: number) {
  const megaBytes = bytes / (1024 * 1024)
  return Number.isInteger(megaBytes) ? `${megaBytes} MB` : `${megaBytes.toFixed(1)} MB`
}

function getUploadErrorMessage(error: multer.MulterError) {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return `Each image must be ${formatFileSizeLimit(maxAssetUploadFileSizeBytes)} or smaller.`
    case 'LIMIT_FILE_COUNT':
      return 'Too many files were selected for one upload.'
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected upload field. Please select images again and retry.'
    case 'LIMIT_PART_COUNT':
    case 'LIMIT_FIELD_KEY':
    case 'LIMIT_FIELD_VALUE':
    case 'LIMIT_FIELD_COUNT':
      return 'The upload payload could not be processed.'
    default:
      return 'Upload failed.'
  }
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
const dataDir = process.env.PATHFINDER_DATA_DIR ?? path.join(backendDir, 'data')
const uploadsDir = process.env.PATHFINDER_UPLOADS_DIR ?? path.join(backendDir, 'uploads')
const defaultBuildingTemplatesDir = process.env.PATHFINDER_DEFAULT_BUILDING_TEMPLATES_DIR ?? path.join(backendDir, 'FR2_Grundriss')
const buildingTemplatesDir = process.env.PATHFINDER_BUILDING_TEMPLATES_DIR ?? defaultBuildingTemplatesDir
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
const searchInitialFailureLimit = 5
const searchInitialLockoutMs = 30 * 1000
const searchEscalatedFailureLimit = 3
const searchEscalatedLockoutMs = 5 * 60 * 1000
const searchAttemptResetAfterMs = 10 * 60 * 1000
const configuredIbxOptions = (process.env.PATHFINDER_IBX_OPTIONS ?? 'default')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const defaultIbx = (process.env.PATHFINDER_DEFAULT_IBX ?? configuredIbxOptions[0] ?? 'default').trim() || 'default'
const ibxConfig: IbxConfig = {
  current: defaultIbx,
  available: Array.from(new Set([defaultIbx, ...configuredIbxOptions])),
  isPrepared: true,
}

mkdirSync(dataDir, { recursive: true })
mkdirSync(uploadsDir, { recursive: true })
mkdirSync(buildingTemplatesDir, { recursive: true })

function seedBuildingTemplatesFromDefaults() {
  if (path.resolve(buildingTemplatesDir) === path.resolve(defaultBuildingTemplatesDir)) {
    return
  }

  if (!existsSync(defaultBuildingTemplatesDir)) {
    return
  }

  const existingTemplates = readdirSync(buildingTemplatesDir).filter((fileName) =>
    supportedImageExtensions.has(path.extname(fileName).toLowerCase()),
  )

  if (existingTemplates.length > 0) {
    return
  }

  const defaultTemplates = readdirSync(defaultBuildingTemplatesDir).filter((fileName) =>
    supportedImageExtensions.has(path.extname(fileName).toLowerCase()),
  )

  for (const fileName of defaultTemplates) {
    copyFileSync(
      path.join(defaultBuildingTemplatesDir, fileName),
      path.join(buildingTemplatesDir, fileName),
    )
  }

  if (defaultTemplates.length > 0) {
    console.log(`Seeded ${defaultTemplates.length} default building templates into ${buildingTemplatesDir}`)
  }
}

seedBuildingTemplatesFromDefaults()

console.log('Pathfinder storage paths:', {
  dataDir,
  uploadsDir,
  buildingTemplatesDir,
  defaultBuildingTemplatesDir,
})

const database = new DatabaseSync(databaseFile)
const sessions = new Map<string, number>()
const searchAttempts = new Map<string, SearchAttemptState>()
const kioskSyncClients = new Set<Response>()

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
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 3),
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

  CREATE TABLE IF NOT EXISTS quick_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    usid TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`)

// Migrate legacy feedback values into the current three-point rating scale.
try {
  const info = database.prepare("PRAGMA table_info('feedback')").all() as { name: string; type: string }[]
  const ratingCol = info.find((c) => c.name === 'rating')
  const tableDefinition = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'feedback'").get() as { sql: string } | undefined
  const usesThreePointScale = tableDefinition?.sql?.includes('BETWEEN 1 AND 3') ?? false
  const hasOutOfRangeRatings = (database.prepare('SELECT COUNT(*) AS count FROM feedback WHERE CAST(rating AS INTEGER) NOT BETWEEN 1 AND 3').get() as { count: number }).count > 0

  if (ratingCol && (ratingCol.type === 'TEXT' || !usesThreePointScale || hasOutOfRangeRatings)) {
    database.exec(`
      ALTER TABLE feedback RENAME TO feedback_old;
      CREATE TABLE feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usid TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 3),
        comment TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL
      );
      INSERT INTO feedback (id, usid, rating, comment, timestamp)
        SELECT id,
          usid,
          CASE
            WHEN lower(trim(rating)) = 'up' THEN 3
            WHEN lower(trim(rating)) = 'down' THEN 1
            WHEN CAST(rating AS INTEGER) <= 2 THEN 1
            WHEN CAST(rating AS INTEGER) = 3 THEN 2
            ELSE 3
          END,
          comment,
          timestamp
        FROM feedback_old;
      DROP TABLE feedback_old;
    `)
    console.log('Migrated feedback table to the three-point rating scale.')
  }
} catch { /* table is already in new format */ }

const usidSchema = z.string().trim().min(1).max(16).regex(/^[A-Za-z0-9\-_]+$/)

const roomSchema = z.object({
  usid: usidSchema,
  building: z.string().trim().min(1).max(120),
  level: z.string().trim().min(1).max(120),
  room: z.string().trim().min(1).max(120),
  door: z.string().trim().min(1).max(120),
  image: z.string().trim().max(255).default(''),
})

const searchSchema = z.object({
  usid: usidSchema,
})

const feedbackSchema = z
  .object({
    usid: usidSchema,
    rating: z.number().int().min(1).max(3),
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

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(500),
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
// Finds the room whose stored USID exactly matches OR is the longest prefix of the query.
// Example: stored '314', query '314022' → prefix match returns room 314.
const prefixMatchRoomStatement = database.prepare(`
  SELECT usid, building, level, room, door, image FROM rooms
  WHERE usid = ?
     OR (LENGTH(usid) >= 3 AND ? LIKE usid || '%')
  ORDER BY LENGTH(usid) DESC
  LIMIT 1
`)
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

const listQuickLinksStatement = database.prepare(
  'SELECT id, label, usid, sort_order AS sortOrder FROM quick_links ORDER BY sort_order ASC, id ASC',
)
const insertQuickLinkStatement = database.prepare(
  'INSERT INTO quick_links (label, usid, sort_order) VALUES (?, ?, ?)',
)
const updateQuickLinkStatement = database.prepare(
  'UPDATE quick_links SET label = ?, usid = ?, sort_order = ? WHERE id = ?',
)
const deleteQuickLinkStatement = database.prepare('DELETE FROM quick_links WHERE id = ?')

const quickLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  usid: usidSchema,
  sortOrder: z.number().int().min(0).optional().default(0),
})

function listQuickLinks(): QuickLink[] {
  return listQuickLinksStatement.all() as QuickLink[]
}

function sendKioskSyncEvent(response: Response, eventName: 'connected' | 'sync', payload: Record<string, unknown>) {
  response.write(`event: ${eventName}\n`)
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function notifyKioskContentUpdated(reason: string) {
  const payload = {
    kind: 'kiosk-content',
    reason,
    updatedAt: new Date().toISOString(),
  }

  for (const response of kioskSyncClients) {
    sendKioskSyncEvent(response, 'sync', payload)
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function fuzzyRoomScore(room: Room, query: string): number {
  const q = query.toUpperCase()
  const usid = room.usid.toUpperCase()
  const building = room.building.toUpperCase()
  const roomNum = room.room.toUpperCase()

  if (usid === q) return 100
  if (usid.startsWith(q) || q.startsWith(usid)) return 90
  if (usid.includes(q) || building.includes(q) || roomNum.includes(q)) return 70

  const dist = levenshtein(usid, q)
  const maxLen = Math.max(usid.length, q.length)
  if (maxLen === 0) return 0
  const similarity = 1 - dist / maxLen
  return similarity >= 0.5 ? Math.round(similarity * 60) : 0
}

function suggestRooms(query: string, limit = 4): Room[] {
  const all = listRooms()
  return all
    .map((room) => ({ room, score: fuzzyRoomScore(room, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ room }) => room)
}

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
    room.usid.toUpperCase(),
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
    rating: number
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
      positive: 0,
      neutral: 0,
      negative: 0,
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
    const normalizedRating = normalizeFeedbackRating(row.rating)

    if (normalizedRating === maxFeedbackRating) {
      current.positive += 1
    } else if (normalizedRating === neutralFeedbackRating) {
      current.neutral += 1
    } else {
      current.negative += 1
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
    { header: 'Positive', key: 'positive', width: 14 },
    { header: 'Neutral', key: 'neutral', width: 14 },
    { header: 'Negative', key: 'negative', width: 14 },
    { header: 'Last Activity', key: 'lastActivity', width: 24 },
  ]

  for (const row of rows) {
    worksheet.addRow({
      usid: row.usid,
      searches: row.searches,
      positive: row.positive,
      neutral: row.neutral,
      negative: row.negative,
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
    { header: 'Rating (1-3)', key: 'rating', width: 12 },
    { header: 'Comment', key: 'comment', width: 48 },
    { header: 'Timestamp', key: 'timestamp', width: 24 },
  ]

  for (const row of rows) {
    worksheet.addRow({
      usid: row.usid,
      rating: normalizeFeedbackRating(row.rating),
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
        normalizeFeedbackRating(item.rating),
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

function getSearchAttemptKey(req: Request) {
  return req.ip || 'unknown'
}

function getSearchAttemptState(req: Request) {
  const key = getSearchAttemptKey(req)
  const current = searchAttempts.get(key)
  const now = Date.now()

  if (!current) {
    return null
  }

  if (current.lastActivityAt + searchAttemptResetAfterMs <= now) {
    searchAttempts.delete(key)
    return null
  }

  if (current.lockedUntil > 0 && current.lockedUntil <= now) {
    const nextState = {
      ...current,
      lockedUntil: 0,
    }

    searchAttempts.set(key, nextState)
    return nextState
  }

  return current
}

function clearSearchAttemptState(req: Request) {
  searchAttempts.delete(getSearchAttemptKey(req))
}

function registerSearchFailure(req: Request) {
  const key = getSearchAttemptKey(req)
  const current = getSearchAttemptState(req)
  const now = Date.now()
  let failedAttempts = (current?.failedAttempts ?? 0) + 1
  let escalationLevel = current?.escalationLevel ?? 0
  let lockedUntil = 0

  if (escalationLevel === 0 && failedAttempts >= searchInitialFailureLimit) {
    lockedUntil = now + searchInitialLockoutMs
    escalationLevel = 1
    failedAttempts = 0
  } else if (escalationLevel >= 1 && failedAttempts >= searchEscalatedFailureLimit) {
    lockedUntil = now + searchEscalatedLockoutMs
    failedAttempts = 0
  }

  searchAttempts.set(key, {
    failedAttempts,
    escalationLevel,
    lockedUntil,
    lastActivityAt: now,
  })

  return {
    failedAttempts,
    escalationLevel,
    lockedUntil,
    retryAfterSeconds: lockedUntil > 0 ? Math.max(1, Math.ceil((lockedUntil - now) / 1000)) : 0,
  }
}

function getRemainingSearchLockSeconds(req: Request) {
  const current = getSearchAttemptState(req)
  if (!current || current.lockedUntil <= 0) {
    return 0
  }

  return Math.max(1, Math.ceil((current.lockedUntil - Date.now()) / 1000))
}

function clearTable(tableName: 'feedback' | 'analytics') {
  database.exec(`DELETE FROM ${tableName}`)
}

function deleteRooms(usids: string[]) {
  runInTransaction(() => {
    for (const usid of usids) {
      deleteRoomStatement.run(usid)
    }
  })
}

function deleteImages(fileNames: string[]) {
  runInTransaction(() => {
    for (const fileName of fileNames) {
      deleteImageFile(fileName)
    }
  })
}

function deleteBuildingTemplates(fileNames: string[]) {
  runInTransaction(() => {
    for (const fileName of fileNames) {
      deleteBuildingTemplateFile(fileName)
    }
  })
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

function getRoomByUsid(usid: string) {
  return selectRoomStatement.get(usid.toUpperCase()) as Room | undefined
}

function normalizeTemplateName(value: string) {
  return getImageDisplayName(value)
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function deleteImageFile(fileName: string) {
  const sourceFile = path.basename(fileName)
  const sourcePath = path.join(uploadsDir, sourceFile)

  if (!existsSync(sourcePath)) {
    throw new Error('Image not found.')
  }

  unlinkSync(sourcePath)
  clearRoomImageStatement.run('', `/uploads/${encodeURIComponent(sourceFile)}`)
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
    fileSize: maxAssetUploadFileSizeBytes,
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
    fileSize: maxAssetUploadFileSizeBytes,
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
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', immutable: true }))
app.use('/building-templates', express.static(buildingTemplatesDir, { maxAge: '7d', immutable: true }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/search', (req, res) => {
  const payload = searchSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: 'Invalid USID' })
    return
  }

  const retryAfterSeconds = getRemainingSearchLockSeconds(req)
  if (retryAfterSeconds > 0) {
    const minutes = Math.floor(retryAfterSeconds / 60)
    const seconds = retryAfterSeconds % 60
    res.status(429).json({
      error: `Too many failed attempts. Try again in ${minutes}:${String(seconds).padStart(2, '0')}.`,
      retryAfterSeconds,
    })
    return
  }

  const normalizedUsid = payload.data.usid.toUpperCase()
  const room = prefixMatchRoomStatement.get(normalizedUsid, normalizedUsid) as Room | undefined
  if (!room) {
    const failureState = registerSearchFailure(req)

    if (failureState.lockedUntil > 0) {
      const minutes = Math.floor(failureState.retryAfterSeconds / 60)
      const seconds = failureState.retryAfterSeconds % 60

      res.status(429).json({
        error: `Too many failed attempts. Try again in ${minutes}:${String(seconds).padStart(2, '0')}.`,
        retryAfterSeconds: failureState.retryAfterSeconds,
      })
      return
    }

    res.status(404).json({ error: 'No room found for this code.' })
    return
  }

  clearSearchAttemptState(req)
  insertAnalyticsStatement.run(normalizedUsid, new Date().toISOString())
  res.json(room)
})

app.post('/api/search/suggest', (req, res) => {
  const payload = searchSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: 'Invalid query' })
    return
  }

  const suggestions = suggestRooms(payload.data.usid)
  res.json({ suggestions })
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
    normalizeFeedbackRating(payload.data.rating),
    payload.data.comment,
    timestamp,
  )

  res.status(201).json({ ok: true })
})

app.get('/api/building-templates', (_req, res) => {
  res.json(listPublicBuildingTemplates())
})

app.get('/api/quick-links', (_req, res) => {
  res.json(listQuickLinks())
})

app.get('/api/rooms/:usid', (req, res) => {
  const payload = usidSchema.safeParse(String(req.params.usid ?? ''))
  if (!payload.success) {
    res.status(400).json({ error: 'Invalid USID' })
    return
  }

  const room = getRoomByUsid(payload.data)
  if (!room) {
    res.status(404).json({ error: 'Room not found.' })
    return
  }

  res.json(room)
})

app.get('/api/kiosk/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  res.write('retry: 2000\n\n')

  kioskSyncClients.add(res)
  sendKioskSyncEvent(res, 'connected', {
    kind: 'kiosk-content',
    updatedAt: new Date().toISOString(),
  })

  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n')
  }, 25000)

  req.on('close', () => {
    clearInterval(keepAlive)
    kioskSyncClients.delete(res)
    res.end()
  })
})

app.get('/api/admin/session', (req, res) => {
  const token = req.cookies[sessionCookieName] as string | undefined
  const authenticated = Boolean(token && sessions.get(token) && sessions.get(token)! > Date.now())
  res.json({ authenticated })
})

app.get('/api/admin/ibx-config', requireAdmin, (_req, res) => {
  res.json(ibxConfig)
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

app.delete('/api/admin/rooms/bulk-delete', requireAdmin, (req, res) => {
  const payload = bulkDeleteSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  const normalizedIds: string[] = []

  for (const id of payload.data.ids) {
    const parsedId = usidSchema.safeParse(id)
    if (!parsedId.success) {
      res.status(400).json({ error: parsedId.error.flatten() })
      return
    }

    normalizedIds.push(parsedId.data.toUpperCase())
  }

  deleteRooms(normalizedIds)
  notifyKioskContentUpdated('rooms')
  res.json({ ok: true, deleted: normalizedIds.length })
})

app.post('/api/admin/rooms', requireAdmin, (req, res) => {
  const payload = roomSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  saveRoom({ ...payload.data, image: normalizeImagePath(payload.data.image) })
  notifyKioskContentUpdated('rooms')
  res.status(201).json({ ok: true })
})

app.delete('/api/admin/rooms/:usid', requireAdmin, (req, res) => {
  const usid = String(req.params.usid ?? '')
  const payload = usidSchema.safeParse(usid)
  if (!payload.success) {
    res.status(400).json({ error: 'Invalid USID' })
    return
  }

  deleteRoomStatement.run(payload.data.toUpperCase())
  notifyKioskContentUpdated('rooms')
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

  notifyKioskContentUpdated('rooms')
  res.json({ ok: true, imported: rooms.length })
})

app.post('/api/admin/upload-images', requireAdmin, upload.array('images'), (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[]

  if (files.length === 0) {
    res.status(400).json({ error: 'No valid images uploaded.' })
    return
  }

  notifyKioskContentUpdated('images')
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

app.delete('/api/admin/images/bulk-delete', requireAdmin, (req, res) => {
  const payload = bulkDeleteSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  deleteImages(payload.data.ids)
  notifyKioskContentUpdated('images')
  res.json({ ok: true, deleted: payload.data.ids.length })
})

app.get('/api/admin/building-templates', requireAdmin, (_req, res) => {
  res.json(listBuildingTemplates())
})

app.delete('/api/admin/building-templates/bulk-delete', requireAdmin, (req, res) => {
  const payload = bulkDeleteSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  deleteBuildingTemplates(payload.data.ids)
  notifyKioskContentUpdated('building-templates')
  res.json({ ok: true, deleted: payload.data.ids.length })
})

app.post('/api/admin/building-templates', requireAdmin, templateUpload.array('templates', 50), (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[]

  if (files.length === 0) {
    res.status(400).json({ error: 'No valid building templates uploaded.' })
    return
  }

  notifyKioskContentUpdated('building-templates')
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
    notifyKioskContentUpdated('building-templates')
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

    notifyKioskContentUpdated('building-templates')
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
    notifyKioskContentUpdated('building-templates')
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
    notifyKioskContentUpdated('images')
    res.json({ ok: true, image })
  } catch (error) {
    if (error instanceof Error) {
      res.status(404).json({ error: error.message })
      return
    }

    throw error
  }
})

app.delete('/api/admin/images/:fileName', requireAdmin, (req, res) => {
  try {
    deleteImageFile(String(req.params.fileName ?? ''))
    notifyKioskContentUpdated('images')
    res.json({ ok: true })
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

app.delete('/api/admin/feedback', requireAdmin, (_req, res) => {
  clearTable('feedback')
  res.json({ ok: true })
})

app.get('/api/admin/report', requireAdmin, (_req, res) => {
  res.json(buildReportRows())
})

app.delete('/api/admin/analytics', requireAdmin, (_req, res) => {
  clearTable('analytics')
  res.json({ ok: true })
})

app.get('/api/admin/quick-links', requireAdmin, (_req, res) => {
  res.json(listQuickLinks())
})

app.post('/api/admin/quick-links', requireAdmin, (req, res) => {
  const payload = quickLinkSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  const result = insertQuickLinkStatement.run(
    payload.data.label,
    payload.data.usid.toUpperCase(),
    payload.data.sortOrder,
  ) as { lastInsertRowid: number }

  notifyKioskContentUpdated('quick-links')
  res.status(201).json({ ok: true, id: result.lastInsertRowid })
})

app.put('/api/admin/quick-links/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const payload = quickLinkSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({ error: payload.error.flatten() })
    return
  }

  updateQuickLinkStatement.run(
    payload.data.label,
    payload.data.usid.toUpperCase(),
    payload.data.sortOrder,
    id,
  )
  notifyKioskContentUpdated('quick-links')
  res.json({ ok: true })
})

app.delete('/api/admin/quick-links/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  deleteQuickLinkStatement.run(id)
  notifyKioskContentUpdated('quick-links')
  res.json({ ok: true })
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

// ── Chart analytics ──────────────────────────────────────────────
app.get('/api/admin/analytics/charts', requireAdmin, (_req, res) => {
  // 1. Searches per day (last 30 days)
  const searchesPerDay = database.prepare(`
    SELECT date(timestamp) AS day, COUNT(*) AS count
    FROM analytics
    WHERE timestamp >= date('now', '-30 days')
    GROUP BY day ORDER BY day
  `).all() as Array<{ day: string; count: number }>

  // 2. Feedback per day (last 30 days)
  const feedbackPerDay = database.prepare(`
    SELECT date(timestamp) AS day, COUNT(*) AS count
    FROM feedback
    WHERE timestamp >= date('now', '-30 days')
    GROUP BY day ORDER BY day
  `).all() as Array<{ day: string; count: number }>

  // 3. Feedback rating distribution
  const ratingDistribution = database.prepare(`
    SELECT rating, COUNT(*) AS count
    FROM feedback
    GROUP BY rating ORDER BY rating
  `).all() as Array<{ rating: number; count: number }>

  // 4. Top 10 searched rooms
  const topRooms = database.prepare(`
    SELECT a.usid, COUNT(*) AS searches, COALESCE(r.building, '?') AS building, COALESCE(r.room, '?') AS room
    FROM analytics a LEFT JOIN rooms r ON a.usid = r.usid
    GROUP BY a.usid ORDER BY searches DESC LIMIT 10
  `).all() as Array<{ usid: string; searches: number; building: string; room: string }>

  // 5. Searches by building
  const searchesByBuilding = database.prepare(`
    SELECT COALESCE(r.building, 'Unknown') AS building, COUNT(*) AS count
    FROM analytics a LEFT JOIN rooms r ON a.usid = r.usid
    GROUP BY building ORDER BY count DESC
  `).all() as Array<{ building: string; count: number }>

  // 6. Average rating per day (last 30 days)
  const avgRatingPerDay = database.prepare(`
    SELECT date(timestamp) AS day, ROUND(AVG(rating), 2) AS avg
    FROM feedback
    WHERE timestamp >= date('now', '-30 days')
    GROUP BY day ORDER BY day
  `).all() as Array<{ day: string; avg: number }>

  res.json({
    searchesPerDay,
    feedbackPerDay,
    ratingDistribution,
    topRooms,
    searchesByBuilding,
    avgRatingPerDay,
  })
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: getUploadErrorMessage(error) })
    return
  }

  console.error(error)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Pathfinder backend listening on http://localhost:${port}`)
})
