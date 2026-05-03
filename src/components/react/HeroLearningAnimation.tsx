// Hero figure — walks slowly across the hero in a bezier path.
// The neural network lives in dev-mode globe only.
// Pure meditation: figure, breath, occasional arm raise. Nothing else.

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }
interface Dims { w: number; h: number }

// ─── Constants ────────────────────────────────────────────────────────────────

const WALK_SPEED  = 35          // px / sec
const PAUSE_DUR   = 3.0         // s
const STALE_MS    = 30 * 60 * 1000
const STORAGE_KEY = 'hero-fig-state'

const WAYPOINTS: Pt[] = [
  { x: 0.18, y: 0.42 }, { x: 0.72, y: 0.38 }, { x: 0.32, y: 0.78 },
  { x: 0.58, y: 0.82 }, { x: 0.84, y: 0.62 }, { x: 0.12, y: 0.68 },
  { x: 0.46, y: 0.30 }, { x: 0.66, y: 0.72 }, { x: 0.28, y: 0.55 },
  { x: 0.90, y: 0.45 }, { x: 0.38, y: 0.20 }, { x: 0.76, y: 0.58 },
]

// ─── Bezier helpers ───────────────────────────────────────────────────────────

function bPt(t: number, p0: Pt, p1: Pt, p2: Pt): Pt {
  const u = 1 - t
  return { x: u*u*p0.x + 2*u*t*p1.x + t*t*p2.x, y: u*u*p0.y + 2*u*t*p1.y + t*t*p2.y }
}

function bLen(p0: Pt, p1: Pt, p2: Pt, n = 16): number {
  let len = 0, prev = p0
  for (let i = 1; i <= n; i++) {
    const cur = bPt(i / n, p0, p1, p2)
    len += Math.hypot(cur.x - prev.x, cur.y - prev.y)
    prev = cur
  }
  return len
}

function ctrlPt(p0: Pt, p2: Pt, side: number): Pt {
  const dx = p2.x - p0.x, dy = p2.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const off = 40 + Math.random() * 20
  return {
    x: (p0.x + p2.x) / 2 + (-dy / len) * off * side,
    y: (p0.y + p2.y) / 2 + (dx / len) * off * side,
  }
}

// ─── Persistence (figure position only) ──────────────────────────────────────

function loadWpIdx(): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const s: { wpIdx: number; savedAt: number } = JSON.parse(raw)
    if (Date.now() - s.savedAt > STALE_MS) { sessionStorage.removeItem(STORAGE_KEY); return 0 }
    return (s.wpIdx ?? 0) % WAYPOINTS.length
  } catch { return 0 }
}

function saveWpIdx(wpIdx: number) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ wpIdx, savedAt: Date.now() })) } catch {}
}

// ─── Static figure (reduced-motion fallback) ──────────────────────────────────

