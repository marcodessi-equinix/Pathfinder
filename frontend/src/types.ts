export type Room = {
  usid: string
  building: string
  level: string
  room: string
  door: string
  image: string
}

export type FeedbackEntry = {
  id: number
  usid: string
  rating: 'up' | 'down'
  comment: string
  timestamp: string
}

export type ReportEntry = {
  usid: string
  searches: number
  up: number
  down: number
  lastActivity: string
}

export type UploadedImage = {
  fileName: string
  name: string
  path: string
}

export type UploadedImagePage = {
  items: UploadedImage[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
