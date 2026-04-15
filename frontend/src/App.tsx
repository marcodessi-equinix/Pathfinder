import { useEffect, useEffectEvent, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ApiError,
  bulkDeleteBuildingTemplates,
  bulkDeleteImages,
  bulkDeleteRooms,
  clearAnalytics,
  clearFeedback,
  deleteQuickLink,
  deleteBuildingTemplate,
  deleteImage,
  deleteRoom,
  getAdminSession,
  getAdminQuickLinks,
  getBuildingTemplates,
  getChartData,
  getDownloadUrl,
  getFeedback,
  getIbxConfig,
  getImages,
  getPublicBuildingTemplates,
  getPublicRoom,
  getQuickLinks,
  getReport,
  getRooms,
  importRooms,
  login,
  logout,
  renameBuildingTemplate,
  renameImage,
  resolveAssetUrl,
  saveQuickLink,
  saveRoom,
  searchRoom,
  searchSuggest,
  setBuildingTemplateVisibility,
  sendFeedback,
  updateQuickLink,
  uploadBuildingTemplates,
  uploadImages,
  openKioskLiveUpdates,
} from './api'
import './App.css'
import LoginPage from './components/admin-login/LoginPage'
import type { BuildingTemplate, ChartData, FeedbackEntry, IbxConfig, QuickLink, QuickLinkForm, ReportEntry, Room, UploadedImage, UploadedImagePage } from './types'
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

type LightboxAsset = {
  src: string
  title: string
  subtitle?: string
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
const feedbackOptions = [
  { value: 1, label: 'Not helpful', shortLabel: 'No', tone: 'critical', badgeTone: 'negative', emoji: '👎' },
  { value: 2, label: 'Partly helpful', shortLabel: 'Okay', tone: 'neutral', badgeTone: 'neutral', emoji: '👌' },
  { value: 3, label: 'Helpful', shortLabel: 'Yes', tone: 'excellent', badgeTone: 'positive', emoji: '👍' },
] as const
const emptyQuickLinkForm: QuickLinkForm = { label: '', usid: '', sortOrder: 0 }
const chartTooltipContentStyle = {
  background: 'var(--chart-tooltip-bg)',
  border: '1px solid var(--chart-tooltip-border)',
  borderRadius: 12,
  boxShadow: 'var(--chart-tooltip-shadow)',
}
const chartTooltipLabelStyle = {
  color: 'var(--chart-tooltip-text)',
  fontWeight: 700,
}
const chartTooltipItemStyle = {
  color: 'var(--chart-tooltip-muted)',
}
const chartHoverCursorLine = {
  stroke: 'var(--chart-cursor-line)',
  strokeWidth: 1,
}
const chartHoverCursorFill = {
  fill: 'var(--chart-cursor-fill)',
}
const chartRatingPalette = [
  'var(--chart-rating-1)',
  'var(--chart-rating-2)',
  'var(--chart-rating-3)',
] as const
const chartScalePalette = [
  'var(--chart-scale-1)',
  'var(--chart-scale-2)',
  'var(--chart-scale-3)',
  'var(--chart-scale-4)',
  'var(--chart-scale-5)',
  'var(--chart-scale-6)',
  'var(--chart-scale-7)',
] as const
const adminThemeStorageKey = 'pathfinder-admin-theme'

type AdminTheme = 'dark' | 'light'
type FeedbackOption = (typeof feedbackOptions)[number]

function normalizeFeedbackRating(value: number) {
  if (value <= 2) {
    return 1
  }

  if (value === 3) {
    return 2
  }

  return 3
}

function getFeedbackOption(value: number): FeedbackOption {
  return feedbackOptions[Math.max(0, Math.min(feedbackOptions.length - 1, normalizeFeedbackRating(value) - 1))]
}

const feedbackScaleMax = feedbackOptions.length

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatLockout(secondsLeft: number) {
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function sanitizeKioskInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9\-_]/g, '').slice(0, 16)
}

function getTemplateBadgeLabel(value: string) {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, ' ').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return 'PF'
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function toggleId(current: string[], id: string) {
  return current.includes(id)
    ? current.filter((entry) => entry !== id)
    : [...current, id]
}

function FeedbackGlyph({ value }: { value: number }) {
  const activeBars = normalizeFeedbackRating(value)

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="feedback-glyph">
      {feedbackOptions.map((_, index) => {
        const isActive = index < activeBars
        const height = 14 + index * 8

        return (
          <rect
            key={index}
            x={8 + index * 12}
            y={36 - height}
            width="8"
            height={height}
            rx="4"
            className={isActive ? 'is-active' : 'is-inactive'}
          />
        )
      })}
    </svg>
  )
}

type KioskViewerTransform = {
  scale: number
  x: number
  y: number
}

const defaultKioskViewerTransform: KioskViewerTransform = {
  scale: 1,
  x: 0,
  y: 0,
}

type KioskViewerPointer = {
  startX: number
  startY: number
  x: number
  y: number
}

