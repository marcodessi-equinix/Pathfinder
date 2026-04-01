import type { BuildingTemplate, FeedbackEntry, ReportEntry, Room, UploadedImage, UploadedImagePage } from './types'

const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

type ImageUploadProgress = {
  uploadedFiles: number
  totalFiles: number
  percent: number
}

type UploadImagesOptions = {
  onProgress?: (progress: ImageUploadProgress) => void
}

function extractApiErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    // ZodError flatten: { formErrors: string[], fieldErrors: Record<string, string[]> }
    const zodErr = error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> }
    if (zodErr.formErrors && zodErr.formErrors.length > 0) return zodErr.formErrors[0]
    if (zodErr.fieldErrors) {
      const firstKey = Object.keys(zodErr.fieldErrors)[0]
      if (firstKey) {
        const msgs = zodErr.fieldErrors[firstKey]
        return `Field "${firstKey}": ${Array.isArray(msgs) ? msgs[0] : msgs}`
      }
    }
    return JSON.stringify(error)
  }
  return 'Unexpected error'
}

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
        ? extractApiErrorMessage(payload.error)
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

export function sendFeedback(usid: string, rating: number, comment: string) {
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

function estimateUploadedFiles(files: File[], loadedBytes: number) {
  let cumulativeBytes = 0
  let uploadedFiles = 0

  for (const file of files) {
    cumulativeBytes += file.size
    if (loadedBytes >= cumulativeBytes) {
      uploadedFiles += 1
      continue
    }

    break
  }

  return uploadedFiles
}

function parseUploadResponse(responseText: string) {
  if (!responseText) {
    return {}
  }

  try {
    return JSON.parse(responseText) as unknown
  } catch {
    throw new Error('Upload failed')
  }
}

export async function uploadImages(files: File[], options: UploadImagesOptions = {}) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('images', file)
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)

  return await new Promise<{ uploaded: UploadedImage[] }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.open('POST', `${apiBase}/api/admin/upload-images`)
    xhr.withCredentials = true

    xhr.upload.addEventListener('progress', (event) => {
      if (!options.onProgress) {
        return
      }

      const percent = event.lengthComputable && event.total > 0
        ? Math.min(100, Math.round((event.loaded / event.total) * 100))
        : 0
      const normalizedLoadedBytes = event.lengthComputable && event.total > 0
        ? Math.min(totalBytes, Math.round((event.loaded / event.total) * totalBytes))
        : 0

      options.onProgress({
        uploadedFiles: estimateUploadedFiles(files, normalizedLoadedBytes),
        totalFiles: files.length,
        percent,
      })
    })

    xhr.addEventListener('load', () => {
      try {
        const payload = parseUploadResponse(xhr.responseText)

        if (xhr.status < 200 || xhr.status >= 300) {
          const message =
            typeof payload === 'object' && payload !== null && 'error' in payload
              ? String(payload.error ?? 'Upload failed')
              : 'Upload failed'

          reject(new Error(message))
          return
        }

        options.onProgress?.({
          uploadedFiles: files.length,
          totalFiles: files.length,
          percent: 100,
        })

        resolve(payload as { uploaded: UploadedImage[] })
      } catch (error) {
        reject(error)
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'))
    })

    xhr.send(formData)
  })
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

export async function uploadBuildingTemplates(files: File[]) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('templates', file)
  }

  const response = await fetch(`${apiBase}/api/admin/building-templates`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(String(payload.error ?? 'Upload failed'))
  }

  return payload as { uploaded: BuildingTemplate[] }
}

export function getPublicBuildingTemplates() {
  return request<BuildingTemplate[]>('/api/building-templates')
}

export function renameBuildingTemplate(fileName: string, name: string) {
  return request<{ ok: true; template: BuildingTemplate }>(`/api/admin/building-templates/${encodeURIComponent(fileName)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function setBuildingTemplateVisibility(fileName: string, showOnHome: boolean) {
  return request<{ ok: true; template: BuildingTemplate }>(
    `/api/admin/building-templates/${encodeURIComponent(fileName)}/visibility`,
    {
      method: 'PATCH',
      body: JSON.stringify({ showOnHome }),
    },
  )
}

export function deleteBuildingTemplate(fileName: string) {
  return request<{ ok: true }>(`/api/admin/building-templates/${encodeURIComponent(fileName)}`, {
    method: 'DELETE',
  })
}

export function renameImage(fileName: string, name: string) {
  return request<{ ok: true; image: UploadedImage }>(`/api/admin/images/${encodeURIComponent(fileName)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function deleteImage(fileName: string) {
  return request<{ ok: true }>(`/api/admin/images/${encodeURIComponent(fileName)}`, {
    method: 'DELETE',
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

export function getChartData() {
  return request<import('./types').ChartData>('/api/admin/analytics/charts')
}
