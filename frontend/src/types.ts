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
  rating: number
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

export type BuildingTemplate = {
  fileName: string
  name: string
  building: string
  path: string
  showOnHome: boolean
}

export type UploadedImagePage = {
  items: UploadedImage[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type ChartData = {
  searchesPerDay: Array<{ day: string; count: number }>
  feedbackPerDay: Array<{ day: string; count: number }>
  ratingDistribution: Array<{ rating: number; count: number }>
  topRooms: Array<{ usid: string; searches: number; building: string; room: string }>
  searchesByBuilding: Array<{ building: string; count: number }>
  avgRatingPerDay: Array<{ day: string; avg: number }>
}
