import { useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteRoom,
  getAdminSession,
  getBuildingTemplates,
  getDownloadUrl,
  getFeedback,
  getImages,
  getPublicBuildingTemplates,
  getReport,
  getRooms,
  importRooms,
  login,
  logout,
  renameImage,
  resolveAssetUrl,
  saveRoom,
  searchRoom,
  sendFeedback,
  uploadImages,
} from './api'
import './App.css'
import type { BuildingTemplate, FeedbackEntry, ReportEntry, Room, UploadedImage, UploadedImagePage } from './types'

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
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

const kioskDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const

function KioskApp() {
  const [input, setInput] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<BuildingTemplate | null>(null)
  const [buildingTemplates, setBuildingTemplates] = useState<BuildingTemplate[]>([])
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(45)
  const [rating, setRating] = useState<'up' | 'down' | null>(null)
  const [comment, setComment] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
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

  async function handleSendFeedback() {
    if (!selectedRoom || !rating) {
      window.alert('Please select thumbs up or down')
      return
    }

    if (comment.trim().length > 0 && comment.trim().length < 10) {
      window.alert('Comment must be at least 10 characters long')
      return
    }

    await sendFeedback(selectedRoom.usid, rating, comment.trim())
    setFeedbackSent(true)
  }

  function resetView() {
    setSelectedRoom(null)
    setSelectedTemplate(null)
    setInput('')
    setRating(null)
    setComment('')
    setFeedbackSent(false)
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
  }

  return (
    <main className="kiosk-shell">
      {!selectedRoom && !selectedTemplate ? (
        <section className="kiosk-home">
          <div className="kiosk-home-content">
            <img src="/logo.jpg" className="brand-logo" alt="Pathfinder logo" />
            <img src="/header.jpg" className="hero-image" alt="Office directions" />
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
                <p className="kiosk-template-title">Plan direkt oeffnen</p>
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
                <div className="feedback-row">
                  <button
                    className={`feedback-button ${rating === 'up' ? 'is-positive' : ''}`}
                    onClick={() => {
                      setRating('up')
                      setSecondsLeft((current) => current + (rating ? 0 : 15))
                    }}
                  >
                    👍
                  </button>
                  <button
                    className={`feedback-button ${rating === 'down' ? 'is-negative' : ''}`}
                    onClick={() => {
                      setRating('down')
                      setSecondsLeft((current) => current + (rating ? 0 : 15))
                    }}
                  >
                    👎
                  </button>
                  <input
                    className="feedback-input"
                    type="text"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Optional comment (min 10 chars)"
                    disabled={feedbackSent}
                  />
                  <button className="primary-button compact" disabled={feedbackSent} onClick={() => void handleSendFeedback()}>
                    Send
                  </button>
                </div>

                {feedbackSent ? <p className="thank-you">Thank you!</p> : null}
              </>
            ) : null}
          </div>
        </section>
      )}
    </main>
  )
}

