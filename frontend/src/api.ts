import type { BuildingTemplate, FeedbackEntry, ReportEntry, Room, UploadedImage, UploadedImagePage } from './types'

const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${input}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
  const payload = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String(payload.error)
        : 'Unexpected error'

    throw new Error(message)
  }

  return payload as T
}

export function resolveAssetUrl(path: string) {
  if (!path) {
    return ''
  }

  if (path.startsWith('/uploads/') || path.startsWith('/building-templates/')) {
    return `${apiBase}${path}`
  }

  return path
}

export function searchRoom(usid: string) {
  return request<Room>('/api/search', {
    method: 'POST',
    body: JSON.stringify({ usid }),
  })
}

export function sendFeedback(usid: string, rating: 'up' | 'down', comment: string) {
  return request<{ ok: true }>('/api/feedback', {
    method: 'POST',
    body: JSON.stringify({ usid, rating, comment }),
  })
}

export function getAdminSession() {
  return request<{ authenticated: boolean }>('/api/admin/session')
}

export function login(password: string) {
  return request<{ ok: true }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function logout() {
  return request<{ ok: true }>('/api/admin/logout', {
    method: 'POST',
  })
}

export function getRooms() {
  return request<Room[]>('/api/admin/rooms')
}

export function saveRoom(room: Room) {
  return request<{ ok: true }>('/api/admin/rooms', {
    method: 'POST',
    body: JSON.stringify(room),
  })
}

export function deleteRoom(usid: string) {
  return request<{ ok: true }>(`/api/admin/rooms/${usid}`, {
    method: 'DELETE',
  })
}

export function importRooms(payload: unknown) {
  return request<{ ok: true; imported: number }>('/api/admin/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function uploadImages(files: File[]) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('images', file)
  }

  const response = await fetch(`${apiBase}/api/admin/upload-images`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(String(payload.error ?? 'Upload failed'))
  }

  return payload as { uploaded: UploadedImage[] }
}

export function getImages(query = '', page = 1, pageSize = 24) {
  const params = new URLSearchParams({
    query,
    page: String(page),
    pageSize: String(pageSize),
  })

  return request<UploadedImagePage>(`/api/admin/images?${params.toString()}`)
}

export function getBuildingTemplates() {
  return request<BuildingTemplate[]>('/api/admin/building-templates')
}

export function getPublicBuildingTemplates() {
  return request<BuildingTemplate[]>('/api/building-templates')
}

export function renameImage(fileName: string, name: string) {
  return request<{ ok: true; image: UploadedImage }>(`/api/admin/images/${encodeURIComponent(fileName)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function getFeedback() {
  return request<FeedbackEntry[]>('/api/admin/feedback')
}

export function getReport() {
  return request<ReportEntry[]>('/api/admin/report')
}

export function getDownloadUrl(path: string) {
  return `${apiBase}${path}`
}
