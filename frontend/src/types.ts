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

export type UploadedImage = {
  name: string
  path: string
}