function AdminApp() {
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
  const [imageRenameDrafts, setImageRenameDrafts] = useState<Record<string, string>>({})
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const [roomView, setRoomView] = useState<'grid' | 'table'>('table')

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
    if (!authenticated) {
      return
    }

    void Promise.all([getRooms(), getFeedback(), getReport(), getBuildingTemplates()])
      .then(([roomsResponse, feedbackResponse, reportResponse, templateResponse]) => {
        setRooms(roomsResponse)
        setFeedback(feedbackResponse)
        setReport(reportResponse)
        setBuildingTemplates(templateResponse)
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

  const recentFeedback = feedback.slice(0, 5)
  const recentReport = report.slice(0, 5)
  const totalSearches = report.reduce((sum, entry) => sum + entry.searches, 0)
  const totalPositive = feedback.filter((entry) => entry.rating === 'up').length
  const totalNegative = feedback.filter((entry) => entry.rating === 'down').length
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
    if (!window.confirm(`Delete room ${usid}? This cannot be undone.`)) {
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

      const shouldImport = window.confirm(
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
      const result = await uploadImages(selectedFiles)
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

  function handleUseBuildingTemplate(template: BuildingTemplate) {
    setRoomForm((current) => ({
      ...current,
      building: current.building || template.building,
      image: template.path,
    }))
    setStatusNotice({ tone: 'info', message: `Building template ${template.building} selected.` })
  }

  if (!authenticated) {
    return (
      <main className="admin-login-shell">
        <section className="admin-login-card">
          <h1>PATHFINDER Admin Panel</h1>
          <p>Remote access for room management, image uploads and exports.</p>
          <input
            className="admin-password"
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleLogin()
              }
            }}
          />
          <button className="primary-button" onClick={() => void handleLogin()}>
            Login
          </button>
          {loginError ? <p className="error-message centered">{loginError}</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>PATHFINDER Admin Panel</h1>
          <p>Manage rooms, imports, images and operational feedback from one place.</p>
        </div>
        <button className="secondary-button" onClick={() => void handleLogout()}>
          Logout
        </button>
      </header>

      {statusNotice ? <p className={`status-message is-${statusNotice.tone}`}>{statusNotice.message}</p> : null}

      <section className="stats-grid">
        <article className="stat-card emphasis-card">
          <span className="stat-label">Rooms</span>
          <strong className="stat-value">{rooms.length}</strong>
          <span className="stat-note">{formatRelativeCount(filteredRooms.length, 'result', 'results')} for the current filter</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Searches</span>
          <strong className="stat-value">{totalSearches}</strong>
          <span className="stat-note">{topSearch ? `Top USID ${topSearch.usid} with ${topSearch.searches}` : 'No searches yet'}</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Feedback</span>
          <strong className="stat-value">{feedback.length}</strong>
          <span className="stat-note">{totalPositive} up, {totalNegative} down</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Latest Activity</span>
          <strong className="stat-value small">{lastActivity ? formatDate(lastActivity) : 'No activity'}</strong>
          <span className="stat-note">Exports still contain the full dataset</span>
        </article>
      </section>

      <section className="admin-grid">
        <article className="admin-card emphasis-card">
          <h2>Room Editor</h2>
          <p className="muted-text">Update a room directly or use a saved building template before falling back to the image library.</p>
          <div className="form-grid">
            <input placeholder="USID" value={roomForm.usid} onChange={(event) => setRoomForm({ ...roomForm, usid: event.target.value.replace(/\D/g, '').slice(0, 6) })} />
            <input placeholder="Building" value={roomForm.building} onChange={(event) => setRoomForm({ ...roomForm, building: event.target.value })} />
            <input placeholder="Level" value={roomForm.level} onChange={(event) => setRoomForm({ ...roomForm, level: event.target.value })} />
            <input placeholder="Room" value={roomForm.room} onChange={(event) => setRoomForm({ ...roomForm, room: event.target.value })} />
            <input placeholder="Door" value={roomForm.door} onChange={(event) => setRoomForm({ ...roomForm, door: event.target.value })} />
            <input placeholder="Image path" value={roomForm.image} onChange={(event) => setRoomForm({ ...roomForm, image: event.target.value })} />
          </div>
          <div className="template-panel">
            <div className="template-panel-head">
              <div>
                <h3>Building Templates</h3>
                <p className="muted-text">
                  {roomForm.building
                    ? matchingBuildingTemplates.length > 0
                      ? `Showing template matches for ${roomForm.building}.`
                      : `No saved template matches ${roomForm.building} yet.`
                    : 'Choose one of the saved floor plan templates.'}
                </p>
              </div>
              <span className="template-count">{matchingBuildingTemplates.length} available</span>
            </div>

            {matchingBuildingTemplates.length > 0 ? (
              <div className="template-library-grid">
                {matchingBuildingTemplates.map((template) => (
                  <article
                    key={template.fileName}
                    className={`template-card ${roomForm.image === template.path ? 'is-selected' : ''}`}
                  >
                    <img src={resolveAssetUrl(template.path)} alt={template.building} />
                    <div className="template-card-meta">
                      <strong>{template.building}</strong>
                      <span>{template.fileName}</span>
                    </div>
                    <button
                      className="secondary-button compact"
                      onClick={() => handleUseBuildingTemplate(template)}
                    >
                      Use template
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-text">Add a building name or place more template files in FR2_Grundriss.</p>
            )}
          </div>
          {roomForm.image ? (
            <div className="selected-image-panel">
              <img src={resolveAssetUrl(roomForm.image)} alt="Selected room" />
              <span>{roomForm.image}</span>
            </div>
          ) : (
            <p className="muted-text">Select an image from the library below or paste a path manually.</p>
          )}
          <div className="button-row">
            <button className="primary-button compact" onClick={() => void handleSaveRoom()}>
              Save room
            </button>
            <button className="secondary-button compact" onClick={() => setRoomForm(emptyRoom)}>
              Reset form
            </button>
          </div>
        </article>

        <article className="admin-card">
          <div className="section-head">
            <h2>Excel Import</h2>
            <button className="secondary-button compact" onClick={() => void handleExportTemplate()}>
              Export Excel Template
            </button>
          </div>
          <p className="muted-text">Export the template, fill it in and upload the Excel file here.</p>
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
            Drag and drop your Excel file here
            <span className="drop-zone-note">Required columns: USID, Building, Level, Room, Door, Image</span>
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
          <p className="muted-text">The import replaces the current room list.</p>
        </article>
      </section>

      <section className="admin-card">
        <div className="section-head">
          <div>
            <h2>Image Library</h2>
            <p className="muted-text">Upload many images at once, rename them later and only load one page of results at a time.</p>
          </div>
          <label className="upload-button">
            {isUploadingImages ? 'Uploading...' : 'Upload images'}
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

        <div className="toolbar-row">
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

        {imagePageData.items.length === 0 ? <p className="muted-text">No images found for the current filter.</p> : null}

        <div className="image-library-grid">
          {imagePageData.items.map((image) => (
            <article key={image.fileName} className="image-library-card">
              <img src={resolveAssetUrl(image.path)} alt={image.name} />
              <div className="image-library-meta">
                <strong>{image.name}</strong>
                <span>{image.fileName}</span>
              </div>
              <input
                value={imageRenameDrafts[image.fileName] ?? image.name}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setImageRenameDrafts((current) => ({ ...current, [image.fileName]: nextValue }))
                }}
                placeholder="Rename image"
              />
              <div className="button-row">
                <button className="secondary-button compact" onClick={() => setRoomForm((current) => ({ ...current, image: image.path }))}>
                  Use for room
                </button>
                <button className="primary-button compact" onClick={() => void handleRenameImage(image)}>
                  Rename
                </button>
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

      <section className="admin-card">
        <div className="section-head">
          <div>
            <h2>Rooms</h2>
            <p className="muted-text">Switch between a compact table and visual card grid depending on the task.</p>
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
                    <td>{room.usid}</td>
                    <td>{room.building}</td>
                    <td>{room.level}</td>
                    <td>{room.room}</td>
                    <td>{room.door}</td>
                    <td>{room.image ? 'Available' : 'Missing'}</td>
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
                {room.image ? <img src={resolveAssetUrl(room.image)} alt={room.room} /> : <div className="room-card-placeholder">No image</div>}
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

      <section className="admin-grid bottom-grid">
        <article className="admin-card">
          <div className="section-head">
            <h2>Feedback</h2>
            <a className="secondary-button compact link-button" href={getDownloadUrl('/api/admin/feedback.xlsx')}>
              Export Feedback XLSX
            </a>
          </div>
          <p className="muted-text">Shows the latest 5 feedback entries. Export for the full list.</p>

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
                {recentFeedback.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.usid}</td>
                    <td>{entry.rating}</td>
                    <td>{entry.comment || 'No comment'}</td>
                    <td>{formatDate(entry.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-card">
          <div className="section-head">
            <h2>Report</h2>
            <a className="secondary-button compact link-button" href={getDownloadUrl('/api/admin/report.xlsx')}>
              Export Report XLSX
            </a>
          </div>
          <p className="muted-text">Shows the latest 5 report entries with search counter per USID. Export for the full list.</p>

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
                {recentReport.map((entry) => (
                  <tr key={entry.usid}>
                    <td>{entry.usid}</td>
                    <td>{entry.searches}</td>
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
    </main>
  )
}

function App() {
  const isAdminRoute = window.location.pathname.startsWith('/admin')
  return isAdminRoute ? <AdminApp /> : <KioskApp />
}

export default App
