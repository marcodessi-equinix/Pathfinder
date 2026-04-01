import { useEffect, useMemo, useRef, useState } from 'react'
import SplashScreen from './SplashScreen'
import {
  deleteBuildingTemplate,
  deleteImage,
  deleteRoom,
  getAdminSession,
  getBuildingTemplates,
  getChartData,
  getDownloadUrl,
  getFeedback,
  getImages,
  getPublicBuildingTemplates,
  getReport,
  getRooms,
  importRooms,
  login,
  logout,
  renameBuildingTemplate,
  renameImage,
  resolveAssetUrl,
  saveRoom,
  searchRoom,
  setBuildingTemplateVisibility,
  sendFeedback,
  uploadBuildingTemplates,
  uploadImages,
} from './api'
import './App.css'
import type { BuildingTemplate, ChartData, FeedbackEntry, ReportEntry, Room, UploadedImage, UploadedImagePage } from './types'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

type WakeLockSentinelLike = {
  release: () => Promise<void>
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

type RoomForm = {
  usid: string
  building: string
  level: string
  room: string
  door: string
  image: string
}

type StatusNotice = {
  tone: 'success' | 'error' | 'info'
  message: string
}

type UploadProgressState = {
  uploadedFiles: number
  totalFiles: number
  percent: number
}

const emptyRoom: RoomForm = {
  usid: '',
  building: '',
  level: '',
  room: '',
  door: '',
  image: '',
}

const roomWorkbookHeaders = ['USID', 'Building', 'Level', 'Room', 'Door', 'Image'] as const
const imagePageSize = 24
const chartTooltipContentStyle = {
  background: 'rgba(255, 255, 255, 0.98)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: 12,
  boxShadow: '0 18px 32px rgba(15, 23, 42, 0.14)',
}
const chartTooltipLabelStyle = {
  color: '#0f172a',
  fontWeight: 700,
}
const chartTooltipItemStyle = {
  color: '#334155',
}
const chartHoverCursorLine = {
  stroke: 'rgba(37, 99, 235, 0.35)',
  strokeWidth: 1,
}
const chartHoverCursorFill = {
  fill: 'rgba(37, 99, 235, 0.08)',
}
const adminThemeStorageKey = 'pathfinder-admin-theme'

type AdminTheme = 'dark' | 'light'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function toWorkbookRow(room: Room | RoomForm) {
  return {
    USID: room.usid,
    Building: room.building,
    Level: room.level,
    Room: room.room,
    Door: room.door,
    Image: room.image,
  }
}

async function exportRoomWorkbook(rooms: Room[]) {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  const worksheet = workbook.addWorksheet('Rooms')
  const rows = rooms.length > 0 ? rooms.map((room) => toWorkbookRow(room)) : [toWorkbookRow(emptyRoom)]

  worksheet.columns = roomWorkbookHeaders.map((header) => ({ header, key: header, width: 22 }))
  for (const row of rows) {
    worksheet.addRow(row)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = 'pathfinder-room-template.xlsx'
  link.click()
  URL.revokeObjectURL(url)
}

async function parseImportWorkbook(file: File): Promise<Room[]> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()

  await workbook.xlsx.load(await file.arrayBuffer())
  const worksheet = workbook.worksheets[0]

  if (!worksheet) {
    return []
  }

  const headerRow = worksheet.getRow(1)
  const headerValues = Array.isArray(headerRow.values) ? headerRow.values.slice(1) : []
  const headers = headerValues.map((value: unknown) => String(value ?? '').trim().toLowerCase())

  if (headers.length === 0) {
    return []
  }

  const missingHeaders = roomWorkbookHeaders
    .map((header) => header.toLowerCase())
    .filter((header) => !headers.includes(header))

  if (missingHeaders.length > 0) {
    throw new Error(`Missing Excel columns: ${missingHeaders.join(', ')}`)
  }

  const rows = worksheet.getRows(2, Math.max(worksheet.rowCount - 1, 0)) ?? []

  return rows
    .map((row) => {
      const values = Object.fromEntries(
        headers.map((header: string, index: number) => [header, String(row.getCell(index + 1).text ?? '').trim()]),
      )
      return {
        usid: values.usid ?? '',
        building: values.building ?? '',
        level: values.level ?? '',
        room: values.room ?? '',
        door: values.door ?? '',
        image: values.image ?? '',
      }
    })
    .filter((row) => Object.values(row).some((value) => value.length > 0))
}

function createEmptyImagePage(): UploadedImagePage {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: imagePageSize,
    totalPages: 1,
  }
}

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function formatRelativeCount(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`
}

function normalizeTemplateLookup(value: string) {
  return value
    .normalize('NFKD')
    .split('')
    .filter((character) => character.charCodeAt(0) <= 0x7f)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function getAssetFileName(path: string) {
  const rawFileName = path.split('/').filter(Boolean).pop() ?? path

  try {
    return decodeURIComponent(rawFileName)
  } catch {
    return rawFileName
  }
}

function getAssetDisplayName(path: string) {
  const fileName = getAssetFileName(path)
  return fileName.replace(/\.[^.]+$/, '') || fileName || path
}

const kioskDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const

function isLikelyIpadDevice() {
  const userAgent = navigator.userAgent
  return /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
}

function KioskApp() {
  const [input, setInput] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<BuildingTemplate | null>(null)
  const [buildingTemplates, setBuildingTemplates] = useState<BuildingTemplate[]>([])
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(45)
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [commentSent, setCommentSent] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const resetTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    document.title = 'PATHFINDER'
  }, [])

  useEffect(() => {
    document.body.classList.add('kiosk-mode')

    return () => {
      document.body.classList.remove('kiosk-mode')
    }
  }, [])

  useEffect(() => {
    const wakeLockNavigator = navigator as WakeLockNavigator
    let wakeLock: WakeLockSentinelLike | null = null
    let cancelled = false

    async function requestWakeLock() {
      if (!wakeLockNavigator.wakeLock || document.visibilityState !== 'visible') {
        return
      }

      try {
        wakeLock = await wakeLockNavigator.wakeLock.request('screen')
      } catch {
        wakeLock = null
      }
    }

    function handleVisibilityChange() {
      if (!cancelled) {
        void requestWakeLock()
      }
    }

    void requestWakeLock()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (wakeLock) {
        void wakeLock.release()
      }
    }
  }, [])

  useEffect(() => {
    void getPublicBuildingTemplates()
      .then((response) => {
        setBuildingTemplates(response)
      })
      .catch(() => {
        setBuildingTemplates([])
      })
  }, [])

  useEffect(() => {
    if (!selectedRoom && !selectedTemplate) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          setSelectedRoom(null)
          setSelectedTemplate(null)
          setInput('')
          setRating(null)
          setComment('')
          setFeedbackSent(false)
          setCommentSent(false)
          return 45
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [selectedRoom, selectedTemplate])

  useEffect(() => {
    if (selectedRoom || selectedTemplate) {
      return undefined
    }

    if (resetTimeoutRef.current) {
      window.clearTimeout(resetTimeoutRef.current)
    }

    if (input.length > 0 && input.length < 6) {
      resetTimeoutRef.current = window.setTimeout(() => {
        setInput('')
      }, 7000)
    }

    return () => {
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [input, selectedRoom, selectedTemplate])

  async function runSearch(usid: string) {
    if (usid.length !== 6) {
      return
    }

    setIsSearching(true)
    setError('')

    try {
      const room = await searchRoom(usid)
      setSelectedRoom(room)
      setSelectedTemplate(null)
      setSecondsLeft(45)
      setRating(null)
      setComment('')
      setFeedbackSent(false)
      setCommentSent(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No USID found')
    } finally {
      setIsSearching(false)
    }
  }

  function updateInput(nextValue: string) {
    setInput(nextValue)
    setError('')
  }

  function appendDigit(digit: string) {
    if (isSearching || input.length >= 6) {
      return
    }

    const nextValue = `${input}${digit}`.slice(0, 6)
    updateInput(nextValue)

    if (nextValue.length === 6) {
      window.setTimeout(() => {
        void runSearch(nextValue)
      }, 90)
    }
  }

  function removeLastDigit() {
    if (isSearching || input.length === 0) {
      return
    }

    updateInput(input.slice(0, -1))
  }

  function clearInput() {
    if (isSearching || input.length === 0) {
      return
    }

    updateInput('')
  }

  async function handleSmileyClick(value: number) {
    if (!selectedRoom || feedbackSent) return
    setRating(value)
    setFeedbackSent(true)
    setSecondsLeft((current) => current + 15)
    await sendFeedback(selectedRoom.usid, value, '')
  }

  async function handleSendComment() {
    if (!selectedRoom || !rating || commentSent) return
    if (comment.trim().length > 0 && comment.trim().length < 10) {
      setError('Comment must be at least 10 characters long')
      return
    }
    if (comment.trim().length === 0) return
    await sendFeedback(selectedRoom.usid, rating, comment.trim())
    setCommentSent(true)
  }

  function resetView() {
    setSelectedRoom(null)
    setSelectedTemplate(null)
    setInput('')
    setRating(null)
    setComment('')
    setFeedbackSent(false)
    setCommentSent(false)
    setError('')
    setSecondsLeft(45)
  }

  function handleTemplatePreview(template: BuildingTemplate) {
    setSelectedTemplate(template)
    setSelectedRoom(null)
    setError('')
    setSecondsLeft(45)
    setRating(null)
    setComment('')
    setFeedbackSent(false)
    setCommentSent(false)
  }

  return (
    <main className="kiosk-shell">
      {!selectedRoom && !selectedTemplate ? (
        <section className="kiosk-home">
          <div className="kiosk-home-content">
            <div className="kiosk-top-row">
              <div className="brand-strip" aria-label="Pathfinder and Equinix branding">
                <img src="/logo.jpg" className="brand-logo" alt="Pathfinder logo" />
                <span className="brand-separator" aria-hidden="true" />
                <div className="partner-wordmark" aria-label="Equinix">EQUINIX</div>
              </div>
              <img src="/header.jpg" className="hero-image" alt="Office directions" />
            </div>
            <p className="search-label">Enter the last six digits of your USID.</p>

            <div className="search-area">
              <div className="kiosk-display" aria-live="polite" aria-label="USID input display">
                <span className={`kiosk-display-value ${input ? 'is-filled' : ''}`}>{input || '000000'}</span>
                <span className="kiosk-display-caption">Digits entered: {input.length}/6</span>
              </div>

              <div className="kiosk-keypad" aria-label="Numeric keypad">
                {kioskDigits.slice(0, 9).map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    className="keypad-button"
                    onClick={() => appendDigit(digit)}
                    disabled={isSearching || input.length >= 6}
                    aria-label={`Enter ${digit}`}
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  className="keypad-button keypad-button--secondary"
                  onClick={clearInput}
                  disabled={isSearching || input.length === 0}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="keypad-button"
                  onClick={() => appendDigit(kioskDigits[9])}
                  disabled={isSearching || input.length >= 6}
                  aria-label="Enter 0"
                >
                  0
                </button>
                <button
                  type="button"
                  className="keypad-button keypad-button--secondary"
                  onClick={removeLastDigit}
                  disabled={isSearching || input.length === 0}
                >
                  Delete
                </button>
              </div>

              <p className="search-helper-text">The search starts automatically after the 6th digit.</p>
              {isSearching ? <p className="status-message is-info">Searching...</p> : null}
              {error ? <p className="error-message">{error}</p> : null}
            </div>

            {buildingTemplates.length > 0 ? (
              <section className="kiosk-template-section" aria-label="Building and phase shortcuts">
                <div className="kiosk-template-grid">
                  {buildingTemplates.map((template) => (
                    <button
                      key={template.fileName}
                      type="button"
                      className="kiosk-template-button"
                      onClick={() => handleTemplatePreview(template)}
                    >
                      {template.building}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="result-shell">
          <div className="result-content">
            <div className="result-header">
              <button className="back-button" onClick={resetView} aria-label="Back to search">
                ←
              </button>
              <div className="timer-box">
                <span>{secondsLeft}</span>s
              </div>
            </div>

            <h1 className="destination-title">{selectedRoom ? 'YOUR DESTINATION' : 'SITE PLAN'}</h1>
            <p className="destination-subtitle">
              {selectedRoom ? 'The destination is highlighted in green' : 'Selected building or phase overview'}
            </p>

            {selectedRoom ? (
              <div className="info-grid">
                <article className="tile">
                  <span className="tile-label">Building</span>
                  <strong className="tile-value">{selectedRoom.building}</strong>
                </article>
                <article className="tile">
                  <span className="tile-label">Level</span>
                  <strong className="tile-value">{selectedRoom.level}</strong>
                </article>
                <article className="tile">
                  <span className="tile-label">Room</span>
                  <strong className="tile-value">{selectedRoom.room}</strong>
                </article>
                <article className="tile">
                  <span className="tile-label">Door</span>
                  <strong className="tile-value">{selectedRoom.door}</strong>
                </article>
              </div>
            ) : selectedTemplate ? (
              <div className="info-grid preview-info-grid">
                <article className="tile">
                  <span className="tile-label">Area</span>
                  <strong className="tile-value">{selectedTemplate.building}</strong>
                </article>
              </div>
            ) : null}

            <div className="result-visual">
              {selectedRoom?.image ? (
                <img className="result-image" src={resolveAssetUrl(selectedRoom.image)} alt={`Route to room ${selectedRoom.room}`} />
              ) : null}
              {!selectedRoom && selectedTemplate ? (
                <img className="result-image" src={resolveAssetUrl(selectedTemplate.path)} alt={selectedTemplate.building} />
              ) : null}
            </div>

            <p className="pickup-hint">
              {selectedRoom ? 'Pick up keys or cards if needed.' : 'Use back to return to the USID search.'}
            </p>

            {selectedRoom ? (
              <>
                <div className="feedback-smileys">
                  {[
                    { value: 1, emoji: '😡', label: 'Very bad' },
                    { value: 2, emoji: '😕', label: 'Bad' },
                    { value: 3, emoji: '😐', label: 'Okay' },
                    { value: 4, emoji: '🙂', label: 'Good' },
                    { value: 5, emoji: '😍', label: 'Great' },
                  ].map((item) => (
                    <button
                      key={item.value}
                      className={`smiley-button ${rating === item.value ? 'is-selected' : ''}`}
                      onClick={() => void handleSmileyClick(item.value)}
                      disabled={feedbackSent}
                      aria-label={item.label}
                    >
                      {item.emoji}
                    </button>
                  ))}
                </div>

                {feedbackSent && !commentSent ? (
                  <div className="feedback-comment-row">
                    <p className="thank-you">Thank you!</p>
                    <input
                      className="feedback-input"
                      type="text"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Optional comment (min 10 chars)"
                    />
                    <button className="primary-button compact" onClick={() => void handleSendComment()} disabled={comment.trim().length === 0}>
                      Send
                    </button>
                  </div>
                ) : null}

                {commentSent ? <p className="thank-you">Thank you for your comment!</p> : null}
              </>
            ) : null}
          </div>
        </section>
      )}
    </main>
  )
}

function AdminApp() {
  const [showSplash, setShowSplash] = useState(true);
  const [adminTheme, setAdminTheme] = useState<AdminTheme>(() => {
    if (typeof window === 'undefined') {
      return 'dark'
    }

    return window.localStorage.getItem(adminThemeStorageKey) === 'light' ? 'light' : 'dark'
  })
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [report, setReport] = useState<ReportEntry[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [roomForm, setRoomForm] = useState<RoomForm>(emptyRoom)
  const [statusNotice, setStatusNotice] = useState<StatusNotice | null>(null)
  const [imagePageData, setImagePageData] = useState<UploadedImagePage>(createEmptyImagePage)
  const [buildingTemplates, setBuildingTemplates] = useState<BuildingTemplate[]>([])
  const [imageQuery, setImageQuery] = useState('')
  const [imagePage, setImagePage] = useState(1)
  const [showRoomImagePicker, setShowRoomImagePicker] = useState(false)
  const [imageRenameDrafts, setImageRenameDrafts] = useState<Record<string, string>>({})
  const [imageUploadProgress, setImageUploadProgress] = useState<UploadProgressState | null>(null)

  useEffect(() => {
    if (!statusNotice) return
    const delay = statusNotice.tone === 'error' ? 6000 : 4000
    const timer = setTimeout(() => setStatusNotice(null), delay)
    return () => clearTimeout(timer)
  }, [statusNotice])
  const [templateRenameDrafts, setTemplateRenameDrafts] = useState<Record<string, string>>({})
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const [isUploadingTemplates, setIsUploadingTemplates] = useState(false)
  const [roomView, setRoomView] = useState<'grid' | 'table'>('table')
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rooms' | 'import' | 'templates' | 'images' | 'reports'>('dashboard')
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [modal, setModal] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null)
  const modalRejectRef = useRef<(() => void) | null>(null)

  function showConfirmModal(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      modalRejectRef.current = () => { setModal(null); resolve(false) }
      setModal({
        title,
        message,
        onConfirm: () => { modalRejectRef.current = null; setModal(null); resolve(true) },
      })
    })
  }

  function dismissModal() {
    if (modalRejectRef.current) {
      modalRejectRef.current()
      modalRejectRef.current = null
    } else {
      setModal(null)
    }
  }

  useEffect(() => {
    document.title = 'PATHFINDER Admin'
    void getAdminSession()
      .then((session) => {
        setAuthenticated(session.authenticated)
      })
      .catch(() => {
        setAuthenticated(false)
      })
  }, [])

  useEffect(() => {
    document.body.classList.add('admin-mode')
    document.body.dataset.adminTheme = adminTheme

    return () => {
      document.body.classList.remove('admin-mode')
      delete document.body.dataset.adminTheme
    }
  }, [adminTheme])

  useEffect(() => {
    window.localStorage.setItem(adminThemeStorageKey, adminTheme)
  }, [adminTheme])

  function toggleAdminTheme() {
    setAdminTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    if (!authenticated) {
      return
    }

    void Promise.all([getRooms(), getFeedback(), getReport(), getBuildingTemplates(), getChartData()])
      .then(([roomsResponse, feedbackResponse, reportResponse, templateResponse, charts]) => {
        setRooms(roomsResponse)
        setFeedback(feedbackResponse)
        setReport(reportResponse)
        setBuildingTemplates(templateResponse)
        setChartData(charts)
        setTemplateRenameDrafts((current) => {
          const nextDrafts = { ...current }
          for (const template of templateResponse) {
            nextDrafts[template.fileName] ??= template.name
          }
          return nextDrafts
        })
      })
      .catch((error) => {
        setStatusNotice({
          tone: 'error',
          message: getErrorMessage(error, 'Admin data could not be loaded.'),
        })
      })
  }, [authenticated])

  useEffect(() => {
    if (!authenticated) {
      return
    }

    void getImages(imageQuery, imagePage, imagePageSize)
      .then((response) => {
        setImagePageData(response)
        setImagePage(response.page)
        setImageRenameDrafts((current) => {
          const nextDrafts = { ...current }
          for (const image of response.items) {
            nextDrafts[image.fileName] ??= image.name
          }
          return nextDrafts
        })
      })
      .catch((error) => {
        setStatusNotice({
          tone: 'error',
          message: getErrorMessage(error, 'Images could not be loaded.'),
        })
      })
  }, [authenticated, imagePage, imageQuery])

  const filteredRooms = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) {
      return rooms
    }

    return rooms.filter((room) =>
      [room.usid, room.building, room.level, room.room, room.door].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  }, [rooms, searchTerm])

  const matchingBuildingTemplates = useMemo(() => {
    const buildingKey = normalizeTemplateLookup(roomForm.building)

    if (!buildingKey) {
      return buildingTemplates
    }

    return buildingTemplates
      .map((template) => {
        const templateKey = normalizeTemplateLookup(template.building)
        const isExact = templateKey === buildingKey
        const isPartial = templateKey.includes(buildingKey) || buildingKey.includes(templateKey)

        return {
          template,
          isExact,
          isPartial,
        }
      })
      .filter((entry) => entry.isExact || entry.isPartial)
      .sort((left, right) => {
        if (left.isExact !== right.isExact) {
          return Number(right.isExact) - Number(left.isExact)
        }

        return left.template.building.localeCompare(right.template.building)
      })
      .map((entry) => entry.template)
  }, [buildingTemplates, roomForm.building])

  const selectedRoomTemplate = useMemo(
    () => buildingTemplates.find((template) => template.path === roomForm.image) ?? null,
    [buildingTemplates, roomForm.image],
  )

  const selectedRoomAsset = useMemo(() => {
    if (!roomForm.image) {
      return null
    }

    const selectedImage = imagePageData.items.find((image) => image.path === roomForm.image)
    if (selectedImage) {
      return {
        title: selectedImage.name,
        subtitle: selectedImage.fileName,
        source: 'Image library',
      }
    }

    if (selectedRoomTemplate) {
      return {
        title: selectedRoomTemplate.building,
        subtitle: selectedRoomTemplate.fileName,
        source: 'Building template',
      }
    }

    const fileName = getAssetFileName(roomForm.image)

    return {
      title: getAssetDisplayName(roomForm.image),
      subtitle: fileName,
      source: 'Stored file',
    }
  }, [imagePageData.items, roomForm.image, selectedRoomTemplate])

  const roomImagePickerItems = useMemo(() => imagePageData.items.slice(0, 8), [imagePageData.items])

  const totalSearches = report.reduce((sum, entry) => sum + entry.searches, 0)
  const averageRating = feedback.length > 0 ? (feedback.reduce((sum, entry) => sum + entry.rating, 0) / feedback.length).toFixed(1) : '–'
  const visibleTemplateCount = buildingTemplates.filter((template) => template.showOnHome).length
  const hiddenTemplateCount = buildingTemplates.length - visibleTemplateCount
  const topSearch = report.reduce<ReportEntry | null>((currentTop, entry) => {
    if (!currentTop || entry.searches > currentTop.searches) {
      return entry
    }
    return currentTop
  }, null)
  const lastActivity = report.reduce<string | null>((latest, entry) => {
    if (!latest || entry.lastActivity > latest) {
      return entry.lastActivity
    }
    return latest
  }, null)

  async function refreshRoomsAndFeedback() {
    const [roomsResponse, feedbackResponse, reportResponse] = await Promise.all([
      getRooms(),
      getFeedback(),
      getReport(),
    ])
    setRooms(roomsResponse)
    setFeedback(feedbackResponse)
    setReport(reportResponse)
  }

  async function refreshBuildingTemplates() {
    const templates = await getBuildingTemplates()
    setBuildingTemplates(templates)
    setTemplateRenameDrafts((current) => {
      const nextDrafts = { ...current }
      for (const template of templates) {
        nextDrafts[template.fileName] = nextDrafts[template.fileName] ?? template.name
      }

      for (const fileName of Object.keys(nextDrafts)) {
        if (!templates.some((template) => template.fileName === fileName)) {
          delete nextDrafts[fileName]
        }
      }

      return nextDrafts
    })
  }

  async function refreshImages(page = imagePage, query = imageQuery) {
    const response = await getImages(query, page, imagePageSize)
    setImagePageData(response)
    setImagePage(response.page)
    setImageRenameDrafts((current) => {
      const nextDrafts = { ...current }
      for (const image of response.items) {
        nextDrafts[image.fileName] ??= image.name
      }
      return nextDrafts
    })
  }

  async function handleLogin() {
    try {
      await login(password)
      setAuthenticated(true)
      setPassword('')
      setLoginError('')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login failed')
    }
  }

  async function handleLogout() {
    await logout()
    setAuthenticated(false)
    setStatusNotice(null)
    setBuildingTemplates([])
    setImagePageData(createEmptyImagePage())
    setImageRenameDrafts({})
    setTemplateRenameDrafts({})
  }

  async function handleSaveRoom() {
    try {
      await saveRoom(roomForm)
      setStatusNotice({ tone: 'success', message: `Room ${roomForm.usid} saved.` })
      setRoomForm(emptyRoom)
      await refreshRoomsAndFeedback()
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Room could not be saved.'),
      })
    }
  }

  async function handleDeleteRoom(usid: string) {
    const confirmed = await showConfirmModal('Delete Room', `Delete room ${usid}? This cannot be undone.`)
    if (!confirmed) {
      return
    }

    try {
      await deleteRoom(usid)
      setStatusNotice({ tone: 'success', message: `Room ${usid} deleted.` })
      await refreshRoomsAndFeedback()
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Room could not be deleted.'),
      })
    }
  }

  async function handleImportFile(file: File) {
    try {
      const payload = await parseImportWorkbook(file)
      if (payload.length === 0) {
        setStatusNotice({ tone: 'info', message: 'The selected Excel file is empty.' })
        return
      }

      const shouldImport = await showConfirmModal(
        'Import Rooms',
        `Import ${formatRelativeCount(payload.length, 'room', 'rooms')} from ${file.name}? This will replace the current room list.`,
      )

      if (!shouldImport) {
        return
      }

      const result = await importRooms(payload)
      setStatusNotice({
        tone: 'success',
        message: `${result.imported} rooms imported from ${file.name}.`,
      })
      await refreshRoomsAndFeedback()
    } catch (error) {
      setStatusNotice({ tone: 'error', message: getErrorMessage(error, 'Import failed.') })
    }
  }

  async function handleUpload(files: FileList | null) {
    const selectedFiles = Array.from(files ?? [])
    if (selectedFiles.length === 0) {
      return
    }

    try {
      setIsUploadingImages(true)
      setImageUploadProgress({
        uploadedFiles: 0,
        totalFiles: selectedFiles.length,
        percent: 0,
      })
      const result = await uploadImages(selectedFiles, {
        onProgress: (progress) => {
          setImageUploadProgress(progress)
        },
      })
      if (result.uploaded[0]) {
        setRoomForm((current) => ({ ...current, image: result.uploaded[0].path }))
      }
      setImagePage(1)
      setStatusNotice({
        tone: 'success',
        message: `${result.uploaded.length} image(s) uploaded.`,
      })
      await refreshImages(1, imageQuery)
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Image upload failed.'),
      })
    } finally {
      setIsUploadingImages(false)
      setImageUploadProgress(null)
    }
  }

  async function handleTemplateUpload(files: FileList | null) {
    const selectedFiles = Array.from(files ?? [])
    if (selectedFiles.length === 0) {
      return
    }

    try {
      setIsUploadingTemplates(true)
      const result = await uploadBuildingTemplates(selectedFiles)
      if (result.uploaded[0]) {
        setRoomForm((current) => ({
          ...current,
          building: current.building || result.uploaded[0].building,
          image: result.uploaded[0].path,
        }))
      }
      setStatusNotice({
        tone: 'success',
        message: `${result.uploaded.length} building template(s) uploaded.`,
      })
      await refreshBuildingTemplates()
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Building template upload failed.'),
      })
    } finally {
      setIsUploadingTemplates(false)
    }
  }

  async function handleRenameImage(image: UploadedImage) {
    const nextName = (imageRenameDrafts[image.fileName] ?? '').trim()
    if (!nextName) {
      setStatusNotice({ tone: 'info', message: 'Image name cannot be empty.' })
      return
    }

    try {
      const result = await renameImage(image.fileName, nextName)
      if (roomForm.image === image.path) {
        setRoomForm((current) => ({ ...current, image: result.image.path }))
      }
      setStatusNotice({ tone: 'success', message: `Image renamed to ${result.image.name}.` })
      await Promise.all([refreshRoomsAndFeedback(), refreshImages(imagePage, imageQuery)])
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Image could not be renamed.'),
      })
    }
  }

  async function handleRenameBuildingTemplate(template: BuildingTemplate) {
    const nextName = (templateRenameDrafts[template.fileName] ?? '').trim()
    if (!nextName) {
      setStatusNotice({ tone: 'info', message: 'Template name cannot be empty.' })
      return
    }

    try {
      const result = await renameBuildingTemplate(template.fileName, nextName)
      if (roomForm.image === template.path) {
        setRoomForm((current) => ({
          ...current,
          building: current.building || result.template.building,
          image: result.template.path,
        }))
      }
      setStatusNotice({ tone: 'success', message: `Building template renamed to ${result.template.building}.` })
      await refreshBuildingTemplates()
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Building template could not be renamed.'),
      })
    }
  }

  async function handleDeleteImage(image: UploadedImage) {
    const confirmed = await showConfirmModal('Delete Image', `Delete image "${image.name}"? This cannot be undone.`)
    if (!confirmed) {
      return
    }

    try {
      await deleteImage(image.fileName)
      if (roomForm.image === image.path) {
        setRoomForm((current) => ({ ...current, image: '' }))
      }
      setStatusNotice({ tone: 'success', message: `Image "${image.name}" deleted.` })
      await Promise.all([refreshRoomsAndFeedback(), refreshImages(imagePage, imageQuery)])
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Image could not be deleted.'),
      })
    }
  }

  async function handleDeleteBuildingTemplate(template: BuildingTemplate) {
    const confirmed = await showConfirmModal('Delete Template', `Delete building template ${template.building}? This cannot be undone.`)
    if (!confirmed) {
      return
    }

    try {
      await deleteBuildingTemplate(template.fileName)
      if (roomForm.image === template.path) {
        setRoomForm((current) => ({ ...current, image: '' }))
      }
      setStatusNotice({ tone: 'success', message: `Building template ${template.building} deleted.` })
      await refreshBuildingTemplates()
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Building template could not be deleted.'),
      })
    }
  }

  async function handleToggleBuildingTemplateVisibility(template: BuildingTemplate, showOnHome: boolean) {
    try {
      const result = await setBuildingTemplateVisibility(template.fileName, showOnHome)
      setBuildingTemplates((current) =>
        current.map((entry) => (entry.fileName === template.fileName ? result.template : entry)),
      )
      setStatusNotice({
        tone: 'success',
        message: showOnHome
          ? `Building template ${template.building} is now visible on the start screen.`
          : `Building template ${template.building} is now hidden from the start screen.`,
      })
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Building template visibility could not be updated.'),
      })
    }
  }

  async function handleExportTemplate() {
    try {
      await exportRoomWorkbook(rooms)
      setStatusNotice({ tone: 'success', message: 'Excel template exported.' })
    } catch (error) {
      setStatusNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Excel template export failed.'),
      })
    }
  }

  function handleSelectRoomImage(image: UploadedImage) {
    setRoomForm((current) => ({ ...current, image: image.path }))
    setShowRoomImagePicker(false)
    setStatusNotice({ tone: 'info', message: `Image ${image.name} selected for room.` })
  }

  function handleClearRoomImage() {
    setRoomForm((current) => {
      const shouldClearBuilding =
        selectedRoomTemplate !== null &&
        normalizeTemplateLookup(current.building) === normalizeTemplateLookup(selectedRoomTemplate.building)

      return {
        ...current,
        image: '',
        building: shouldClearBuilding ? '' : current.building,
      }
    })
    setStatusNotice({ tone: 'info', message: 'Room image cleared.' })
  }

  function handleUseBuildingTemplate(template: BuildingTemplate) {
    setRoomForm((current) => ({
      ...current,
      building: current.building || template.building,
      image: template.path,
    }))
    setActiveTab('rooms')
    setStatusNotice({ tone: 'info', message: `Building template ${template.building} selected.` })
  }

  if (showSplash) {
    return <SplashScreen onFinished={() => setShowSplash(false)} />;
  }

  if (!authenticated) {
    return (
      <main className="admin-login-shell" data-admin-theme={adminTheme}>
        <section className="admin-login-stage">
          <aside className="admin-login-showcase">
            <div className="admin-login-showcase-glow" aria-hidden="true" />

            <div className="admin-login-showcase-top">
              <div className="admin-login-brand">
                <img src="/admin-monitor-logo.svg" className="admin-login-brand-logo" alt="" />
                <div className="admin-login-brand-copy">
                  <span>Pathfinder route intelligence</span>
                  <strong>Control layer</strong>
                </div>
              </div>

              <div className="admin-login-status-chip">
                <span className="admin-login-status-dot" aria-hidden="true" />
                <span>Route graph online</span>
              </div>
            </div>

            <span className="admin-eyebrow">PATHFINDER // CONTROL</span>
            <h1>Direct rooms, plans and media from one focused command layer.</h1>
            <p>
              A clear admin entry point for room updates, template visibility and operational reporting.
            </p>

            <div className="admin-login-route-tags" aria-label="Pathfinder capabilities">
              {['Rooms', 'Templates', 'Reports'].map((tag) => (
                <span key={tag} className="admin-login-route-tag">
                  {tag}
                </span>
              ))}
            </div>

            <div className="admin-login-visual" aria-hidden="true">
              <img src="/DLevel1.jpg" className="admin-login-visual-image" alt="" />
              <div className="admin-login-visual-grid" />
              <div className="admin-login-visual-vignette" />
              <span className="admin-login-visual-scan" />
              <span className="admin-login-visual-route admin-login-visual-route--one" />
              <span className="admin-login-visual-route admin-login-visual-route--two" />
              <span className="admin-login-visual-route admin-login-visual-route--three" />
              <span className="admin-login-visual-node admin-login-visual-node--start" />
              <span className="admin-login-visual-node admin-login-visual-node--mid" />
              <span className="admin-login-visual-node admin-login-visual-node--target" />

              <div className="admin-login-visual-card admin-login-visual-card--left">
                <span>Route preview</span>
                <strong>Navigation stays aligned from entry point to destination.</strong>
              </div>
            </div>

            <div className="admin-login-feature-list">
              <article className="admin-feature-card">
                <span>Templates</span>
                <strong>Choose which plans appear on the kiosk.</strong>
              </article>
              <article className="admin-feature-card">
                <span>Media</span>
                <strong>Manage uploads and assignments in one place.</strong>
              </article>
              <article className="admin-feature-card">
                <span>Reporting</span>
                <strong>Review searches, feedback and exports quickly.</strong>
              </article>
            </div>
          </aside>

          <section className={`admin-login-card ${loginError ? 'is-error' : ''}`}>
            <div className="admin-login-card-head">
              <div>
                <span className="admin-eyebrow">Secure Access</span>
                <h2>Admin Login</h2>
              </div>

              <span className="admin-login-card-badge">Route Ops</span>
            </div>

            <p>Authenticate to enter the command center for Pathfinder operations.</p>

            <div className="admin-login-signal-row" aria-hidden="true">
              <span className="admin-login-signal-pill">Spatial auth</span>
              <span className="admin-login-signal-pill">Template control</span>
              <span className="admin-login-signal-pill">Live reporting</span>
            </div>

            <label className={`admin-field ${loginError ? 'is-error' : ''}`}>
              <span>Password</span>
              {loginError ? (
                <input
                  className="admin-password is-error"
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  aria-invalid="true"
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleLogin()
                    }
                  }}
                />
              ) : (
                <input
                  className="admin-password"
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleLogin()
                    }
                  }}
                />
              )}
            </label>

            {loginError ? (
              <div className="admin-login-error-banner" role="alert" aria-live="assertive">
                {loginError}
              </div>
            ) : null}

            <div className="admin-login-action-row">
              <button className="primary-button" onClick={() => void handleLogin()}>
                Enter command center
              </button>

              <button className="secondary-button theme-toggle" onClick={toggleAdminTheme}>
                Theme: {adminTheme === 'dark' ? 'Dark' : 'Light'}
              </button>
            </div>

            <div className="admin-login-meta">
              <span>Protected admin route</span>
              <span>Room, template and report access</span>
            </div>

            <div className="admin-login-audio-hint" aria-hidden="true">
              <span className="admin-login-audio-bars">
                <span />
                <span />
                <span />
              </span>
              <span>Theme toggle and access control are available immediately after login.</span>
            </div>
          </section>
        </section>
      </main>
    )
  }

  const adminTabs = [
    { key: 'dashboard' as const, label: 'Dashboard', icon: '▣' },
    { key: 'rooms' as const, label: 'Rooms', icon: '⌂' },
    { key: 'import' as const, label: 'Import', icon: '⇪' },
    { key: 'templates' as const, label: 'Templates', icon: '⊡' },
    { key: 'images' as const, label: 'Images', icon: '▨' },
    { key: 'reports' as const, label: 'Reports', icon: '⊟' },
  ]

  return (
    <main className="admin-shell" data-admin-theme={adminTheme}>
      <nav className="admin-sidebar">
        <div className="sidebar-brand">
          <img src="/admin-monitor-logo.svg" alt="Pathfinder monitor logo" className="sidebar-brand-logo" />
          <div className="sidebar-brand-text">
            <strong>PATHFINDER</strong>
            <span>Admin Console</span>
          </div>
        </div>

        <div className="sidebar-nav">
          {adminTabs.map((tab) => (
            <button
              key={tab.key}
              className={`sidebar-nav-item ${activeTab === tab.key ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="sidebar-nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-session">
            <span className="sidebar-session-dot" />
            <span>Admin online</span>
          </div>
          <button className="sidebar-logout" onClick={() => void handleLogout()}>
            Logout
          </button>
        </div>
      </nav>

      <div className="admin-content">
        <header className="admin-topbar">
          <div className="topbar-left">
            <h1 className="topbar-title">{adminTabs.find((t) => t.key === activeTab)?.label}</h1>
            <span className="topbar-subtitle">
              {activeTab === 'dashboard' && 'Overview of system health and key metrics'}
              {activeTab === 'rooms' && 'Create, edit and manage room records'}
              {activeTab === 'import' && 'Bulk import rooms from Excel files'}
              {activeTab === 'templates' && 'Floor plan templates for building navigation'}
              {activeTab === 'images' && 'Upload and manage the media library'}
              {activeTab === 'reports' && 'Feedback and search analytics'}
            </span>
          </div>
          <div className="topbar-right">
            <button className="secondary-button compact theme-toggle" onClick={toggleAdminTheme}>
              Theme: {adminTheme === 'dark' ? 'Dark' : 'Light'}
            </button>
            {lastActivity ? <span className="topbar-activity">Last activity {formatDate(lastActivity)}</span> : null}
          </div>
        </header>

        {statusNotice ? <p className={`status-message admin-status-banner is-${statusNotice.tone}`}>{statusNotice.message}</p> : null}

        {activeTab === 'dashboard' && (
          <div className="admin-tab-panel">
            <section className="stats-grid">
              <article className="stat-card stat-card--rooms">
                <div className="stat-icon-ring">⌂</div>
                <div className="stat-body">
                  <span className="stat-label">Rooms</span>
                  <strong className="stat-value">{rooms.length}</strong>
                  <span className="stat-note">{formatRelativeCount(filteredRooms.length, 'result', 'results')} for the current filter</span>
                </div>
              </article>
              <article className="stat-card stat-card--searches">
                <div className="stat-icon-ring">⊘</div>
                <div className="stat-body">
                  <span className="stat-label">Searches</span>
                  <strong className="stat-value">{totalSearches}</strong>
                  <span className="stat-note">{topSearch ? `Top USID ${topSearch.usid} with ${topSearch.searches}` : 'No searches yet'}</span>
                </div>
              </article>
              <article className="stat-card stat-card--feedback">
                <div className="stat-icon-ring">♡</div>
                <div className="stat-body">
                  <span className="stat-label">Feedback</span>
                  <strong className="stat-value">{feedback.length}</strong>
                  <span className="stat-note">Avg {averageRating} / 5</span>
                </div>
              </article>
              <article className="stat-card stat-card--templates">
                <div className="stat-icon-ring">⊡</div>
                <div className="stat-body">
                  <span className="stat-label">Templates</span>
                  <strong className="stat-value">{buildingTemplates.length}</strong>
                  <span className="stat-note">{visibleTemplateCount} visible · {hiddenTemplateCount} hidden</span>
                </div>
              </article>
            </section>

            {chartData && (
              <section className="dashboard-charts">
                <article className="admin-card chart-card">
                  <h2>Searches (30d)</h2>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData.searchesPerDay}>
                        <defs>
                          <linearGradient id="gradSearch" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={chartHoverCursorLine} />
                        <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#gradSearch)" strokeWidth={2} name="Searches" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="admin-card chart-card">
                  <h2>Avg. Rating (30d)</h2>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData.avgRatingPerDay}>
                        <defs>
                          <linearGradient id="gradRating" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={chartHoverCursorLine} />
                        <Area type="monotone" dataKey="avg" stroke="#f59e0b" fill="url(#gradRating)" strokeWidth={2} name="Avg Rating" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="admin-card chart-card">
                  <h2>Ratings</h2>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData.ratingDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="rating" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${['😡','😕','😐','🙂','😍'][v - 1]} ${v}`} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={chartHoverCursorFill} />
                        <Bar dataKey="count" name="Feedback" radius={[6, 6, 0, 0]}>
                          {chartData.ratingDistribution.map((entry) => (
                            <Cell key={entry.rating} fill={['#ef4444','#f97316','#eab308','#22c55e','#10b981'][entry.rating - 1]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="admin-card chart-card">
                  <h2>By Building</h2>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={chartData.searchesByBuilding}
                          dataKey="count"
                          nameKey="building"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          innerRadius={35}
                          label={(props) => {
                            const building = typeof props.payload?.building === 'string' ? props.payload.building : ''
                            const percent = typeof props.percent === 'number' ? props.percent : 0
                            return `${building} ${(percent * 100).toFixed(0)}%`
                          }}
                        >
                          {chartData.searchesByBuilding.map((_entry, i) => (
                            <Cell key={i} fill={['#6366f1','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe','#7c3aed','#4f46e5'][i % 7]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="admin-card chart-card">
                  <h2>Top Rooms</h2>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData.topRooms} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="usid" tick={{ fontSize: 11 }} width={70} />
                        <Tooltip
                          contentStyle={chartTooltipContentStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                          cursor={chartHoverCursorFill}
                          formatter={(value, _name, props) => {
                            const searches = typeof value === 'number' ? value : Number(value ?? 0)
                            const building = typeof props.payload?.building === 'string' ? props.payload.building : 'Unknown'
                            const room = typeof props.payload?.room === 'string' ? props.payload.room : '?'
                            return [`${searches} searches`, `${building} / ${room}`]
                          }}
                        />
                        <Bar dataKey="searches" name="Searches" radius={[0, 6, 6, 0]}>
                          {chartData.topRooms.map((_entry, i) => (
                            <Cell key={i} fill={i === 0 ? '#6366f1' : i < 3 ? '#8b5cf6' : '#a78bfa'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="admin-card chart-card">
                  <h2>Feedback (30d)</h2>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData.feedbackPerDay}>
                        <defs>
                          <linearGradient id="gradFeedback" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={chartHoverCursorLine} />
                        <Area type="monotone" dataKey="count" stroke="#ec4899" fill="url(#gradFeedback)" strokeWidth={2} name="Feedback" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              </section>
            )}
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="admin-tab-panel">
            <section className="admin-grid">
              <article className="admin-card emphasis-card">
                <h2>Room Editor</h2>
                <p className="muted-text">Update a room directly or use a saved building template before falling back to the image library.</p>
                <div className="form-grid">
                  <label className="form-field">
                    <span>USID</span>
                    <input placeholder="e.g. 100234" value={roomForm.usid} onChange={(event) => setRoomForm({ ...roomForm, usid: event.target.value.replace(/\D/g, '').slice(0, 6) })} />
                  </label>
                  <label className="form-field">
                    <span>Building</span>
                    <input placeholder="e.g. FR2" value={roomForm.building} onChange={(event) => setRoomForm({ ...roomForm, building: event.target.value })} />
                  </label>
                  <label className="form-field">
                    <span>Level</span>
                    <input placeholder="e.g. L1" value={roomForm.level} onChange={(event) => setRoomForm({ ...roomForm, level: event.target.value })} />
                  </label>
                  <label className="form-field">
                    <span>Room</span>
                    <input placeholder="e.g. R102" value={roomForm.room} onChange={(event) => setRoomForm({ ...roomForm, room: event.target.value })} />
                  </label>
                  <label className="form-field">
                    <span>Door</span>
                    <input placeholder="e.g. D1" value={roomForm.door} onChange={(event) => setRoomForm({ ...roomForm, door: event.target.value })} />
                  </label>
                  <div className="form-field form-field--full">
                    <span>Room image</span>
                    <div className="room-image-field">
                      <div className={`room-image-selection ${roomForm.image ? 'is-selected' : ''}`}>
                        <div className="room-image-selection-copy">
                          <strong>{selectedRoomAsset?.title ?? 'No image selected'}</strong>
                          <span>
                            {selectedRoomAsset
                              ? `${selectedRoomAsset.source} · ${selectedRoomAsset.subtitle}`
                              : 'Search and choose an uploaded image. The storage path stays hidden.'}
                          </span>
                        </div>
                        <div className="room-image-selection-actions">
                          <button className="secondary-button compact" onClick={() => setShowRoomImagePicker((current) => !current)}>
                            {showRoomImagePicker ? 'Hide library' : 'Choose from library'}
                          </button>
                          {roomForm.image ? (
                            <button className="secondary-button compact" onClick={handleClearRoomImage}>
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {showRoomImagePicker ? (
                        <div className="room-image-picker">
                          <div className="room-image-picker-head">
                            <input
                              className="search-filter"
                              placeholder="Search uploaded images"
                              value={imageQuery}
                              onChange={(event) => {
                                setImageQuery(event.target.value)
                                setImagePage(1)
                              }}
                            />
                            <span className="muted-text">{imagePageData.total} images</span>
                          </div>

                          {roomImagePickerItems.length > 0 ? (
                            <>
                              <div className="room-image-picker-list">
                                {roomImagePickerItems.map((image) => (
                                  <button
                                    key={image.fileName}
                                    className={`room-image-option ${roomForm.image === image.path ? 'is-selected' : ''}`}
                                    onClick={() => handleSelectRoomImage(image)}
                                  >
                                    <span className="room-image-option-thumb">
                                      <img src={resolveAssetUrl(image.path)} alt={image.name} loading="lazy" decoding="async" />
                                    </span>
                                    <span className="room-image-option-copy">
                                      <strong title={image.name}>{image.name}</strong>
                                      <span title={image.fileName}>{image.fileName}</span>
                                    </span>
                                  </button>
                                ))}
                              </div>

                              <div className="room-image-picker-footer">
                                <div className="button-row room-image-picker-pagination">
                                  <button className="secondary-button compact" disabled={imagePageData.page <= 1} onClick={() => setImagePage((current) => Math.max(1, current - 1))}>
                                    Previous
                                  </button>
                                  <button
                                    className="secondary-button compact"
                                    disabled={imagePageData.page >= imagePageData.totalPages}
                                    onClick={() => setImagePage((current) => Math.min(imagePageData.totalPages, current + 1))}
                                  >
                                    Next
                                  </button>
                                </div>
                                <span className="muted-text">Page {imagePageData.page} of {imagePageData.totalPages}</span>
                              </div>
                            </>
                          ) : (
                            <p className="muted-text">No uploaded images match the current search.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <button className="primary-button compact" onClick={() => void handleSaveRoom()}>
                    Save room
                  </button>
                  <button className="secondary-button compact" onClick={() => setRoomForm(emptyRoom)}>
                    Reset form
                  </button>
                </div>
              </article>

              <article className="admin-card room-preview-card">
                <h2>Preview</h2>
                {roomForm.image ? (
                  <div className="room-preview-panel">
                    <img src={resolveAssetUrl(roomForm.image)} alt={selectedRoomAsset?.title ?? 'Selected'} />
                    <div className="room-preview-footer">
                      <div className="room-preview-copy">
                        <strong>{selectedRoomAsset?.title ?? 'Selected image'}</strong>
                        <span>{selectedRoomAsset?.subtitle ?? roomForm.image}</span>
                      </div>
                      <button className="secondary-button compact" onClick={handleClearRoomImage}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="room-preview-empty">
                    <span className="room-preview-empty-icon">▨</span>
                    <p>No image selected</p>
                    <span className="muted-text">Use a template or pick an image from the library.</span>
                  </div>
                )}
              </article>
            </section>

            <section className="admin-card">
              <div className="section-head">
                <div>
                  <h2>Rooms</h2>
                  <p className="muted-text">Switch between a compact table and visual card grid.</p>
                </div>
                <div className="view-controls">
                  <input
                    className="search-filter"
                    placeholder="Search by USID, building or level"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                  <div className="toggle-group" role="group" aria-label="Room view toggle">
                    <button
                      className={`secondary-button compact ${roomView === 'table' ? 'is-active' : ''}`}
                      onClick={() => setRoomView('table')}
                    >
                      Table
                    </button>
                    <button
                      className={`secondary-button compact ${roomView === 'grid' ? 'is-active' : ''}`}
                      onClick={() => setRoomView('grid')}
                    >
                      Grid
                    </button>
                  </div>
                </div>
              </div>

              {filteredRooms.length === 0 ? <p className="muted-text empty-state">No rooms match the current filter.</p> : null}

              {roomView === 'table' ? (
                <div className="table-wrap rooms-table-wrap">
                  <table className="rooms-table">
                    <thead>
                      <tr>
                        <th>USID</th>
                        <th>Building</th>
                        <th>Level</th>
                        <th>Room</th>
                        <th>Door</th>
                        <th>Image</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRooms.map((room) => (
                        <tr key={room.usid}>
                          <td><span className="table-mono">{room.usid}</span></td>
                          <td>{room.building}</td>
                          <td>{room.level}</td>
                          <td>{room.room}</td>
                          <td>{room.door}</td>
                          <td>{room.image ? <span className="status-dot is-ok" /> : <span className="status-dot is-missing" />}</td>
                          <td>
                            <div className="table-actions">
                              <button className="secondary-button compact" onClick={() => setRoomForm(room)}>
                                Edit
                              </button>
                              <button className="danger-button compact" onClick={() => void handleDeleteRoom(room.usid)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rooms-grid">
                  {filteredRooms.map((room) => (
                    <article key={room.usid} className="room-card">
                      {room.image ? <img src={resolveAssetUrl(room.image)} alt={room.room} loading="lazy" decoding="async" /> : <div className="room-card-placeholder">No image</div>}
                      <strong>{room.usid}</strong>
                      <span>{room.building}</span>
                      <span>{room.level}</span>
                      <span>Room {room.room}</span>
                      <span>Door {room.door}</span>
                      <div className="button-row">
                        <button className="secondary-button compact" onClick={() => setRoomForm(room)}>
                          Edit
                        </button>
                        <button className="danger-button compact" onClick={() => void handleDeleteRoom(room.usid)}>
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'import' && (
          <div className="admin-tab-panel">
            <section className="admin-grid">
              <article className="admin-card emphasis-card">
                <div className="section-head">
                  <h2>Excel Import</h2>
                  <button className="secondary-button compact" onClick={() => void handleExportTemplate()}>
                    Export Template
                  </button>
                </div>
                <p className="muted-text">Download the template, fill in your rooms and upload the completed file. The import replaces the current room list.</p>
                <label
                  className="drop-zone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const file = event.dataTransfer.files?.[0]
                    if (file) {
                      void handleImportFile(file)
                    }
                  }}
                >
                  <span className="drop-zone-icon">⬆</span>
                  <strong>Drag and drop your Excel file</strong>
                  <span className="drop-zone-note">USID · Building · Level · Room · Door · Image</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void handleImportFile(file)
                      }
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
              </article>

              <article className="admin-card">
                <h2>How it works</h2>
                <ol className="import-steps">
                  <li>Click <strong>Export Template</strong> to download a pre-formatted Excel file.</li>
                  <li>Fill in the rows with your room data — one room per row.</li>
                  <li>Drag the completed file into the upload area or click to browse.</li>
                  <li>Confirm the import — this will replace all existing rooms.</li>
                </ol>
                <div className="import-stats">
                  <div className="import-stat">
                    <strong>{rooms.length}</strong>
                    <span>Current rooms</span>
                  </div>
                  <div className="import-stat">
                    <strong>{imagePageData.total}</strong>
                    <span>Available images</span>
                  </div>
                </div>
              </article>
            </section>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="admin-tab-panel">
            <section className="admin-card">
              <div className="section-head">
                <div>
                  <h2>Building Templates</h2>
                  <p className="muted-text">
                    {roomForm.building
                      ? matchingBuildingTemplates.length > 0
                        ? `Showing template matches for ${roomForm.building}.`
                        : `No saved template matches ${roomForm.building} yet.`
                      : 'Manage floor plan templates used on the kiosk start screen.'}
                  </p>
                </div>
                <div className="template-panel-actions">
                  <span className="template-count">{matchingBuildingTemplates.length} available</span>
                  <label className="upload-button compact">
                    {isUploadingTemplates ? 'Uploading...' : 'Upload templates'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(event) => {
                        void handleTemplateUpload(event.target.files)
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>

              {matchingBuildingTemplates.length > 0 ? (
                <div className="template-library-grid">
                  {matchingBuildingTemplates.map((template) => (
                    <article
                      key={template.fileName}
                      className={`template-card ${roomForm.image === template.path ? 'is-selected' : ''}`}
                    >
                      <div className="template-card-preview">
                        <img src={resolveAssetUrl(template.path)} alt={template.building} loading="lazy" decoding="async" />
                      </div>
                      <div className="template-card-body">
                        <div className="template-card-header">
                          <div className="template-card-meta">
                            <strong>{template.building}</strong>
                            <span>{template.fileName}</span>
                          </div>
                          <label className="template-visibility-toggle">
                            <input
                              type="checkbox"
                              checked={template.showOnHome}
                              onChange={(event) => {
                                void handleToggleBuildingTemplateVisibility(template, event.target.checked)
                              }}
                            />
                            <span>Kiosk</span>
                          </label>
                        </div>
                        <div className="template-card-rename">
                          <input
                            value={templateRenameDrafts[template.fileName] ?? template.name}
                            onChange={(event) => {
                              const nextValue = event.target.value
                              setTemplateRenameDrafts((current) => ({ ...current, [template.fileName]: nextValue }))
                            }}
                            placeholder="Display name"
                          />
                          <button className="primary-button compact" onClick={() => void handleRenameBuildingTemplate(template)}>
                            Rename
                          </button>
                        </div>
                        <div className="template-card-actions">
                          {roomForm.image === template.path ? (
                            <button
                              className="secondary-button compact"
                              onClick={() => { setRoomForm((c) => ({ ...c, image: '', building: '' })); setStatusNotice({ tone: 'info', message: 'Template deselected.' }) }}
                            >
                              Deselect
                            </button>
                          ) : (
                            <button
                              className="secondary-button compact"
                              onClick={() => handleUseBuildingTemplate(template)}
                            >
                              Use template
                            </button>
                          )}
                          <button className="danger-button compact" onClick={() => void handleDeleteBuildingTemplate(template)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-text">Upload a new template or add a building name to narrow existing matches.</p>
              )}
            </section>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="admin-tab-panel">
            <section className="admin-card">
              <div className="section-head">
                <div>
                  <h2>Image Library</h2>
                  <p className="muted-text">Upload images, rename them and assign to rooms.</p>
                </div>
                <label className="upload-button">
                  {isUploadingImages && imageUploadProgress
                    ? `Uploading ${imageUploadProgress.uploadedFiles}/${imageUploadProgress.totalFiles}`
                    : isUploadingImages
                      ? 'Uploading...'
                      : 'Upload images'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      void handleUpload(event.target.files)
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
              </div>

              <div className="toolbar-row image-library-toolbar">
                <input
                  className="search-filter"
                  placeholder="Search images by name"
                  value={imageQuery}
                  onChange={(event) => {
                    setImageQuery(event.target.value)
                    setImagePage(1)
                  }}
                />
                <span className="muted-text">{imagePageData.total} images total</span>
              </div>

              {imageUploadProgress ? (
                <div className="upload-progress-card" role="status" aria-live="polite" aria-atomic="true">
                  <div className="upload-progress-head">
                    <strong>Uploading image library</strong>
                    <span className="muted-text">
                      {imageUploadProgress.uploadedFiles} of {imageUploadProgress.totalFiles} images uploaded
                    </span>
                  </div>
                  <progress className="upload-progress-bar" value={imageUploadProgress.percent} max={100}>
                    {imageUploadProgress.percent}
                  </progress>
                </div>
              ) : null}

              {imagePageData.items.length === 0 ? <p className="muted-text">No images found for the current filter.</p> : null}

              <div className="image-library-grid">
                {imagePageData.items.map((image) => (
                  <article key={image.fileName} className="image-library-card">
                    <div className="image-library-preview">
                      <img src={resolveAssetUrl(image.path)} alt={image.name} loading="lazy" decoding="async" />
                    </div>
                    <div className="image-library-card-body">
                      <div className="image-library-meta">
                        <strong title={image.name}>{image.name}</strong>
                        <span title={image.fileName}>{image.fileName}</span>
                      </div>
                      <input
                        value={imageRenameDrafts[image.fileName] ?? image.name}
                        onChange={(event) => {
                          const nextValue = event.target.value
                          setImageRenameDrafts((current) => ({ ...current, [image.fileName]: nextValue }))
                        }}
                        placeholder="Rename image"
                      />
                      <div className="button-row image-library-actions">
                        <button className="secondary-button compact" onClick={() => { setRoomForm((current) => ({ ...current, image: image.path })); setActiveTab('rooms') }}>
                          Use for room
                        </button>
                        <button className="primary-button compact" onClick={() => void handleRenameImage(image)}>
                          Rename
                        </button>
                        <button className="danger-button compact" onClick={() => void handleDeleteImage(image)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="pagination-row">
                <button className="secondary-button compact" disabled={imagePageData.page <= 1} onClick={() => setImagePage((current) => Math.max(1, current - 1))}>
                  Previous
                </button>
                <span>
                  Page {imagePageData.page} of {imagePageData.totalPages}
                </span>
                <button
                  className="secondary-button compact"
                  disabled={imagePageData.page >= imagePageData.totalPages}
                  onClick={() => setImagePage((current) => Math.min(imagePageData.totalPages, current + 1))}
                >
                  Next
                </button>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="admin-tab-panel">
            <section className="dashboard-panels">
              <article className="admin-card">
                <div className="section-head">
                  <h2>Feedback</h2>
                  <a className="secondary-button compact link-button" href={getDownloadUrl('/api/admin/feedback.xlsx')}>
                    Export XLSX
                  </a>
                </div>
                <p className="muted-text">All feedback entries. Export for offline analysis.</p>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>USID</th>
                        <th>Rating</th>
                        <th>Comment</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedback.length === 0 ? (
                        <tr><td colSpan={4}>No feedback recorded yet.</td></tr>
                      ) : feedback.map((entry) => (
                        <tr key={entry.id}>
                          <td><span className="table-mono">{entry.usid}</span></td>
                          <td><span className="rating-badge">{['😡','😕','😐','🙂','😍'][entry.rating - 1]} {entry.rating}/5</span></td>
                          <td>{entry.comment || <span className="muted-text">No comment</span>}</td>
                          <td>{formatDate(entry.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="admin-card">
                <div className="section-head">
                  <h2>Search Report</h2>
                  <a className="secondary-button compact link-button" href={getDownloadUrl('/api/admin/report.xlsx')}>
                    Export XLSX
                  </a>
                </div>
                <p className="muted-text">All search entries with counters per USID.</p>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>USID</th>
                        <th>Searches</th>
                        <th>Up</th>
                        <th>Down</th>
                        <th>Last activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.length === 0 ? (
                        <tr><td colSpan={5}>No report data yet.</td></tr>
                      ) : report.map((entry) => (
                        <tr key={entry.usid}>
                          <td><span className="table-mono">{entry.usid}</span></td>
                          <td><strong>{entry.searches}</strong></td>
                          <td>{entry.up}</td>
                          <td>{entry.down}</td>
                          <td>{formatDate(entry.lastActivity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </div>
        )}
      </div>
      {modal && (
        <div className="modal-overlay" onClick={dismissModal}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{modal.title}</h3>
            <p>{modal.message}</p>
            <div className="modal-actions">
              {modal.onConfirm ? (
                <>
                  <button className="secondary-button" onClick={dismissModal}>Cancel</button>
                  <button className="danger-button" onClick={modal.onConfirm}>Confirm</button>
                </>
              ) : (
                <button className="primary-button" onClick={() => setModal(null)}>OK</button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function AdminAccessRedirect() {
  useEffect(() => {
    window.location.replace('/')
  }, [])

  return null
}

function App() {
  const isAdminRoute = window.location.pathname.startsWith('/admin')
  const blockAdminOnDevice = isAdminRoute && isLikelyIpadDevice()

  if (blockAdminOnDevice) {
    return <AdminAccessRedirect />
  }

  return isAdminRoute ? <AdminApp /> : <KioskApp />
}

export default App
