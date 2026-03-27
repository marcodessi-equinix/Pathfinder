import { useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteRoom,
  getAdminSession,
  getDownloadUrl,
  getFeedback,
  getImages,
  getRooms,
  importRooms,
  login,
  logout,
  resolveAssetUrl,
  saveRoom,
  searchRoom,
  sendFeedback,
  uploadImage,
} from './api'
import './App.css'
import type { FeedbackEntry, Room, UploadedImage } from './types'

type RoomForm = {
  usid: string
  building: string
  level: string
  room: string
  door: string
  image: string
}

const emptyRoom: RoomForm = {
  usid: '',
  building: '',
  level: '',
  room: '',
  door: '',
  image: '',
}

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function KioskApp() {
  const [input, setInput] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
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
    if (!selectedRoom) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          setSelectedRoom(null)
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
  }, [selectedRoom])

  useEffect(() => {
    if (selectedRoom) {
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
  }, [input, selectedRoom])

  async function handleSearch() {
    if (input.length !== 6) {
      return
    }

    setIsSearching(true)
    setError('')

    try {
      const room = await searchRoom(input)
      setSelectedRoom(room)
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
    setInput('')
    setRating(null)
    setComment('')
    setFeedbackSent(false)
    setError('')
    setSecondsLeft(45)
  }

  return (
    <main className="kiosk-shell">
      {!selectedRoom ? (
        <section className="kiosk-home">
          <img src="/logo.jpg" className="brand-logo" alt="Pathfinder logo" />
          <img src="/header.jpg" className="hero-image" alt="Office directions" />
          <p className="search-label">Enter the last numbers of your USID.</p>

          <div className="search-area">
            <label className="input-wrap" htmlFor="roomInput">
              <input
                id="roomInput"
                type="tel"
                inputMode="numeric"
                maxLength={6}
                placeholder=" "
                value={input}
                onChange={(event) => {
                  setInput(event.target.value.replace(/\D/g, '').slice(0, 6))
                  setError('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleSearch()
                  }
                }}
              />
              {!input && <span className="input-hint">123:0G:000000</span>}
            </label>

            <button className="primary-button" disabled={input.length !== 6 || isSearching} onClick={() => void handleSearch()}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            {error ? <p className="error-message">{error}</p> : null}
          </div>
        </section>
      ) : (
        <section className="result-shell">
          <div className="result-header">
            <button className="back-button" onClick={resetView} aria-label="Back to search">
              ←
            </button>
            <div className="timer-box">
              <span>{secondsLeft}</span>s
            </div>
          </div>

          <h1 className="destination-title">YOUR DESTINATION</h1>
          <p className="destination-subtitle">The destination is highlighted in green</p>

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

          {selectedRoom.image ? (
            <img className="result-image" src={resolveAssetUrl(selectedRoom.image)} alt={`Route to room ${selectedRoom.room}`} />
          ) : null}

          <p className="pickup-hint">Pick up keys or cards if needed.</p>

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
  const [images, setImages] = useState<UploadedImage[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [roomForm, setRoomForm] = useState<RoomForm>(emptyRoom)
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    document.title = 'PATHFINDER Admin'
    void getAdminSession().then((session) => {
      setAuthenticated(session.authenticated)
    })
  }, [])

  useEffect(() => {
    if (!authenticated) {
      return
    }

    void Promise.all([getRooms(), getFeedback(), getImages()]).then(([roomsResponse, feedbackResponse, imagesResponse]) => {
      setRooms(roomsResponse)
      setFeedback(feedbackResponse)
      setImages(imagesResponse)
    })
  }, [authenticated])

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

  async function refreshAdminData() {
    const [roomsResponse, feedbackResponse, imagesResponse] = await Promise.all([getRooms(), getFeedback(), getImages()])
    setRooms(roomsResponse)
    setFeedback(feedbackResponse)
    setImages(imagesResponse)
  }

  async function handleLogin() {
    try {
      await login(password)
      setAuthenticated(true)
      setPassword('')
      setLoginError('')
      await refreshAdminData()
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login failed')
    }
  }

  async function handleLogout() {
    await logout()
    setAuthenticated(false)
    setStatusMessage('')
  }

  async function handleSaveRoom() {
    await saveRoom(roomForm)
    setStatusMessage(`Room ${roomForm.usid} saved.`)
    setRoomForm(emptyRoom)
    await refreshAdminData()
  }

  async function handleDeleteRoom(usid: string) {
    await deleteRoom(usid)
    setStatusMessage(`Room ${usid} deleted.`)
    await refreshAdminData()
  }

  async function handleImportFile(file: File) {
    const text = await file.text()
    const payload = JSON.parse(text) as unknown
    const result = await importRooms(payload)
    setStatusMessage(`${result.imported} rooms imported.`)
    await refreshAdminData()
  }

  async function handleUpload(file: File) {
    const result = await uploadImage(file)
    setRoomForm((current) => ({ ...current, image: result.path }))
    setStatusMessage(`Image uploaded: ${result.fileName}`)
    await refreshAdminData()
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
          <p>Rooms, image uploads, imports and exports for remote administration.</p>
        </div>
        <button className="secondary-button" onClick={() => void handleLogout()}>
          Logout
        </button>
      </header>

      <section className="admin-grid">
        <article className="admin-card">
          <h2>Room Editor</h2>
          <div className="form-grid">
            <input placeholder="USID" value={roomForm.usid} onChange={(event) => setRoomForm({ ...roomForm, usid: event.target.value.replace(/\D/g, '').slice(0, 6) })} />
            <input placeholder="Building" value={roomForm.building} onChange={(event) => setRoomForm({ ...roomForm, building: event.target.value })} />
            <input placeholder="Level" value={roomForm.level} onChange={(event) => setRoomForm({ ...roomForm, level: event.target.value })} />
            <input placeholder="Room" value={roomForm.room} onChange={(event) => setRoomForm({ ...roomForm, room: event.target.value })} />
            <input placeholder="Door" value={roomForm.door} onChange={(event) => setRoomForm({ ...roomForm, door: event.target.value })} />
            <input placeholder="Image path" value={roomForm.image} onChange={(event) => setRoomForm({ ...roomForm, image: event.target.value })} />
          </div>
          <div className="button-row">
            <button className="primary-button compact" onClick={() => void handleSaveRoom()}>
              Save room
            </button>
            <label className="upload-button">
              Upload image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    void handleUpload(file)
                  }
                  event.currentTarget.value = ''
                }}
              />
            </label>
          </div>
          <p className="status-message">{statusMessage}</p>
        </article>

        <article className="admin-card">
          <h2>Bulk Import</h2>
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
            Drag and drop a JSON file here
            <input
              type="file"
              accept="application/json"
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

          <h3>Uploaded Images</h3>
          <div className="image-list">
            {images.length === 0 ? <p className="muted-text">No uploaded images yet.</p> : null}
            {images.map((image) => (
              <button key={image.path} className="image-chip" onClick={() => setRoomForm((current) => ({ ...current, image: image.path }))}>
                <img src={resolveAssetUrl(image.path)} alt={image.name} />
                <span>{image.name}</span>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-card">
        <div className="section-head">
          <h2>Rooms</h2>
          <input
            className="search-filter"
            placeholder="Search by USID, building or level"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

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
      </section>

      <section className="admin-grid bottom-grid">
        <article className="admin-card">
          <div className="section-head">
            <h2>Feedback</h2>
            <a className="secondary-button compact link-button" href={getDownloadUrl('/api/admin/feedback.csv')} target="_blank" rel="noreferrer">
              Export Feedback CSV
            </a>
          </div>

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
                {feedback.map((entry) => (
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
            <a className="secondary-button compact link-button" href={getDownloadUrl('/api/admin/report.csv')} target="_blank" rel="noreferrer">
              Export Report CSV
            </a>
          </div>
          <p className="muted-text">Exports searches and feedback scores per USID.</p>
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