const kioskViewerMinScale = 1
const kioskViewerMaxScale = 4
const kioskViewerDoubleTapDelayMs = 280
const kioskViewerDoubleTapDistancePx = 24
const kioskViewerDoubleTapScale = 2.4

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function KioskImageViewer({ asset, onClose }: { asset: LightboxAsset | null; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const pointersRef = useRef(new Map<number, KioskViewerPointer>())
  const pinchDistanceRef = useRef<number | null>(null)
  const panOriginRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const pendingTransformRef = useRef<KioskViewerTransform | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  const transformRef = useRef<KioskViewerTransform>(defaultKioskViewerTransform)
  const [transform, setTransform] = useState<KioskViewerTransform>(defaultKioskViewerTransform)
  const [showGestureHint, setShowGestureHint] = useState(true)

  function readMetrics() {
    const stage = stageRef.current
    const image = imageRef.current

    if (!stage || !image) {
      return null
    }

    return {
      width: stage.clientWidth,
      height: stage.clientHeight,
      imageWidth: image.clientWidth,
      imageHeight: image.clientHeight,
      rect: stage.getBoundingClientRect(),
    }
  }

  function clampTransform(next: KioskViewerTransform) {
    const scale = clampNumber(next.scale, kioskViewerMinScale, kioskViewerMaxScale)
    const metrics = readMetrics()

    if (!metrics || metrics.imageWidth === 0 || metrics.imageHeight === 0) {
      return {
        scale,
        x: scale <= kioskViewerMinScale ? 0 : next.x,
        y: scale <= kioskViewerMinScale ? 0 : next.y,
      }
    }

    const maxX = Math.max(0, (metrics.imageWidth * scale - metrics.width) / 2)
    const maxY = Math.max(0, (metrics.imageHeight * scale - metrics.height) / 2)

    return {
      scale,
      x: maxX === 0 ? 0 : clampNumber(next.x, -maxX, maxX),
      y: maxY === 0 ? 0 : clampNumber(next.y, -maxY, maxY),
    }
  }

  function commitTransform(next: KioskViewerTransform, immediate = false) {
    const clamped = clampTransform(next)
    transformRef.current = clamped

    if (immediate) {
      pendingTransformRef.current = null
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      setTransform((current) => (
        current.scale === clamped.scale && current.x === clamped.x && current.y === clamped.y ? current : clamped
      ))
      return
    }

    pendingTransformRef.current = clamped
    if (frameRef.current !== null) {
      return
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      const pending = pendingTransformRef.current
      pendingTransformRef.current = null

      if (!pending) {
        return
      }

      setTransform((current) => (
        current.scale === pending.scale && current.x === pending.x && current.y === pending.y ? current : pending
      ))
    })
  }

  function resetTransform(immediate = false) {
    commitTransform(defaultKioskViewerTransform, immediate)
  }

  const handleViewerKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose()
      return
    }

    if (event.key === '0') {
      resetTransform()
    }
  })

  const handleViewerResize = useEffectEvent(() => {
    commitTransform(transformRef.current, true)
  })

  function zoomAtPoint(targetScale: number, clientX: number, clientY: number) {
    const metrics = readMetrics()
    const current = transformRef.current

    if (!metrics) {
      commitTransform({ scale: targetScale, x: 0, y: 0 })
      return
    }

    const nextScale = clampNumber(targetScale, kioskViewerMinScale, kioskViewerMaxScale)
    if (nextScale <= kioskViewerMinScale) {
      resetTransform()
      return
    }

    const focalX = clientX - (metrics.rect.left + metrics.rect.width / 2)
    const focalY = clientY - (metrics.rect.top + metrics.rect.height / 2)
    const ratio = nextScale / current.scale

    commitTransform({
      scale: nextScale,
      x: focalX - (focalX - current.x) * ratio,
      y: focalY - (focalY - current.y) * ratio,
    })
  }

  const handleViewerWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault()
    const zoomFactor = event.deltaY < 0 ? 1.14 : 0.88
    zoomAtPoint(transformRef.current.scale * zoomFactor, event.clientX, event.clientY)
    setShowGestureHint(false)
  })

  function beginPan(pointerId: number) {
    const pointer = pointersRef.current.get(pointerId)
    if (!pointer || transformRef.current.scale <= kioskViewerMinScale) {
      panOriginRef.current = null
      return
    }

    panOriginRef.current = {
      pointerId,
      startX: pointer.x,
      startY: pointer.y,
      originX: transformRef.current.x,
      originY: transformRef.current.y,
    }
  }

  function releasePointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // noop
      }
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    setShowGestureHint(false)
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    })

    const pointers = Array.from(pointersRef.current.values())
    if (pointers.length === 1) {
      beginPan(event.pointerId)
      return
    }

    if (pointers.length === 2) {
      const [first, second] = pointers
      pinchDistanceRef.current = Math.hypot(second.x - first.x, second.y - first.y)
      panOriginRef.current = null
      lastTapRef.current = null
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const currentPointer = pointersRef.current.get(event.pointerId)
    if (!currentPointer) {
      return
    }

    currentPointer.x = event.clientX
    currentPointer.y = event.clientY

    const pointers = Array.from(pointersRef.current.values())
    if (pointers.length === 2) {
      const [first, second] = pointers
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      const previousDistance = pinchDistanceRef.current

      if (!previousDistance || previousDistance <= 0) {
        pinchDistanceRef.current = distance
        return
      }

      const centerX = (first.x + second.x) / 2
      const centerY = (first.y + second.y) / 2
      const currentTransform = transformRef.current
      const nextScale = clampNumber(currentTransform.scale * (distance / previousDistance), kioskViewerMinScale, kioskViewerMaxScale)
      const metrics = readMetrics()

      if (metrics) {
        const focalX = centerX - (metrics.rect.left + metrics.rect.width / 2)
        const focalY = centerY - (metrics.rect.top + metrics.rect.height / 2)
        const ratio = nextScale / currentTransform.scale

        commitTransform({
          scale: nextScale,
          x: focalX - (focalX - currentTransform.x) * ratio,
          y: focalY - (focalY - currentTransform.y) * ratio,
        })
      }

      pinchDistanceRef.current = distance
      return
    }

    if (pointers.length === 1 && panOriginRef.current && panOriginRef.current.pointerId === event.pointerId) {
      commitTransform({
        scale: transformRef.current.scale,
        x: panOriginRef.current.originX + (currentPointer.x - panOriginRef.current.startX),
        y: panOriginRef.current.originY + (currentPointer.y - panOriginRef.current.startY),
      })
    }
  }

  function maybeHandleTap(pointer: KioskViewerPointer) {
    const movedDistance = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY)
    if (movedDistance > 12) {
      lastTapRef.current = null
      return
    }

    const now = Date.now()
    const previousTap = lastTapRef.current
    if (
      previousTap
      && now - previousTap.time <= kioskViewerDoubleTapDelayMs
      && Math.hypot(previousTap.x - pointer.x, previousTap.y - pointer.y) <= kioskViewerDoubleTapDistancePx
    ) {
      if (transformRef.current.scale > 1.4) {
        resetTransform()
      } else {
        zoomAtPoint(kioskViewerDoubleTapScale, pointer.x, pointer.y)
      }
      lastTapRef.current = null
      return
    }

    lastTapRef.current = {
      time: now,
      x: pointer.x,
      y: pointer.y,
    }
  }

  function handlePointerRelease(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointersRef.current.get(event.pointerId)
    const activePointerCount = pointersRef.current.size
    releasePointer(event)
    pointersRef.current.delete(event.pointerId)

    if (activePointerCount >= 2) {
      const remainingPointers = Array.from(pointersRef.current.entries())
      pinchDistanceRef.current = remainingPointers.length === 2
        ? Math.hypot(remainingPointers[1][1].x - remainingPointers[0][1].x, remainingPointers[1][1].y - remainingPointers[0][1].y)
        : null

      if (remainingPointers.length === 1) {
        beginPan(remainingPointers[0][0])
      }

      lastTapRef.current = null
      return
    }

    pinchDistanceRef.current = null
    panOriginRef.current = null

    if (pointer) {
      maybeHandleTap(pointer)
    }
  }

  function handleDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (transformRef.current.scale > 1.4) {
      resetTransform()
      return
    }

    zoomAtPoint(kioskViewerDoubleTapScale, event.clientX, event.clientY)
    setShowGestureHint(false)
  }

  useEffect(() => {
    transformRef.current = transform

    if (!imageRef.current) {
      return
    }

    imageRef.current.style.setProperty('--kiosk-viewer-offset-x', `${transform.x}px`)
    imageRef.current.style.setProperty('--kiosk-viewer-offset-y', `${transform.y}px`)
    imageRef.current.style.setProperty('--kiosk-viewer-scale', String(transform.scale))
  }, [transform])

  useEffect(() => {
    if (!asset) {
      return undefined
    }

    const hintTimer = window.setTimeout(() => {
      setShowGestureHint(false)
    }, 4800)

    return () => window.clearTimeout(hintTimer)
  }, [asset])

  useEffect(() => {
    if (!asset) {
      return undefined
    }

    document.addEventListener('keydown', handleViewerKeyDown)
    return () => document.removeEventListener('keydown', handleViewerKeyDown)
  }, [asset, onClose])

  useEffect(() => {
    if (!asset) {
      return undefined
    }

    const viewportMeta = document.querySelector('meta[name="viewport"]')
    if (!(viewportMeta instanceof HTMLMetaElement)) {
      return undefined
    }

    const previousContent = viewportMeta.content
    viewportMeta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

    return () => {
      viewportMeta.content = previousContent
    }
  }, [asset])

  useEffect(() => {
    if (!asset) {
      return undefined
    }

    const stage = stageRef.current
    if (!stage) {
      return undefined
    }

    stage.addEventListener('wheel', handleViewerWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleViewerWheel)
  }, [asset])

  useEffect(() => {
    if (!asset) {
      return undefined
    }

    const stage = stageRef.current
    const image = imageRef.current
    if (!stage || !image || typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver(() => {
      handleViewerResize()
    })

    observer.observe(stage)
    observer.observe(image)

    return () => observer.disconnect()
  }, [asset])

  useEffect(() => {
    const pointers = pointersRef.current

    return () => {
      pointers.clear()
      pinchDistanceRef.current = null
      panOriginRef.current = null
      pendingTransformRef.current = null

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  if (!asset) {
    return null
  }

  return (
    <div className="kiosk-viewer-overlay" onClick={onClose}>
      <div className="kiosk-viewer-dialog" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="kiosk-viewer-back-button"
          onClick={onClose}
          aria-label="Back to result"
        >
          <span aria-hidden="true">←</span>
          <span>Back</span>
        </button>
        <div
          className={`kiosk-viewer-stage ${transform.scale > 1 ? 'is-zoomed' : ''}`}
          ref={stageRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerRelease}
          onPointerCancel={handlePointerRelease}
          onDoubleClick={handleDoubleClick}
        >
          <img
            ref={imageRef}
            src={asset.src}
            alt={asset.title}
            className="kiosk-viewer-image"
            draggable={false}
            decoding="async"
            onLoad={() => commitTransform(transformRef.current, true)}
          />
          <div className="kiosk-viewer-caption">
            <span>{asset.title}{asset.subtitle ? ` · ${asset.subtitle}` : ''}</span>
            <strong>{Math.round(transform.scale * 100)}%</strong>
          </div>
          {showGestureHint ? (
            <div className="kiosk-viewer-gesture-hint" aria-hidden="true">
              Pinch to zoom. Double-tap resets. Tap outside to close.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ImageLightbox({ asset, onClose }: { asset: LightboxAsset | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const zoomClassName = `viewer-image is-zoom-${String(zoom).replace('.', '-')}`

  useEffect(() => {
    if (!asset) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [asset, onClose])

  if (!asset) {
    return null
  }

  async function handleFullscreen() {
    if (!dialogRef.current) {
      return
    }

    if (document.fullscreenElement === dialogRef.current) {
      await document.exitFullscreen()
      return
    }

    await dialogRef.current.requestFullscreen()
  }

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <div className="viewer-dialog" ref={dialogRef} onClick={(event) => event.stopPropagation()}>
        <div className="viewer-toolbar">
          <div className="viewer-copy">
            <strong>{asset.title}</strong>
            {asset.subtitle ? <span>{asset.subtitle}</span> : null}
          </div>
          <div className="viewer-actions">
            <button className="secondary-button compact" onClick={() => setZoom((current) => Math.max(1, current - 0.25))}>
              Zoom -
            </button>
            <button className="secondary-button compact" onClick={() => setZoom((current) => Math.min(4, current + 0.25))}>
              Zoom +
            </button>
            <button className="secondary-button compact" onClick={() => setZoom(1)}>
              Reset
            </button>
            <button className="secondary-button compact" onClick={() => void handleFullscreen()}>
              Full Screen
            </button>
            <button className="danger-button compact" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="viewer-canvas">
          <img src={asset.src} alt={asset.title} className={zoomClassName} />
        </div>
      </div>
    </div>
  )
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

  function resolveCellNumber(cell: { value: unknown; text: string }): string {
    const v = cell.value
    if (typeof v === 'number') return String(Math.round(v))
    // Formula cells: { formula, result }
    if (v !== null && typeof v === 'object' && 'result' in v) {
      const r = (v as { result: unknown }).result
      if (typeof r === 'number') return String(Math.round(r))
      if (typeof r === 'string') return r.trim()
    }
    return String(cell.text ?? '').trim()
  }

  const parsed = rows
    .map((row) => {
      const values = Object.fromEntries(
        headers.map((header: string, index: number) => {
          const cell = row.getCell(index + 1)
          return [header, resolveCellNumber(cell)]
        }),
      )
      // Zero-pad USID to 6 digits if Excel stripped leading zeros (stored as number)
      const rawUsid = values.usid ?? ''
      const usid = /^\d{1,5}$/.test(rawUsid) ? rawUsid.padStart(6, '0') : rawUsid
      return {
        usid,
        building: values.building ?? '',
        level: values.level ?? '',
        room: values.room ?? '',
        door: values.door ?? '',
        image: values.image ?? '',
      }
    })
    .filter((row) => Object.values(row).some((value) => value.length > 0))

  // Validate required fields before sending to the backend
  const requiredFields = ['usid', 'building', 'level', 'room', 'door'] as const
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i]
    for (const field of requiredFields) {
      if (!row[field]) {
        throw new Error(`Row ${i + 2}: column "${field}" is empty or missing.`)
      }
    }
    if (!/^[A-Za-z0-9\-_]{1,16}$/.test(row.usid)) {
      throw new Error(`Row ${i + 2}: USID "${row.usid}" contains invalid characters or is too long.`)
    }
  }

  return parsed
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

function isLikelyIpadDevice() {
  const userAgent = navigator.userAgent
  return /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
}

function KioskApp() {
  const [input, setInput] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<BuildingTemplate | null>(null)
  const [buildingTemplates, setBuildingTemplates] = useState<BuildingTemplate[]>([])
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([])
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<Room[]>([])
  const [secondsLeft, setSecondsLeft] = useState(45)
  const [rating, setRating] = useState<number | null>(null)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState(0)
  const [lightboxAsset, setLightboxAsset] = useState<LightboxAsset | null>(null)
  const resetTimeoutRef = useRef<number | null>(null)
  const debounceRef = useRef<number | null>(null)
  const kioskInputRef = useRef<HTMLInputElement | null>(null)
  const selectedRoomRef = useRef<Room | null>(null)
  const selectedTemplateRef = useRef<BuildingTemplate | null>(null)
  const lightboxAssetRef = useRef<LightboxAsset | null>(null)
  const liveSyncTimerRef = useRef<number | null>(null)
  const refreshKioskContentRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    document.title = 'PATHFINDER'
  }, [])

  useEffect(() => {
    selectedRoomRef.current = selectedRoom
  }, [selectedRoom])

  useEffect(() => {
    selectedTemplateRef.current = selectedTemplate
  }, [selectedTemplate])

  useEffect(() => {
    lightboxAssetRef.current = lightboxAsset
  }, [lightboxAsset])

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
    void getQuickLinks()
      .then(setQuickLinks)
      .catch(() => setQuickLinks([]))
  }, [])

  refreshKioskContentRef.current = async () => {
    const [templates, links] = await Promise.all([
      getPublicBuildingTemplates().catch(() => []),
      getQuickLinks().catch(() => []),
    ])

    setBuildingTemplates(templates)
    setQuickLinks(links)

    const currentRoom = selectedRoomRef.current
    if (currentRoom) {
      try {
        const nextRoom = await getPublicRoom(currentRoom.usid)
        setSelectedRoom(nextRoom)

        if (lightboxAssetRef.current) {
          setLightboxAsset({
            src: resolveAssetUrl(nextRoom.image),
            title: `${nextRoom.building} ${nextRoom.room}`,
            subtitle: `Door ${nextRoom.door}`,
          })
        }
      } catch {
        setSelectedRoom(null)
        setLightboxAsset(null)
        setError('This destination was updated. Please search again.')
      }

      return
    }

    const currentTemplate = selectedTemplateRef.current
    if (!currentTemplate) {
      return
    }

    const nextTemplate = templates.find((template) => template.fileName === currentTemplate.fileName) ?? null
    if (!nextTemplate) {
      setSelectedTemplate(null)
      setLightboxAsset(null)
      setError('This plan was updated. Please open it again.')
      return
    }

    setSelectedTemplate(nextTemplate)

    if (lightboxAssetRef.current) {
      setLightboxAsset({
        src: resolveAssetUrl(nextTemplate.path),
        title: nextTemplate.building,
        subtitle: nextTemplate.fileName,
      })
    }
  }

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      const fallbackTimer = window.setInterval(() => {
        void refreshKioskContentRef.current()
      }, 5000)

      return () => window.clearInterval(fallbackTimer)
    }

    const eventSource = openKioskLiveUpdates()
    const scheduleRefresh = () => {
      if (liveSyncTimerRef.current) {
        window.clearTimeout(liveSyncTimerRef.current)
      }

      liveSyncTimerRef.current = window.setTimeout(() => {
        liveSyncTimerRef.current = null
        void refreshKioskContentRef.current()
      }, 120)
    }

    eventSource.addEventListener('sync', scheduleRefresh)

    return () => {
      if (liveSyncTimerRef.current) {
        window.clearTimeout(liveSyncTimerRef.current)
      }

      eventSource.removeEventListener('sync', scheduleRefresh)
      eventSource.close()
    }
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
          setFeedbackSent(false)
          return 45
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [selectedRoom, selectedTemplate])

  useEffect(() => {
    if (lockoutSecondsLeft <= 0) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setLockoutSecondsLeft((current) => (current <= 1 ? 0 : current - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [lockoutSecondsLeft])

  useEffect(() => {
    if (selectedRoom || selectedTemplate) {
      return undefined
    }

    const focusTimer = window.setTimeout(() => {
      kioskInputRef.current?.focus()
    }, 120)

    if (resetTimeoutRef.current) {
      window.clearTimeout(resetTimeoutRef.current)
    }

    if (input.length > 0) {
      resetTimeoutRef.current = window.setTimeout(() => {
        setInput('')
      }, 12000)
    }

    return () => {
      window.clearTimeout(focusTimer)
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [input, selectedRoom, selectedTemplate])

  useEffect(() => {
    if (suggestions.length === 0) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSuggestions([])
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [suggestions])

  async function runSearch(usid: string) {
    if (usid.length < 3) {
      setError('Enter at least 3 characters.')
      return
    }

    if (lockoutSecondsLeft > 0) return

    setIsSearching(true)
    setError('')
    setSuggestions([])

    try {
      const room = await searchRoom(usid)
      setSelectedRoom(room)
      setSelectedTemplate(null)
      setSecondsLeft(45)
      setRating(null)
      setFeedbackSent(false)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 429) {
        setLockoutSecondsLeft(requestError.retryAfterSeconds ?? 300)
      } else {
        // 404: try fuzzy suggestions
        try {
          const result = await searchSuggest(usid)
          setSuggestions(result.suggestions)
        } catch {
          // suggestions are optional
        }
      }
      setError(requestError instanceof Error ? requestError.message : 'No room found')
    } finally {
      setIsSearching(false)
    }
  }

  function updateInput(nextValue: string) {
    const sanitized = sanitizeKioskInput(nextValue)
    setInput(sanitized)
    setError('')
    setSuggestions([])

    if (debounceRef.current) window.clearTimeout(debounceRef.current)

    if (sanitized.length >= 3 && lockoutSecondsLeft <= 0) {
      debounceRef.current = window.setTimeout(() => {
        void runSearch(sanitized)
      }, 500)
    }
  }

  async function handleSmileyClick(value: number) {
    if (!selectedRoom || feedbackSent) return
    setRating(value)
    setFeedbackSent(true)
    setSecondsLeft((current) => current + 10)
    await sendFeedback(selectedRoom.usid, value, '')
  }

  function resetView() {
    setSelectedRoom(null)
    setSelectedTemplate(null)
    setInput('')
    setRating(null)
    setFeedbackSent(false)
    setError('')
    setSuggestions([])
    setSecondsLeft(45)
    setLightboxAsset(null)
  }

  function handleTemplatePreview(template: BuildingTemplate) {
    setSelectedTemplate(template)
    setSelectedRoom(null)
    setError('')
    setSecondsLeft(45)
    setRating(null)
    setFeedbackSent(false)
  }

  function handleOpenLightbox() {
    if (selectedRoom?.image) {
      setLightboxAsset({
        src: resolveAssetUrl(selectedRoom.image),
        title: `${selectedRoom.building} ${selectedRoom.room}`,
        subtitle: `Door ${selectedRoom.door}`,
      })
      return
    }

    if (selectedTemplate) {
      setLightboxAsset({
        src: resolveAssetUrl(selectedTemplate.path),
        title: selectedTemplate.building,
        subtitle: selectedTemplate.fileName,
      })
    }
  }

  function handleSuggestionSelect(room: Room) {
    setError('')
    setSuggestions([])
    setInput(room.usid)
    void runSearch(room.usid)
  }

  const resultImageSrc = selectedRoom?.image
    ? resolveAssetUrl(selectedRoom.image)
    : selectedTemplate
      ? resolveAssetUrl(selectedTemplate.path)
      : ''
  const resultImageAlt = selectedRoom
    ? `Route to room ${selectedRoom.room}`
    : selectedTemplate
      ? selectedTemplate.building
      : 'Selected route image'
  const hasResultImage = resultImageSrc.length > 0

  return (
    <main className="kiosk-shell">
      <div className="kiosk-rotate-overlay" role="status" aria-live="polite">
        <strong>Rotate iPad to landscape</strong>
        <span>The kiosk is optimized for horizontal use.</span>
      </div>
      {!selectedRoom && !selectedTemplate ? (
        <section className="kiosk-home">
          <div className="kiosk-home-content">
            <div className="kiosk-top-row kiosk-top-row--basic">
              <div className="kiosk-home-heading">
                <img src="/header.jpg" className="hero-image hero-image--basic" alt="Office directions" />
                <p className="kiosk-home-kicker">Pathfinder</p>
                <h1 className="kiosk-home-title">Find your destination</h1>
                <p className="kiosk-home-subtitle">Enter a room code to open the route.</p>
              </div>
            </div>

            <div className="search-area search-area--native">
              <div className="kiosk-entry-card" onClick={() => kioskInputRef.current?.focus()}>
                <div className="kiosk-entry-copy">
                  <p className="search-label">Find your destination</p>
                  <p className="search-helper-text">Type your room code — search starts automatically.</p>
                </div>

                <input
                  ref={kioskInputRef}
                  className="kiosk-native-input"
                  type="text"
                  value={input}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  maxLength={16}
                  placeholder="Destination code"
                  aria-label="Destination code"
                  disabled={isSearching || lockoutSecondsLeft > 0}
                  onChange={(event) => updateInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      if (debounceRef.current) window.clearTimeout(debounceRef.current)
                      event.preventDefault()
                      void runSearch(input)
                    }
                  }}
                />

                <div className="kiosk-entry-meta">
                  <span className="kiosk-display-caption">{input.length > 0 ? `${input.length}/16` : 'A-Z · 0-9'}</span>
                  {lockoutSecondsLeft > 0 ? <span className="kiosk-lockout-pill">Locked for {formatLockout(lockoutSecondsLeft)}</span> : null}
                </div>
              </div>

              {isSearching ? <p className="status-message is-info">Searching…</p> : null}
              {error && !isSearching ? (
                <div className="kiosk-error-block">
                  <p className="error-message">{error}</p>
                </div>
              ) : null}
            </div>

            {(quickLinks.length > 0 || buildingTemplates.filter((t) => t.showOnHome).length > 0) ? (
              <section className="kiosk-template-section" aria-label="Quick links">
                <div className="kiosk-template-heading">
                  <p>Quick access</p>
                </div>
                <div className="kiosk-template-grid">
                  {quickLinks.map((ql) => (
                    <button
                      key={ql.id}
                      type="button"
                      className="kiosk-template-button"
                      onClick={() => {
                        setInput(ql.usid)
                        void runSearch(ql.usid)
                      }}
                    >
                      <span className="template-badge">{getTemplateBadgeLabel(ql.label)}</span>
                      <span>{ql.label}</span>
                    </button>
                  ))}
                  {quickLinks.length === 0 && buildingTemplates.filter((t) => t.showOnHome).map((template) => (
                    <button
                      key={template.fileName}
                      type="button"
                      className="kiosk-template-button"
                      onClick={() => handleTemplatePreview(template)}
                    >
                      <span className="template-badge">{getTemplateBadgeLabel(template.building)}</span>
                      <span>{template.building}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      ) : (
        <section className={`result-shell ${selectedRoom ? 'result-shell--room' : 'result-shell--template'}`}>
          <div className={`result-content ${selectedRoom ? 'result-content--room' : 'result-content--template'}`}>
            <div className="result-header">
              <button className="back-button" onClick={resetView} aria-label="Back to search">
                ←
              </button>

              <div className="result-header-info" aria-label={selectedRoom ? 'Destination details' : 'Selected plan details'}>
                {selectedRoom ? (
                  <>
                    <span className="result-inline-chip">
                      <strong>Building</strong>
                      <span>{selectedRoom.building}</span>
                    </span>
                    <span className="result-inline-chip">
                      <strong>Level</strong>
                      <span>{selectedRoom.level}</span>
                    </span>
                    <span className="result-inline-chip">
                      <strong>Room</strong>
                      <span>{selectedRoom.room}</span>
                    </span>
                    <span className="result-inline-chip">
                      <strong>Door</strong>
                      <span>{selectedRoom.door}</span>
                    </span>
                  </>
                ) : selectedTemplate ? (
                  <>
                    <span className="result-inline-chip result-inline-chip--quiet">
                      <strong>Site plan</strong>
                    </span>
                    <span className="result-inline-chip">
                      <strong>Area</strong>
                      <span>{selectedTemplate.building}</span>
                    </span>
                  </>
                ) : null}
              </div>

              <div className="result-header-actions">
                <div className="timer-box">
                  <span>{secondsLeft}</span>s
                </div>
              </div>
            </div>

            {hasResultImage ? (
              <button
                type="button"
                className="result-visual result-visual--interactive"
                onClick={handleOpenLightbox}
                aria-label="Open interactive route viewer"
              >
                <img
                  className="result-image"
                  src={resultImageSrc}
                  alt={resultImageAlt}
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
                <span className="result-visual-hint">Tap to zoom</span>
              </button>
            ) : (
              <div className="result-visual result-visual--empty">
                <div className="result-visual-empty-copy">
                  <strong>No route image available</strong>
                  <span>Return to search or ask a team member for assistance.</span>
                </div>
              </div>
            )}

            <div className="result-meta">
              {selectedRoom ? (
                <section className="result-feedback-panel" aria-label="Route feedback">
                  <div className="result-feedback-copy">
                    <p className="result-feedback-title">Was this route helpful?</p>
                    {feedbackSent ? <p className="thank-you">Thank you for your feedback.</p> : <p className="result-feedback-hint">Tap one option to send quick feedback.</p>}
                  </div>

                  <div className="feedback-smileys feedback-smileys--icon-only">
                    {feedbackOptions.map((item) => (
                      <button
                        key={item.value}
                        className={`smiley-button smiley-button--${item.tone} ${rating === item.value ? 'is-selected' : ''}`}
                        onClick={() => void handleSmileyClick(item.value)}
                        disabled={feedbackSent}
                        aria-label={item.label}
                      >
                        <FeedbackGlyph value={item.value} />
                        <span>{item.shortLabel}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </section>
      )}
      {suggestions.length > 0 ? (
        <div className="kiosk-suggestion-modal-overlay" onClick={() => setSuggestions([])}>
          <div
            className="kiosk-suggestion-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Suggestions"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kiosk-suggestion-modal-head">
              <button type="button" className="kiosk-suggestion-close" onClick={() => setSuggestions([])} aria-label="Close suggestions">
                Close
              </button>
            </div>
            <div className="kiosk-suggestion-modal-grid">
              {suggestions.map((room) => (
                <button
                  key={room.usid}
                  type="button"
                  className="kiosk-suggestion-btn kiosk-suggestion-btn--modal"
                  onClick={() => handleSuggestionSelect(room)}
                >
                  <span className="kiosk-suggestion-usid">{room.usid}</span>
                  <span className="kiosk-suggestion-meta">{room.building} · {room.room}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {lightboxAsset ? (
        <KioskImageViewer
          key={`${lightboxAsset.src}:${lightboxAsset.title}:${lightboxAsset.subtitle ?? ''}`}
          asset={lightboxAsset}
          onClose={() => setLightboxAsset(null)}
        />
      ) : null}
    </main>
  )
}

function AdminApp() {
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rooms' | 'import' | 'images' | 'reports' | 'quicklinks'>('dashboard')
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [ibxConfig, setIbxConfig] = useState<IbxConfig | null>(null)
  const [adminQuickLinks, setAdminQuickLinks] = useState<QuickLink[]>([])
  const [quickLinkForm, setQuickLinkForm] = useState<QuickLinkForm>(emptyQuickLinkForm)
  const [editingQuickLinkId, setEditingQuickLinkId] = useState<number | null>(null)
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
  const [lightboxAsset, setLightboxAsset] = useState<LightboxAsset | null>(null)
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

    void Promise.all([getRooms(), getFeedback(), getReport(), getBuildingTemplates(), getChartData(), getIbxConfig(), getAdminQuickLinks()])
      .then(([roomsResponse, feedbackResponse, reportResponse, templateResponse, charts, ibxResponse, qlResponse]) => {
        setRooms(roomsResponse)
        setFeedback(feedbackResponse)
        setReport(reportResponse)
        setBuildingTemplates(templateResponse)
        setChartData(charts)
        setIbxConfig(ibxResponse)
        setAdminQuickLinks(qlResponse)
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
  const averageRating = feedback.length > 0 ? (feedback.reduce((sum, entry) => sum + normalizeFeedbackRating(entry.rating), 0) / feedback.length).toFixed(1) : '–'
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

  const allVisibleRoomsSelected = filteredRooms.length > 0 && filteredRooms.every((room) => selectedRoomIds.includes(room.usid))
  const allVisibleTemplatesSelected = buildingTemplates.length > 0 && buildingTemplates.every((template) => selectedTemplateIds.includes(template.fileName))
  const allVisibleImagesSelected = imagePageData.items.length > 0 && imagePageData.items.every((image) => selectedImageIds.includes(image.fileName))

  const quickLinksByBuilding = useMemo(() => {
    const map = new Map<string, { building: string; quickLinks: QuickLink[] }>()

    for (const ql of adminQuickLinks) {
      const room = rooms.find((r) => r.usid === ql.usid)
      const buildingKey = normalizeTemplateLookup(room?.building ?? '')

      if (!room?.building || !buildingKey) {
        continue
      }

      const existing = map.get(buildingKey)
      map.set(buildingKey, {
        building: existing?.building ?? room.building,
        quickLinks: [...(existing?.quickLinks ?? []), ql],
      })
    }

    return map
  }, [adminQuickLinks, rooms])

  const qlWithRoomAndTemplate = useMemo(() => {
    return adminQuickLinks.map((ql) => {
      const room = rooms.find((r) => r.usid === ql.usid) ?? null
      const buildingKey = normalizeTemplateLookup(room?.building ?? '')
      const template = room
        ? buildingTemplates.find((t) => normalizeTemplateLookup(t.building) === buildingKey) ?? null
        : null
      return { ql, room, template }
    })
  }, [adminQuickLinks, rooms, buildingTemplates])

  const floorPlanCards = useMemo(() => {
    const cards = new Map<string, { building: string; template: BuildingTemplate | null; quickLinks: QuickLink[] }>()

    for (const template of buildingTemplates) {
      const buildingKey = normalizeTemplateLookup(template.building)
      cards.set(buildingKey, {
        building: template.building,
        template,
        quickLinks: quickLinksByBuilding.get(buildingKey)?.quickLinks ?? [],
      })
    }

    for (const [buildingKey, entry] of quickLinksByBuilding.entries()) {
      const existing = cards.get(buildingKey)
      cards.set(buildingKey, {
        building: existing?.building ?? entry.building,
        template: existing?.template ?? null,
        quickLinks: entry.quickLinks,
      })
    }

    return Array.from(cards.values()).sort((left, right) => {
      if ((left.quickLinks.length > 0) !== (right.quickLinks.length > 0)) {
        return Number(right.quickLinks.length > 0) - Number(left.quickLinks.length > 0)
      }

      return left.building.localeCompare(right.building)
    })
  }, [buildingTemplates, quickLinksByBuilding])

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

  async function refreshReportingAndCharts() {
    const [feedbackResponse, reportResponse, charts] = await Promise.all([
      getFeedback(),
      getReport(),
      getChartData(),
    ])

    setFeedback(feedbackResponse)
    setReport(reportResponse)
    setChartData(charts)
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
    setIbxConfig(null)
    setAdminQuickLinks([])
    setQuickLinkForm(emptyQuickLinkForm)
    setEditingQuickLinkId(null)
    setSelectedRoomIds([])
    setSelectedImageIds([])
    setSelectedTemplateIds([])
    setLightboxAsset(null)
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

  async function handleBulkDeleteRooms() {
    if (selectedRoomIds.length === 0) {
      setStatusNotice({ tone: 'info', message: 'Select at least one room.' })
      return
    }

    const confirmed = await showConfirmModal('Delete Rooms', `Delete ${selectedRoomIds.length} selected rooms? This cannot be undone.`)
    if (!confirmed) {
      return
    }

    try {
      const result = await bulkDeleteRooms(selectedRoomIds)
      setSelectedRoomIds([])
      setStatusNotice({ tone: 'success', message: `${result.deleted} rooms deleted.` })
      await refreshRoomsAndFeedback()
    } catch (error) {
      setStatusNotice({ tone: 'error', message: getErrorMessage(error, 'Rooms could not be deleted.') })
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

  async function handleBulkDeleteImages() {
    if (selectedImageIds.length === 0) {
      setStatusNotice({ tone: 'info', message: 'Select at least one image.' })
      return
    }

    const confirmed = await showConfirmModal('Delete Images', `Delete ${selectedImageIds.length} selected images? This cannot be undone.`)
    if (!confirmed) {
      return
    }

    try {
      const result = await bulkDeleteImages(selectedImageIds)
      setSelectedImageIds([])
      setStatusNotice({ tone: 'success', message: `${result.deleted} images deleted.` })
      await Promise.all([refreshRoomsAndFeedback(), refreshImages(imagePage, imageQuery)])
    } catch (error) {
      setStatusNotice({ tone: 'error', message: getErrorMessage(error, 'Images could not be deleted.') })
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

  async function handleBulkDeleteTemplates() {
    if (selectedTemplateIds.length === 0) {
      setStatusNotice({ tone: 'info', message: 'Select at least one template.' })
      return
    }

    const confirmed = await showConfirmModal('Delete Templates', `Delete ${selectedTemplateIds.length} selected templates? This cannot be undone.`)
    if (!confirmed) {
      return
    }

    try {
      const result = await bulkDeleteBuildingTemplates(selectedTemplateIds)
      setSelectedTemplateIds([])
      setStatusNotice({ tone: 'success', message: `${result.deleted} templates deleted.` })
      await refreshBuildingTemplates()
    } catch (error) {
      setStatusNotice({ tone: 'error', message: getErrorMessage(error, 'Templates could not be deleted.') })
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

  async function handleClearFeedbackData() {
    const confirmed = await showConfirmModal('Delete Feedback Data', 'Delete all feedback data? This cannot be undone.')
    if (!confirmed) {
      return
    }

    try {
      await clearFeedback()
      setStatusNotice({ tone: 'success', message: 'Feedback data deleted.' })
      await refreshReportingAndCharts()
    } catch (error) {
      setStatusNotice({ tone: 'error', message: getErrorMessage(error, 'Feedback data could not be deleted.') })
    }
  }

  async function handleClearSearchData() {
    const confirmed = await showConfirmModal('Delete Search Data', 'Delete all search analytics data? This cannot be undone.')
    if (!confirmed) {
      return
    }

    try {
      await clearAnalytics()
      setStatusNotice({ tone: 'success', message: 'Search analytics deleted.' })
      await refreshReportingAndCharts()
    } catch (error) {
      setStatusNotice({ tone: 'error', message: getErrorMessage(error, 'Search analytics could not be deleted.') })
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

  function openLightbox(asset: LightboxAsset) {
    setLightboxAsset(asset)
  }

  async function refreshQuickLinks() {
    const links = await getAdminQuickLinks()
    setAdminQuickLinks(links)
  }

  async function handleSaveQuickLink() {
    if (!quickLinkForm.label.trim() || !quickLinkForm.usid.trim()) {
      setStatusNotice({ tone: 'error', message: 'Label and room code are required.' })
      return
    }

    try {
      if (editingQuickLinkId !== null) {
        await updateQuickLink(editingQuickLinkId, quickLinkForm)
        setStatusNotice({ tone: 'success', message: 'Quick link updated.' })
      } else {
        await saveQuickLink(quickLinkForm)
        setStatusNotice({ tone: 'success', message: 'Quick link added.' })
      }
      setQuickLinkForm(emptyQuickLinkForm)
      setEditingQuickLinkId(null)
      await refreshQuickLinks()
    } catch (error) {
      setStatusNotice({ tone: 'error', message: getErrorMessage(error, 'Could not save quick link.') })
    }
  }

  async function handleDeleteQuickLink(id: number) {
    const confirmed = await showConfirmModal('Delete Quick Link', 'Delete this quick link? This cannot be undone.')
    if (!confirmed) return
    try {
      await deleteQuickLink(id)
      setStatusNotice({ tone: 'success', message: 'Quick link deleted.' })
      await refreshQuickLinks()
    } catch (error) {
      setStatusNotice({ tone: 'error', message: getErrorMessage(error, 'Could not delete quick link.') })
    }
  }

  function handleEditQuickLink(ql: QuickLink) {
    setEditingQuickLinkId(ql.id)
    setQuickLinkForm({ label: ql.label, usid: ql.usid, sortOrder: ql.sortOrder })
  }

  if (!authenticated) {
    return (
      <LoginPage
        theme={adminTheme}
        password={password}
        loginError={loginError}
        onPasswordChange={(nextPassword) => {
          setPassword(nextPassword)
          if (loginError) {
            setLoginError('')
          }
        }}
        onSubmit={() => void handleLogin()}
        onToggleTheme={toggleAdminTheme}
      />
    )
  }

  const adminTabs = [
    { key: 'dashboard' as const, label: 'Dashboard', icon: '▣' },
    { key: 'rooms' as const, label: 'Rooms', icon: '⌂' },
    { key: 'import' as const, label: 'Import', icon: '⇪' },
    { key: 'images' as const, label: 'Images', icon: '▨' },
    { key: 'quicklinks' as const, label: 'Quick Links', icon: '⊞' },
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
              {activeTab === 'images' && 'Upload and manage the media library'}
              {activeTab === 'quicklinks' && 'Manage the shortcut buttons on the kiosk home screen'}
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
            {ibxConfig ? (
              <section className="admin-card ibx-summary-card">
                <div className="section-head">
                  <div>
                    <h2>IBX Setup</h2>
                    <p className="muted-text">Prepared for separate IBX access and data partitions.</p>
                  </div>
                  <span className="template-count">{ibxConfig.isPrepared ? 'Prepared' : 'Not ready'}</span>
                </div>
                <div className="ibx-summary-grid">
                  <div className="import-stat">
                    <strong>{ibxConfig.current}</strong>
                    <span>Current default IBX</span>
                  </div>
                  <div className="import-stat">
                    <strong>{ibxConfig.available.length}</strong>
                    <span>Configured IBX entries</span>
                  </div>
                </div>
              </section>
            ) : null}

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
                  <span className="stat-note">Avg {averageRating} / {feedbackScaleMax}</span>
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
                            <stop offset="5%" stopColor="var(--chart-series-search)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--chart-series-search)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={chartHoverCursorLine} />
                        <Area type="monotone" dataKey="count" stroke="var(--chart-series-search)" fill="url(#gradSearch)" strokeWidth={2} name="Searches" />
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
                            <stop offset="5%" stopColor="var(--chart-series-rating)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--chart-series-rating)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis domain={[0, feedbackScaleMax]} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={chartHoverCursorLine} />
                        <Area type="monotone" dataKey="avg" stroke="var(--chart-series-rating)" fill="url(#gradRating)" strokeWidth={2} name="Avg Rating" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="admin-card chart-card">
                  <h2>Ratings</h2>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData.ratingDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="rating" tick={{ fontSize: 11 }} tickFormatter={(v: number) => {
                          const option = getFeedbackOption(v)
                          return `${option.emoji} ${option.shortLabel}`
                        }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={chartHoverCursorFill} />
                        <Bar dataKey="count" name="Feedback" radius={[6, 6, 0, 0]}>
                          {chartData.ratingDistribution.map((entry) => (
                            <Cell key={entry.rating} fill={chartRatingPalette[normalizeFeedbackRating(entry.rating) - 1] ?? chartRatingPalette[1]} />
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
                            <Cell key={i} fill={chartScalePalette[i % chartScalePalette.length]} />
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
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
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
                            <Cell key={i} fill={chartScalePalette[i === 0 ? 0 : i < 3 ? 1 : 2]} />
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
                            <stop offset="5%" stopColor="var(--chart-series-feedback)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--chart-series-feedback)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={chartHoverCursorLine} />
                        <Area type="monotone" dataKey="count" stroke="var(--chart-series-feedback)" fill="url(#gradFeedback)" strokeWidth={2} name="Feedback" />
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
                    <input placeholder="e.g. 314 or ANT001" value={roomForm.usid} onChange={(event) => setRoomForm({ ...roomForm, usid: event.target.value.toUpperCase().replace(/[^A-Z0-9\-_]/g, '').slice(0, 16) })} />
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
                      <div className="button-row">
                        <button
                          className="secondary-button compact"
                          onClick={() => openLightbox({
                            src: resolveAssetUrl(roomForm.image),
                            title: selectedRoomAsset?.title ?? 'Selected image',
                            subtitle: selectedRoomAsset?.subtitle,
                          })}
                        >
                          Full screen
                        </button>
                        <button className="secondary-button compact" onClick={handleClearRoomImage}>
                          Remove
                        </button>
                      </div>
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
                  <label className="selection-toggle">
                    <input
                      type="checkbox"
                      checked={allVisibleRoomsSelected}
                      onChange={() => setSelectedRoomIds(allVisibleRoomsSelected ? [] : filteredRooms.map((room) => room.usid))}
                    />
                    <span>Select visible</span>
                  </label>
                  <button className="danger-button compact" onClick={() => void handleBulkDeleteRooms()} disabled={selectedRoomIds.length === 0}>
                    Delete selected
                  </button>
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
                        <th />
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
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select room ${room.usid}`}
                              title={`Select room ${room.usid}`}
                              checked={selectedRoomIds.includes(room.usid)}
                              onChange={() => setSelectedRoomIds((current) => toggleId(current, room.usid))}
                            />
                          </td>
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
                      <label className="card-select-checkbox">
                        <input
                          type="checkbox"
                          aria-label={`Select room ${room.usid}`}
                          title={`Select room ${room.usid}`}
                          checked={selectedRoomIds.includes(room.usid)}
                          onChange={() => setSelectedRoomIds((current) => toggleId(current, room.usid))}
                        />
                      </label>
                      {room.image ? <img src={resolveAssetUrl(room.image)} alt={room.room} loading="lazy" decoding="async" /> : <div className="room-card-placeholder">No image</div>}
                      <strong>{room.usid}</strong>
                      <span>{room.building}</span>
                      <span>{room.level}</span>
                      <span>Room {room.room}</span>
                      <span>Door {room.door}</span>
                      <div className="button-row">
                        {room.image ? (
                          <button
                            className="secondary-button compact"
                            onClick={() => openLightbox({
                              src: resolveAssetUrl(room.image),
                              title: `${room.building} ${room.room}`,
                              subtitle: `Door ${room.door}`,
                            })}
                          >
                            View
                          </button>
                        ) : null}
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
                <label className="selection-toggle">
                  <input
                    type="checkbox"
                    checked={allVisibleImagesSelected}
                    onChange={() => setSelectedImageIds(allVisibleImagesSelected ? [] : imagePageData.items.map((image) => image.fileName))}
                  />
                  <span>Select page</span>
                </label>
                <button className="danger-button compact" onClick={() => void handleBulkDeleteImages()} disabled={selectedImageIds.length === 0}>
                  Delete selected
                </button>
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
                    <label className="card-select-checkbox">
                      <input
                        type="checkbox"
                        aria-label={`Select image ${image.name}`}
                        title={`Select image ${image.name}`}
                        checked={selectedImageIds.includes(image.fileName)}
                        onChange={() => setSelectedImageIds((current) => toggleId(current, image.fileName))}
                      />
                    </label>
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
                        <button
                          className="secondary-button compact"
                          onClick={() => openLightbox({
                            src: resolveAssetUrl(image.path),
                            title: image.name,
                            subtitle: image.fileName,
                          })}
                        >
                          View
                        </button>
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

        {activeTab === 'quicklinks' && (
          <div className="admin-tab-panel">
            <div className="ql-layout">
              <section className="admin-card ql-form-card">
                <div className="section-head">
                  <h2>{editingQuickLinkId !== null ? 'Edit Quick Link' : 'Add Quick Link'}</h2>
                </div>
                <p className="muted-text">
                  Quick links appear as shortcut buttons on the kiosk home screen. Each button jumps directly to the room you specify.
                </p>
                <div className="form-grid ql-form-grid">
                  <label className="form-label form-label--full">
                    Button label
                    <input
                      className="form-input"
                      type="text"
                      value={quickLinkForm.label}
                      maxLength={80}
                      placeholder="e.g. NOC, Help Desk, Exit"
                      onChange={(event) => setQuickLinkForm((current) => ({ ...current, label: event.target.value }))}
                    />
                  </label>
                  <label className="form-label">
                    Room
                    <select
                      className="form-input"
                      value={quickLinkForm.usid}
                      onChange={(event) => {
                        const selectedRoom = rooms.find((r) => r.usid === event.target.value)
                        setQuickLinkForm((current) => ({
                          ...current,
                          usid: event.target.value,
                          label: current.label || (selectedRoom?.room ?? ''),
                        }))
                      }}
                    >
                      <option value="">— Select a room —</option>
                      {Array.from(new Set(rooms.map((r) => r.building))).sort().map((building) => (
                        <optgroup key={building} label={building}>
                          {rooms.filter((r) => r.building === building).map((room) => (
                            <option key={room.usid} value={room.usid}>
                              {room.usid} — {room.room}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label className="form-label">
                    Sort order
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      value={quickLinkForm.sortOrder}
                      onChange={(event) => setQuickLinkForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))}
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button className="primary-button compact" onClick={() => void handleSaveQuickLink()}>
                    {editingQuickLinkId !== null ? 'Update' : 'Add quick link'}
                  </button>
                  {editingQuickLinkId !== null ? (
                    <button className="secondary-button compact" onClick={() => { setEditingQuickLinkId(null); setQuickLinkForm(emptyQuickLinkForm) }}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="admin-card">
                <div className="section-head">
                  <h2>Kiosk Buttons</h2>
                  <span className="template-count">{adminQuickLinks.length} configured</span>
                </div>
                {adminQuickLinks.length === 0 ? (
                  <p className="muted-text">No quick links configured yet. Add one using the form.</p>
                ) : (
                  <div className="ql-preview-list">
                    {qlWithRoomAndTemplate.map(({ ql, room, template }) => (
                      <div key={ql.id} className={`ql-preview-card${editingQuickLinkId === ql.id ? ' is-editing' : ''}`}>
                        <div className="ql-preview-thumb">
                          {template ? (
                            <img src={resolveAssetUrl(template.path)} alt={template.building} />
                          ) : (
                            <div className="ql-preview-no-thumb">
                              <span>No floor plan</span>
                            </div>
                          )}
                        </div>
                        <div className="ql-preview-info">
                          <div className="ql-preview-top">
                            <strong className="ql-preview-label">{ql.label}</strong>
                            <span className="ql-preview-order">#{ql.sortOrder}</span>
                          </div>
                          <span className="table-mono">{ql.usid}</span>
                          {room && (
                            <span className="ql-preview-room">{room.building} · {room.level} · {room.room}</span>
                          )}
                        </div>
                        <div className="ql-preview-actions">
                          <button className="secondary-button compact" onClick={() => handleEditQuickLink(ql)}>Edit</button>
                          <button className="danger-button compact" onClick={() => void handleDeleteQuickLink(ql.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="admin-card admin-card-spaced">
              <div className="section-head">
                <div>
                  <h2>Floor Plan Images</h2>
                  <p className="muted-text">
                    Upload floor plan images and assign them to buildings. Every configured quick link appears here and can be linked to a building floor plan.
                  </p>
                </div>
                <div className="template-panel-actions">
                  <span className="template-count">{floorPlanCards.length} cards</span>
                  <label className="selection-toggle">
                    <input
                      type="checkbox"
                      checked={allVisibleTemplatesSelected}
                      onChange={() => setSelectedTemplateIds(allVisibleTemplatesSelected ? [] : buildingTemplates.map((template) => template.fileName))}
                    />
                    <span>Select visible</span>
                  </label>
                  <button className="danger-button compact" onClick={() => void handleBulkDeleteTemplates()} disabled={selectedTemplateIds.length === 0}>
                    Delete selected
                  </button>
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

              {floorPlanCards.length > 0 ? (
                <div className="template-library-grid">
                  {floorPlanCards.map(({ building, quickLinks, template }) => (
                    <article
                      key={template?.fileName ?? `floor-plan-${building}`}
                      className={`template-card ${quickLinks.length > 0 ? 'is-linked' : ''}`}
                    >
                      {template ? (
                        <label className="card-select-checkbox">
                          <input
                            type="checkbox"
                            aria-label={`Select template ${template.building}`}
                            title={`Select template ${template.building}`}
                            checked={selectedTemplateIds.includes(template.fileName)}
                            onChange={() => setSelectedTemplateIds((current) => toggleId(current, template.fileName))}
                          />
                        </label>
                      ) : null}
                      <div className="template-card-preview">
                        {template ? (
                          <img src={resolveAssetUrl(template.path)} alt={building} loading="lazy" decoding="async" />
                        ) : (
                          <div className="template-card-empty">No floor plan uploaded</div>
                        )}
                      </div>
                      <div className="template-card-body">
                        <div className="template-card-header">
                          <div className="template-card-meta">
                            <span className="template-badge template-badge--admin">{getTemplateBadgeLabel(building)}</span>
                            <strong>{building}</strong>
                            <span>{template?.fileName ?? 'No image file assigned yet'}</span>
                          </div>
                          {template ? (
                            <label className="template-visibility-toggle">
                              <input
                                type="checkbox"
                                checked={template.showOnHome}
                                onChange={(event) => {
                                  void handleToggleBuildingTemplateVisibility(template, event.target.checked)
                                }}
                              />
                              <span>Kiosk fallback</span>
                            </label>
                          ) : null}
                        </div>
                        {quickLinks.length > 0 && (
                          <div className="template-ql-badges">
                            {quickLinks.map((ql) => (
                              <span key={ql.id} className="template-ql-badge">⊞ {ql.label}</span>
                            ))}
                          </div>
                        )}
                        {template ? (
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
                        ) : (
                          <p className="muted-text">Upload a floor plan image for {building} to show a thumbnail on the kiosk button.</p>
                        )}
                        <div className="template-card-actions">
                          {template ? (
                            <>
                              <button
                                className="secondary-button compact"
                                onClick={() => openLightbox({
                                  src: resolveAssetUrl(template.path),
                                  title: template.building,
                                  subtitle: template.fileName,
                                })}
                              >
                                View
                              </button>
                              <button className="danger-button compact" onClick={() => void handleDeleteBuildingTemplate(template)}>
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-text">Add a quick link or upload a floor plan image to create cards here.</p>
              )}
            </section>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="admin-tab-panel">
            <section className="dashboard-panels">
              <article className="admin-card">
                <div className="section-head">
                  <h2>Feedback</h2>
                  <div className="button-row">
                    <button className="danger-button compact" onClick={() => void handleClearFeedbackData()}>
                      Delete data
                    </button>
                    <a className="secondary-button compact link-button" href={getDownloadUrl('/api/admin/feedback.xlsx')}>
                      Export XLSX
                    </a>
                  </div>
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
                          <td><span className={`rating-badge rating-badge--${getFeedbackOption(entry.rating).badgeTone}`}>{getFeedbackOption(entry.rating).emoji} {getFeedbackOption(entry.rating).label}</span></td>
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
                  <div className="button-row">
                    <button className="danger-button compact" onClick={() => void handleClearSearchData()}>
                      Delete data
                    </button>
                    <a className="secondary-button compact link-button" href={getDownloadUrl('/api/admin/report.xlsx')}>
                      Export XLSX
                    </a>
                  </div>
                </div>
                <p className="muted-text">All search entries with counters per USID.</p>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>USID</th>
                        <th>Searches</th>
                        <th>Positive</th>
                        <th>Neutral</th>
                        <th>Negative</th>
                        <th>Last activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.length === 0 ? (
                        <tr><td colSpan={6}>No report data yet.</td></tr>
                      ) : report.map((entry) => (
                        <tr key={entry.usid}>
                          <td><span className="table-mono">{entry.usid}</span></td>
                          <td><strong>{entry.searches}</strong></td>
                          <td>{entry.positive}</td>
                          <td>{entry.neutral}</td>
                          <td>{entry.negative}</td>
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
      {lightboxAsset ? (
        <ImageLightbox
          key={`${lightboxAsset.src}:${lightboxAsset.title}:${lightboxAsset.subtitle ?? ''}`}
          asset={lightboxAsset}
          onClose={() => setLightboxAsset(null)}
        />
      ) : null}
    </main>
  )
}

function AdminAccessRedirect() {
  useEffect(() => {
    window.location.replace('/')
  }, [])

  return null
}

function RootRouteRedirect() {
  useEffect(() => {
    window.location.replace('/')
  }, [])

  return null
}

function App() {
  const pathname = window.location.pathname
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const isRootRoute = pathname === '/' || pathname === ''
  const blockAdminOnDevice = isAdminRoute && isLikelyIpadDevice()

  if (blockAdminOnDevice) {
    return <AdminAccessRedirect />
  }

  if (!isAdminRoute && !isRootRoute) {
    return <RootRouteRedirect />
  }

  return isAdminRoute ? <AdminApp /> : <KioskApp />
}

export default App
