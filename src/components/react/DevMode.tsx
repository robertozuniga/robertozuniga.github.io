import { useEffect, useRef, lazy, Suspense, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

const ProjectGlobe = lazy(() => import('./ProjectGlobe'))
const ProjectTimeline = lazy(() => import('./ProjectTimeline'))

interface ProjectData {
  slug: string
  title: string
  subtitle: string
  date: string
  location: { city: string; country: string; lat: number; lng: number } | null
  cover: string
}

type ViewMode = 'globe' | 'timeline'

interface Props {
  projects: ProjectData[]
  visible: boolean
  onClose: () => void
  activeView: ViewMode
  onViewChange: (v: ViewMode) => void
}

// ─── Loading spinner ──────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          border: '2px solid rgba(255,255,255,0.08)',
          borderTopColor: '#FF5C00',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Sub-toggle (controlled) ──────────────────────────────────────────────────

function SubToggle({
  view,
  onChange,
}: {
  view: ViewMode
  onChange: (v: ViewMode) => void
}) {
  return (
    <div
      role="group"
      aria-label="Visualization mode"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '9999px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '3px',
        gap: '2px',
      }}
    >
      {(['globe', 'timeline'] as ViewMode[]).map((v) => {
        const active = view === v
        return (
          <button
            key={v}
            aria-pressed={active}
            onClick={() => onChange(v)}
            style={{
              padding: '0.3rem 0.875rem',
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              transition: 'background 180ms ease, color 180ms ease',
              background: active ? 'rgba(255,255,255,0.95)' : 'transparent',
              color: active ? '#0A0A0A' : 'rgba(255,255,255,0.45)',
            }}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}

// ─── DevMode overlay ──────────────────────────────────────────────────────────

export default function DevMode({
  projects,
  visible,
  onClose,
  activeView,
  onViewChange,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  const prefersReduced = useReducedMotion()

  // Dynamic stats (Bug 6)
  const projectCount = projects.length
  const countryCount = new Set(
    projects.filter((p) => p.location).map((p) => p.location!.country),
  ).size
  const yearCount = new Set(
    projects.map((p) => new Date(p.date).getFullYear()),
  ).size

  // Body scroll lock + focus management
  useEffect(() => {
    if (visible) {
      prevFocusRef.current = document.activeElement as HTMLElement
      document.body.dataset.devmode = 'open'
      const t = setTimeout(() => {
        const first = overlayRef.current?.querySelector<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        )
        first?.focus()
      }, 200)
      return () => clearTimeout(t)
    } else {
      delete document.body.dataset.devmode
      prevFocusRef.current?.focus()
    }
  }, [visible])

  // Focus trap — Tab key only; all other shortcuts handled by DevModeToggle (Bug 7)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const el = overlayRef.current
    if (!el) return
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  const motionProps = prefersReduced
    ? { initial: {}, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, scale: 0.985 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0 },
      }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label="Developer view of projects"
          onKeyDown={handleKeyDown}
          {...motionProps}
          transition={
            prefersReduced
              ? { duration: 0 }
              : { duration: 0.2 }
          }
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: '#0A0A0A',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top bar */}
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 1.5rem',
              flexShrink: 0,
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {/* Left: label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#FF5C00',
                  animation: prefersReduced ? 'none' : 'dmPulse 2s ease-in-out infinite',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  letterSpacing: '0.12em',
                  color: '#FF5C00',
                  textTransform: 'uppercase',
                }}
              >
                Dev Mode
              </span>
            </div>

            {/* Center: sub-toggle — view owned by parent (Bug 7) */}
            <SubToggle view={activeView} onChange={onViewChange} />

            {/* Right: spacer so sub-toggle stays centered */}
            <div style={{ width: 80 }} />
          </div>

          {/* Main canvas area */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <AnimatePresence mode="wait">
              {activeView === 'globe' ? (
                <motion.div
                  key="globe"
                  initial={prefersReduced ? {} : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={prefersReduced ? {} : { opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ position: 'absolute', inset: 0 }}
                >
                  <Suspense fallback={<LoadingSpinner />}>
                    <ProjectGlobe
                      projects={projects}
                      onSwitchToTimeline={() => onViewChange('timeline')}
                    />
                  </Suspense>
                </motion.div>
              ) : (
                <motion.div
                  key="timeline"
                  initial={prefersReduced ? {} : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={prefersReduced ? {} : { opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ position: 'absolute', inset: 0 }}
                >
                  <Suspense fallback={<LoadingSpinner />}>
                    <ProjectTimeline projects={projects} />
                  </Suspense>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom bar */}
          <div
            style={{
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 1.5rem',
              flexShrink: 0,
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div
              className="devmode-overlay-content"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.25)',
                textTransform: 'uppercase',
              }}
            >
              {projectCount} Projects&nbsp;·&nbsp;
              {countryCount} Countries&nbsp;·&nbsp;
              {yearCount} Years
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.18)',
                textTransform: 'uppercase',
              }}
            >
              ESC to exit
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
