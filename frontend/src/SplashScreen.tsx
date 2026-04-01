import { useEffect, useRef, useState } from 'react'
import './SplashScreen.css'

interface SplashScreenProps {
  onFinished: () => void
}

const loadingPhases = [
  'Marke wird aufgebaut',
  'Kartenflaeche wird geladen',
  'Pfad wird gezogen',
  'Zielpunkt wird freigegeben',
]

const routePills = ['Logo Stage', 'Map Surface', 'Route Pulse', 'Arrival']
const stageSparks = Array.from({ length: 8 }, (_, index) => index + 1)

function SplashScreen({ onFinished }: SplashScreenProps) {
  const [show, setShow] = useState(true)
  const [progress, setProgress] = useState(6)
  const [activePhaseIndex, setActivePhaseIndex] = useState(0)
  const [audioCueLive, setAudioCueLive] = useState(false)
  const [audioCueBlocked, setAudioCueBlocked] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const lowPowerDevice =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4
  const useMinimalMotion = prefersReducedMotion || lowPowerDevice
  const visibleDuration = useMinimalMotion ? 900 : 2900
  const fadeDuration = 260

  useEffect(() => {
    if (useMinimalMotion) {
      return
    }

    const cue = new Audio('/sounds/futuristic-whoosh.mp3')
    cue.volume = 0.14
    cue.preload = 'auto'
    audioRef.current = cue

    const tryPlayCue = () => {
      void cue.play()
        .then(() => {
          setAudioCueLive(true)
          setAudioCueBlocked(false)
        })
        .catch(() => {
          setAudioCueLive(false)
          setAudioCueBlocked(true)
        })
    }

    const handleUserUnlock = () => {
      tryPlayCue()
    }

    tryPlayCue()
    window.addEventListener('pointerdown', handleUserUnlock, { once: true })
    window.addEventListener('keydown', handleUserUnlock, { once: true })

    return () => {
      window.removeEventListener('pointerdown', handleUserUnlock)
      window.removeEventListener('keydown', handleUserUnlock)
      cue.pause()
      cue.currentTime = 0
      audioRef.current = null
    }
  }, [useMinimalMotion])

  useEffect(() => {
    const startTime = Date.now()
    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startTime
      const progressRatio = Math.min(elapsed / visibleDuration, 1)
      const easedProgress = useMinimalMotion ? progressRatio : 1 - Math.pow(1 - progressRatio, 1.7)
      const nextProgress = Math.max(6, Math.round(easedProgress * 100))
      const nextPhaseIndex = Math.min(
        loadingPhases.length - 1,
        Math.floor(progressRatio * loadingPhases.length),
      )

      setProgress(nextProgress)
      setActivePhaseIndex(nextPhaseIndex)

      if (progressRatio >= 1) {
        window.clearInterval(progressTimer)
        setProgress(100)
        setActivePhaseIndex(loadingPhases.length - 1)
      }
    }, useMinimalMotion ? 120 : 80)

    const finishTimer = window.setTimeout(() => {
      setShow(false)
    }, visibleDuration)

    const unmountTimer = window.setTimeout(() => {
      onFinished()
    }, visibleDuration + fadeDuration)

    return () => {
      window.clearInterval(progressTimer)
      window.clearTimeout(finishTimer)
      window.clearTimeout(unmountTimer)
    }
  }, [fadeDuration, onFinished, useMinimalMotion, visibleDuration])

  const audioCueLabel = useMinimalMotion
    ? 'Minimal-motion boot'
    : audioCueLive
      ? 'Audio cue live'
      : audioCueBlocked
        ? 'Tap fuer Sound'
        : 'Silent-ready boot'

  function handleSoundEnable() {
    const cue = audioRef.current

    if (!cue || useMinimalMotion) {
      return
    }

    void cue.play()
      .then(() => {
        setAudioCueLive(true)
        setAudioCueBlocked(false)
      })
      .catch(() => {
        setAudioCueLive(false)
        setAudioCueBlocked(true)
      })
  }

  return (
    <div className={`splash-screen ${!show ? 'hidden' : ''}`} data-motion={useMinimalMotion ? 'minimal' : 'full'}>
      <div className="splash-screen__ambient" aria-hidden="true">
        <div className="splash-screen__orb splash-screen__orb--left" />
        <div className="splash-screen__orb splash-screen__orb--right" />
        <div className="splash-screen__mesh" />
        <div className="splash-screen__vignette" />
      </div>

      <section className="splash-screen__stage" aria-label="Pathfinder loading screen">
        <div className="splash-screen__title-block">
          <p className="splash-screen__eyebrow">Wegfinder // Indoor Navigation</p>
          <h1 className="splash-screen__title">
            <span className="splash-screen__title-line">PATHFINDER</span>
          </h1>
          <div className="splash-screen__title-rail" aria-hidden="true">
            <span className="splash-screen__title-rail-line" />
            <span className="splash-screen__title-rail-copy">Entry to destination in one motion line</span>
            <span className="splash-screen__title-rail-line" />
          </div>
          <p className="splash-screen__subtitle">
            Erst erscheint die Marke, dann laeuft der Weg ueber die Kartenflaeche des Logos bis zum Zielpunkt.
          </p>
        </div>

        <div className="splash-screen__tableau" aria-hidden="true">
          <div className="splash-screen__table-glow" />
          <div className="splash-screen__table-shadow" />
          <div className="splash-screen__table-base" />
          <div className="splash-screen__projection-ring splash-screen__projection-ring--outer" />
          <div className="splash-screen__projection-ring splash-screen__projection-ring--inner" />
          <div className="splash-screen__projection-grid" />

          {stageSparks.map((spark) => (
            <span key={spark} className={`splash-screen__spark splash-screen__spark--${spark}`} />
          ))}

          <div className="splash-screen__logo-stage">
            <img src="/admin-monitor-logo.svg" className="splash-screen__table-logo" alt="" />
            <div className="splash-screen__logo-reflection" />

            <div className="splash-screen__map-overlay">
              <span className="splash-screen__scan-beam" />
              <span className="splash-screen__scan-hotspot" />

              <svg viewBox="0 0 420 300" className="splash-screen__route-svg">
                <path className="route-svg__shadow" pathLength="1" d="M145 101 L181 132 L216 148 L264 146" />
                <path className="route-svg__primary" pathLength="1" d="M145 101 L181 132 L216 148 L264 146" />
              </svg>

              <span className="splash-screen__route-node splash-screen__route-node--start" />
              <span className="splash-screen__route-node splash-screen__route-node--mid" />
              <span className="splash-screen__route-node splash-screen__route-node--target" />
              <span className="splash-screen__route-traveler" />
              <span className="splash-screen__route-label splash-screen__route-label--start">Start</span>
              <span className="splash-screen__route-label splash-screen__route-label--target">Ziel</span>
              <span className="splash-screen__arrival-burst" />
            </div>

            <div className="splash-screen__nameplate">
              <strong>PATHFINDER</strong>
              <span>Route surface // projected navigation table</span>
            </div>
          </div>
        </div>

        <div className="splash-screen__status-block">
          <div className="splash-screen__status-head" aria-live="polite">
            <span className="splash-screen__status-label">Route boot</span>
            <strong>{loadingPhases[activePhaseIndex]}</strong>
          </div>

          <progress className="splash-screen__progress-bar" aria-label="Pathfinder loading progress" max={100} value={progress} />

          <div className="splash-screen__status-meta">
            <span>{progress}%</span>
            <span>{audioCueLabel}</span>
          </div>

          {audioCueBlocked && !useMinimalMotion ? (
            <button type="button" className="splash-screen__sound-button" onClick={handleSoundEnable}>
              Sound aktivieren
            </button>
          ) : null}

          <div className="splash-screen__pill-row">
            {routePills.map((pill, index) => (
              <span key={pill} className={`splash-screen__pill ${index <= activePhaseIndex ? 'is-active' : ''}`}>
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default SplashScreen
