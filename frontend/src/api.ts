import type { FeedbackEntry, Room, UploadedImage } from './types'

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

  if (path.startsWith('/uploads/')) {
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

export async function uploadImage(file: File) {
  const formData = new FormData()
  formData.append('image', file)

  const response = await fetch(`${apiBase}/api/admin/upload-image`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(String(payload.error ?? 'Upload failed'))
  }

  return payload as { fileName: string; path: string }
}

export function getImages() {
  return request<UploadedImage[]>('/api/admin/images')
}

export function getFeedback() {
  return request<FeedbackEntry[]>('/api/admin/feedback')
}

export function getDownloadUrl(path: string) {
  return `${apiBase}${path}`
}