function StaticFigure({ dims }: { dims: Dims }) {
  const wp = WAYPOINTS[0]
  const x = wp.x * dims.w
  const y = wp.y * dims.h
  const S = 'rgba(255,255,255,0.48)'
  const sw = 1.2
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={4} cy={-32} fill="none" stroke={S} strokeWidth={sw} />
      <line x1={0} y1={-28} x2={0} y2={-14} stroke={S} strokeWidth={sw} strokeLinecap="round" />
      <line x1={-9} y1={-23} x2={9} y2={-23} stroke={S} strokeWidth={sw} strokeLinecap="round" />
      <line x1={0} y1={-14} x2={-6} y2={0} stroke={S} strokeWidth={sw} strokeLinecap="round" />
      <line x1={0} y1={-14} x2={6} y2={0} stroke={S} strokeWidth={sw} strokeLinecap="round" />
    </g>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HeroLearningAnimation() {
  const containerRef = useRef<HTMLDivElement>(null)
  const figGroupRef  = useRef<SVGGElement>(null)
  const leftArmRef   = useRef<SVGLineElement>(null)
  const rafRef       = useRef(0)
  const isVisRef     = useRef(true)
  const dimsRef      = useRef<Dims>({ w: 0, h: 0 })
  const prefersReduced = useReducedMotion()

  const [dims, setDims] = useState<Dims>({ w: 0, h: 0 })

  // ResizeObserver always runs so dims is available for reduced-motion render too
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      dimsRef.current = { w: width, h: height }
      setDims({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Animation loop (normal mode only)
  useEffect(() => {
    if (prefersReduced) return

    const container = containerRef.current
    if (!container) return

    // IntersectionObserver — pause DOM updates when scrolled out
    const io = new IntersectionObserver(([e]) => { isVisRef.current = e.isIntersecting }, { threshold: 0 })
    io.observe(container)

    // Pause RAF when tab is hidden
    const onVisChange = () => {
      if (document.hidden) cancelAnimationFrame(rafRef.current)
      else rafRef.current = requestAnimationFrame(loop)
    }
    document.addEventListener('visibilitychange', onVisChange)

    const startWpIdx = loadWpIdx()

    // All animation state lives here — never in React state
    const st = {
      phase: 'pausing' as 'walking' | 'pausing',
      phaseElapsed: PAUSE_DUR, // immediately transition to walking on first tick
      wpIdx: startWpIdx,

      p0: { x: 0, y: 0 } as Pt,
      p1: { x: 0, y: 0 } as Pt,
      p2: { x: 0, y: 0 } as Pt,
      pathT: 0,
      pathDur: 1,
      figX: 0,
      figY: 0,

      legPhase:    0,
      breathPhase: 0,
      swayPhase:   0,
      armAngle:    0,
      pauseCount:  0,
      ctrlSide:    1 as 1 | -1,

      lastSave:       0,
      prevTimestamp:  0,
    }

    const initD = dimsRef.current
    st.figX = WAYPOINTS[startWpIdx].x * (initD.w || 800)
    st.figY = WAYPOINTS[startWpIdx].y * (initD.h || 500)

    // Direct DOM update — zero React re-renders per frame
    const updateFigDOM = () => {
      const fig = figGroupRef.current
      if (!fig) return

      const breathScale = st.phase === 'pausing'
        ? 1 + 0.02 * Math.sin(st.breathPhase * Math.PI * 2) : 1
      const sway = st.phase === 'pausing'
        ? Math.sin(st.swayPhase * Math.PI * 2) : 0

      fig.setAttribute('transform', `translate(${st.figX + sway},${st.figY}) scale(${breathScale})`)

      const swing = Math.sin(st.legPhase * Math.PI * 2) * 6
      const legL = fig.querySelector<SVGLineElement>('.ha-leg-l')
      const legR = fig.querySelector<SVGLineElement>('.ha-leg-r')
      if (legL) { legL.setAttribute('x2', String(-swing)); legL.setAttribute('y2', '0') }
      if (legR) { legR.setAttribute('x2', String(swing));  legR.setAttribute('y2', '0') }

      const lArm = leftArmRef.current
      if (lArm) {
        const rad = (st.armAngle * Math.PI) / 180
        lArm.setAttribute('x2', String(-9 * Math.cos(rad)))
        lArm.setAttribute('y2', String(-9 * Math.sin(rad) - 23))
      }
    }

    const startWalking = () => {
      const d = dimsRef.current
      const leavingIdx = st.wpIdx
      const wp = WAYPOINTS[leavingIdx]
      const toIdx = (leavingIdx + 1) % WAYPOINTS.length
      const to = WAYPOINTS[toIdx]

      st.p0 = { x: wp.x * d.w, y: wp.y * d.h }
      st.p2 = { x: to.x * d.w, y: to.y * d.h }
      st.p1 = ctrlPt(st.p0, st.p2, st.ctrlSide)
      st.ctrlSide = -st.ctrlSide as 1 | -1
      st.pathT   = 0
      st.pathDur = bLen(st.p0, st.p1, st.p2) / WALK_SPEED
      st.wpIdx   = toIdx
      st.phase   = 'walking'
      st.phaseElapsed = 0
    }

    const arriveAtWaypoint = () => {
      st.phase = 'pausing'
      st.phaseElapsed = 0
      st.legPhase = 0
      st.armAngle = 0
      st.pauseCount++

      const d = dimsRef.current
      const wp = WAYPOINTS[st.wpIdx]
      st.figX = wp.x * d.w
      st.figY = wp.y * d.h
    }

    const loop = (ts: DOMHighResTimeStamp) => {
      if (document.hidden) { rafRef.current = requestAnimationFrame(loop); return }

      const dt = st.prevTimestamp === 0
        ? 0 : Math.min((ts - st.prevTimestamp) / 1000, 0.05)
      st.prevTimestamp = ts

      if (!isVisRef.current) { rafRef.current = requestAnimationFrame(loop); return }

      const d = dimsRef.current
      if (d.w === 0) { rafRef.current = requestAnimationFrame(loop); return }

      if (st.phase === 'walking') {
        st.legPhase = (st.legPhase + dt / 0.6) % 1
        st.phaseElapsed += dt
        st.pathT = Math.min(1, st.pathT + dt / st.pathDur)

        const pos = bPt(st.pathT, st.p0, st.p1, st.p2)
        st.figX = pos.x
        st.figY = pos.y

        if (st.pathT >= 1) arriveAtWaypoint()
      } else {
        st.phaseElapsed += dt
        st.breathPhase  += dt / 3
        st.swayPhase    += dt / 4

        // Arm raises at every 3rd pause, in the middle of the pause
        const doArm = st.pauseCount % 3 === 2
        if (doArm) {
          const t = st.phaseElapsed
          if      (t >= 0.9 && t < 1.5) st.armAngle = ((t - 0.9) / 0.6) * 30
          else if (t >= 1.5 && t < 2.1) st.armAngle = (1 - (t - 1.5) / 0.6) * 30
          else                           st.armAngle = 0
        }

        if (st.phaseElapsed >= PAUSE_DUR) startWalking()
      }

      updateFigDOM()

      // Persist figure position every 2 s
      st.lastSave += dt
      if (st.lastSave >= 2) { st.lastSave = 0; saveWpIdx(st.wpIdx) }

      rafRef.current = requestAnimationFrame(loop)
    }

    const onUnload = () => saveWpIdx(st.wpIdx)
    window.addEventListener('beforeunload', onUnload)
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisChange)
      window.removeEventListener('beforeunload', onUnload)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReduced])

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
      aria-hidden="true"
    >
      {dims.w > 0 && (
        <svg
          width={dims.w} height={dims.h}
          style={{ display: 'block', overflow: 'visible' }}
        >
          {prefersReduced ? (
            // Reduced motion: static figure at first waypoint, no animation
            <StaticFigure dims={dims} />
          ) : (
            // Animated figure — position driven by direct DOM writes in RAF loop
            <g ref={figGroupRef}>
              <circle r={4} cy={-32} fill="none" stroke="rgba(255,255,255,0.48)" strokeWidth={1.2} />
              <line x1={0} y1={-28} x2={0} y2={-14} stroke="rgba(255,255,255,0.48)" strokeWidth={1.2} strokeLinecap="round" />
              <line ref={leftArmRef} x1={0} y1={-23} x2={-9} y2={-23} stroke="rgba(255,255,255,0.48)" strokeWidth={1.2} strokeLinecap="round" />
              <line x1={0} y1={-23} x2={9} y2={-23} stroke="rgba(255,255,255,0.48)" strokeWidth={1.2} strokeLinecap="round" />
              <line className="ha-leg-l" x1={0} y1={-14} x2={-6} y2={0} stroke="rgba(255,255,255,0.48)" strokeWidth={1.2} strokeLinecap="round" />
              <line className="ha-leg-r" x1={0} y1={-14} x2={6} y2={0} stroke="rgba(255,255,255,0.48)" strokeWidth={1.2} strokeLinecap="round" />
            </g>
          )}
        </svg>
      )}
    </div>
  )
}
