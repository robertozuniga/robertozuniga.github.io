// === ADDING NEW PROJECTS ===
// 1. Create a new MDX file in src/content/projects/
// 2. (Optional) Add a location field with city, country, lat, lng
// 3. Set the order field to control sort order on /work
// 4. Set featured: true to include on the home page (max 4)
// No code changes needed here — the globe adapts automatically.

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface ProjectData {
  slug: string
  title: string
  subtitle: string
  date: string
  location: { city: string; country: string; lat: number; lng: number } | null
  cover: string
}

interface Props {
  projects: ProjectData[]
  onSwitchToTimeline?: () => void
}

interface HoverState {
  index: number
  screenX: number
  screenY: number
}

// ─── Continent bounding boxes (Bug 3) ────────────────────────────────────────

interface BoundBox {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

// NOTE: lng values here use the atan2(z, x) coordinate system where
// new_lng = -lng_geographic. All longitude ranges are negated vs geographic.
const CONTINENT_BOUNDS: BoundBox[] = [
  // North America (geo -168→-52 becomes 52→168; geo -118→-77 becomes 77→118)
  { minLat: 25, maxLat: 70, minLng: 52, maxLng: 168 },
  { minLat: 8, maxLat: 25, minLng: 77, maxLng: 118 },
  // South America (geo -82→-34 becomes 34→82)
  { minLat: -56, maxLat: 12, minLng: 34, maxLng: 82 },
  // Europe (geo -10→40 becomes -40→10; geo -10→2 becomes -2→10)
  { minLat: 36, maxLat: 71, minLng: -40, maxLng: 10 },
  { minLat: 50, maxLat: 60, minLng: -2, maxLng: 10 },
  // Africa (geo -18→51 becomes -51→18)
  { minLat: -35, maxLat: 37, minLng: -51, maxLng: 18 },
  // Asia broad (geo 40→180 becomes -180→-40)
  { minLat: 5, maxLat: 75, minLng: -180, maxLng: -40 },
  // India (geo 68→97 becomes -97→-68)
  { minLat: 8, maxLat: 30, minLng: -97, maxLng: -68 },
  // SE Asia (geo 95→141 becomes -141→-95)
  { minLat: -10, maxLat: 25, minLng: -141, maxLng: -95 },
  // Australia (geo 113→154 becomes -154→-113)
  { minLat: -44, maxLat: -10, minLng: -154, maxLng: -113 },
  // Greenland (geo -73→-12 becomes 12→73)
  { minLat: 60, maxLat: 83, minLng: 12, maxLng: 73 },
]

const OCEAN_CARVES: BoundBox[] = [
  // Hudson Bay (geo -95→-78 becomes 78→95)
  { minLat: 51, maxLat: 63, minLng: 78, maxLng: 95 },
  // Black Sea (geo 27→42 becomes -42→-27)
  { minLat: 41, maxLat: 47, minLng: -42, maxLng: -27 },
  // Red Sea + Persian Gulf (geo 32→56 becomes -56→-32)
  { minLat: 12, maxLat: 30, minLng: -56, maxLng: -32 },
]

function isLand(lat: number, lng: number): boolean {
  const inLand = CONTINENT_BOUNDS.some(
    (b) => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng,
  )
  if (!inLand) return false
  return !OCEAN_CARVES.some(
    (b) => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng,
  )
}

// ─── Geographic helpers ───────────────────────────────────────────────────────

function latLngTo3D(lat: number, lng: number, radius = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

function xyzToLatLng(x: number, y: number, z: number): [number, number] {
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) * (180 / Math.PI)
  const lng = Math.atan2(z, -x) * (180 / Math.PI) - 180
  return [lat, lng < -180 ? lng + 360 : lng]
}

function buildTangentFrame(normal: THREE.Vector3): {
  t1: THREE.Vector3
  t2: THREE.Vector3
} {
  const up = new THREE.Vector3(0, 1, 0)
  let t1 = new THREE.Vector3().crossVectors(up, normal)
  if (t1.length() < 0.001) t1.set(1, 0, 0)
  t1.normalize()
  const t2 = new THREE.Vector3().crossVectors(normal, t1).normalize()
  return { t1, t2 }
}

// ─── Info card ────────────────────────────────────────────────────────────────

function InfoCard({
  project,
  screenX,
  screenY,
  canvasW,
  canvasH,
}: {
  project: ProjectData
  screenX: number
  screenY: number
  canvasW: number
  canvasH: number
}) {
  const cardW = 248
  const cardH = 118
  let x = screenX + 20
  let y = screenY - cardH - 12
  if (x + cardW > canvasW - 8) x = screenX - cardW - 20
  if (y < 8) y = screenY + 16
  if (y + cardH > canvasH - 8) y = canvasH - cardH - 8

  const label = new Date(project.date)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase()

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: cardW,
        background: 'rgba(18, 18, 18, 0.94)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.1em',
          color: '#FF5C00',
          marginBottom: '0.3rem',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          fontWeight: 500,
          color: '#FAFAFA',
          marginBottom: '0.2rem',
          lineHeight: 1.3,
        }}
      >
        {project.title}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          color: '#71717A',
          lineHeight: 1.4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {project.subtitle}
      </div>
      {project.location && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.28)',
            marginTop: '0.4rem',
            textTransform: 'uppercase',
          }}
        >
          {project.location.city}, {project.location.country}
        </div>
      )}
    </div>
  )
}

// ─── Globe component ──────────────────────────────────────────────────────────

export default function ProjectGlobe({ projects, onSwitchToTimeline }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoverState, setHoverState] = useState<HoverState | null>(null)
  const [webglOk, setWebglOk] = useState(true)
  const [canvasSize, setCanvasSize] = useState({ w: 1, h: 1 })

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const frameIdRef = useRef(0)
  const glowsRef = useRef<{ mesh: THREE.Mesh; idx: number }[]>([])
  const pinDotsRef = useRef<THREE.Mesh[]>([])
  const hitboxesRef = useRef<THREE.Mesh[]>([])
  const pinWorldRef = useRef<THREE.Vector3[]>([])
  const hoveredIdxRef = useRef<number | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const isTouchRef = useRef(false)

  // Only show projects that have geographic data (Bug 6)
  const projectsWithLocation = projects.filter((p) => p.location !== null)

  // ── Scene setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const testCtx = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!testCtx) { setWebglOk(false); return }

    const isMobile = window.innerWidth < 768
    const W = container.clientWidth
    const H = container.clientHeight
    setCanvasSize({ w: W, h: H })

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x0a0a0a, 1)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100)
    camera.position.z = 2.5
    cameraRef.current = camera

    // ── Wireframe sphere (Bug 3: slightly more visible) ──
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 48),
        new THREE.MeshBasicMaterial({ wireframe: true, color: 0xffffff, transparent: true, opacity: 0.06 }),
      ),
    )

    // ── Atmosphere ──
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.08, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0x4a90e2, transparent: true, opacity: 0.06, side: THREE.BackSide }),
      ),
    )

    // ── Land dots — Fibonacci sphere, uniform over BOTH hemispheres ──
    // y goes from +1 (north pole) to -1 (south pole) — no early exit, full coverage
    const NUM_POINTS = isMobile ? 1500 : 3500
    const goldenAngle = Math.PI * (3 - Math.sqrt(5)) // ~2.39996 rad
    const landDots: { x: number; y: number; z: number }[] = []

    for (let i = 0; i < NUM_POINTS; i++) {
      // y from +1 to -1 covers BOTH hemispheres — this was the root bug
      const y = 1 - (i / (NUM_POINTS - 1)) * 2

      // ring radius at this latitude
      const ringRadius = Math.sqrt(1 - y * y)

      // golden-angle spiral around the y axis
      const theta = goldenAngle * i

      // 3D cartesian coordinates on unit sphere
      const x = Math.cos(theta) * ringRadius
      const z = Math.sin(theta) * ringRadius

      // lat: asin(y) gives correct latitude [-90, 90]
      // lng: atan2(z, x) gives [-180, 180] — matches the negated CONTINENT_BOUNDS above
      const lat = Math.asin(y) * (180 / Math.PI)
      const lng = Math.atan2(z, x) * (180 / Math.PI)

      if (isLand(lat, lng)) {
        landDots.push({ x, y, z })
      }
    }

    // Individual meshes — position at radius 1.005 (just above wireframe surface)
    landDots.forEach(({ x, y, z }) => {
      const dotGeo = new THREE.SphereGeometry(0.009, 6, 6)
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
      })
      const dot = new THREE.Mesh(dotGeo, dotMat)
      dot.position.set(x * 1.005, y * 1.005, z * 1.005)
      scene.add(dot)
    })

    // ── Project pins — city-grouped arc clusters (Bug 5) ──
    const glows: { mesh: THREE.Mesh; idx: number }[] = []
    const pinDots: THREE.Mesh[] = []
    const hitboxes: THREE.Mesh[] = []
    const pinWorldPositions: THREE.Vector3[] = []

    // Group by city+country (Bug 5)
    interface PinGroup {
      baseLat: number
      baseLng: number
      entries: { project: ProjectData; idx: number }[]
    }
    const groupMap = new Map<string, PinGroup>()
    projectsWithLocation.forEach((project, idx) => {
      const loc = project.location!
      const key = `${loc.city},${loc.country}`
      if (!groupMap.has(key)) {
        groupMap.set(key, { baseLat: loc.lat, baseLng: loc.lng, entries: [] })
      }
      groupMap.get(key)!.entries.push({ project, idx })
    })

    const PIN_GEO = new THREE.SphereGeometry(0.012, 8, 8)
    const PIN_MAT = new THREE.MeshBasicMaterial({ color: 0xff5c00 })
    const GLOW_GEO = new THREE.SphereGeometry(0.028, 8, 8)
    const GLOW_MAT = new THREE.MeshBasicMaterial({
      color: 0xff5c00,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const HIT_GEO = new THREE.SphereGeometry(0.065, 6, 6)
    const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })

    groupMap.forEach((group) => {
      const { baseLat, baseLng, entries } = group
      const surfaceNormal = latLngTo3D(baseLat, baseLng, 1).normalize()
      const n = entries.length

      if (n === 1) {
        // Single pin — simple vertical
        const tipPos = surfaceNormal.clone().multiplyScalar(1.09)
        const stemCenter = surfaceNormal.clone().multiplyScalar(1.05)
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          surfaceNormal,
        )
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4),
          new THREE.MeshBasicMaterial({ color: 0xff5c00, transparent: true, opacity: 0.65 }),
        )
        stem.position.copy(stemCenter)
        stem.quaternion.copy(quat)
        scene.add(stem)

        const dot = new THREE.Mesh(PIN_GEO, PIN_MAT.clone())
        dot.position.copy(tipPos)
        scene.add(dot)

        const glow = new THREE.Mesh(GLOW_GEO, GLOW_MAT.clone())
        glow.position.copy(tipPos)
        scene.add(glow)

        const hit = new THREE.Mesh(HIT_GEO, HIT_MAT.clone())
        hit.position.copy(tipPos)
        hit.userData.projectIndex = entries[0].idx
        scene.add(hit)

        glows.push({ mesh: glow, idx: entries[0].idx })
        pinDots[entries[0].idx] = dot
        hitboxes[entries[0].idx] = hit
        pinWorldPositions[entries[0].idx] = tipPos.clone()
      } else {
        // Cluster — arc arrangement (Bug 5)
        const { t1, t2 } = buildTangentFrame(surfaceNormal)
        const baseAnchor = surfaceNormal.clone().multiplyScalar(1.005)

        // Decorative base ring at city anchor
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.014, 0.024, 20),
          new THREE.MeshBasicMaterial({ color: 0xff5c00, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
        )
        ring.position.copy(baseAnchor)
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), surfaceNormal)
        scene.add(ring)

        entries.forEach(({ project, idx }, i) => {
          const angle = (i / (n - 1)) * Math.PI - Math.PI / 2
          const heightStagger = 0.05 + (i % 2) * 0.03
          const arcRadius = 0.14

          const offset = t1.clone()
            .multiplyScalar(Math.cos(angle) * arcRadius)
            .add(t2.clone().multiplyScalar(Math.sin(angle) * arcRadius * 0.3))

          const pinPos = surfaceNormal.clone()
            .multiplyScalar(1.02 + heightStagger)
            .add(offset)

          // Connecting line from base anchor to pin
          const lineGeo = new THREE.BufferGeometry().setFromPoints([
            baseAnchor.clone(),
            pinPos.clone(),
          ])
          scene.add(
            new THREE.Line(
              lineGeo,
              new THREE.LineBasicMaterial({ color: 0xff5c00, transparent: true, opacity: 0.35 }),
            ),
          )

          const dot = new THREE.Mesh(PIN_GEO, PIN_MAT.clone())
          dot.position.copy(pinPos)
          scene.add(dot)

          const glow = new THREE.Mesh(GLOW_GEO, GLOW_MAT.clone())
          glow.position.copy(pinPos)
          scene.add(glow)

          const hit = new THREE.Mesh(HIT_GEO, HIT_MAT.clone())
          hit.position.copy(pinPos)
          hit.userData.projectIndex = idx
          hit.userData.projectSlug = project.slug
          scene.add(hit)

          glows.push({ mesh: glow, idx })
          pinDots[idx] = dot
          hitboxes[idx] = hit
          pinWorldPositions[idx] = pinPos.clone()
        })
      }
    })

    glowsRef.current = glows
    pinDotsRef.current = pinDots
    hitboxesRef.current = hitboxes.filter(Boolean) // compact sparse array
    pinWorldRef.current = pinWorldPositions

    // ── OrbitControls (Bug 4: zoom enabled; Bug 7: keys disabled) ──
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableZoom = true        // Bug 4
    controls.minDistance = 1.6        // Bug 4
    controls.maxDistance = 4.5        // Bug 4
    controls.zoomSpeed = 0.6          // Bug 4
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.autoRotate = !reducedMotion.current
    controls.autoRotateSpeed = 0.5
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(controls as any).enableKeys = false // Bug 7: stop OrbitControls eating key events

    const pauseRotate = () => {
      controls.autoRotate = false
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    }
    const scheduleResume = () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      if (!reducedMotion.current) {
        resumeTimerRef.current = setTimeout(() => { controls.autoRotate = true }, 3000)
      }
    }
    renderer.domElement.addEventListener('mousedown', pauseRotate)
    renderer.domElement.addEventListener('touchstart', pauseRotate, { passive: true })
    renderer.domElement.addEventListener('mouseup', scheduleResume)
    renderer.domElement.addEventListener('touchend', scheduleResume, { passive: true })

    // ── Render loop ──
    const clock = new THREE.Clock()

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate)
      controls.update()

      const t = clock.getElapsedTime()
      const camDir = camera.position.clone().normalize()

      glowsRef.current.forEach(({ mesh, idx }) => {
        if (!mesh) return
        const pinNormal = mesh.position.clone().normalize()
        const visibility = pinNormal.dot(camDir)

        mesh.visible = visibility >= 0.15
        const dot = pinDotsRef.current[idx]
        if (dot) dot.visible = visibility >= 0.15
        if (visibility < 0.15) return

        const baseOpacity = Math.max(0.08, (visibility - 0.15) / 0.85)
        ;(mesh.material as THREE.MeshBasicMaterial).opacity = 0.28 * baseOpacity

        if (!reducedMotion.current) {
          const pulse = 1.2 + 0.3 * Math.sin(t * Math.PI - idx * 0.3)
          const isHov = hoveredIdxRef.current === idx
          const glowTarget = isHov ? pulse * 1.6 : pulse
          mesh.scale.setScalar(mesh.scale.x + (glowTarget - mesh.scale.x) * 0.12)
          if (dot) {
            const dotTarget = isHov ? 1.4 : 1.0
            dot.scale.setScalar(dot.scale.x + (dotTarget - dot.scale.x) * 0.12)
          }
        }
      })

      renderer.render(scene, camera)
    }
    animate()

    // ── Resize ──
    const handleResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      setCanvasSize({ w, h })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frameIdRef.current)
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('mousedown', pauseRotate)
      renderer.domElement.removeEventListener('touchstart', pauseRotate)
      renderer.domElement.removeEventListener('mouseup', scheduleResume)
      renderer.domElement.removeEventListener('touchend', scheduleResume)
      controls.dispose()
      renderer.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose()
          const mat = obj.material
          if (Array.isArray(mat)) mat.forEach((m: THREE.Material) => m.dispose())
          else (mat as THREE.Material).dispose()
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Raycasting ──────────────────────────────────────────────────────────────
  const doRaycast = useCallback(
    (clientX: number, clientY: number): number | null => {
      const camera = cameraRef.current
      const canvas = canvasRef.current
      if (!camera || !canvas) return null
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      const rc = new THREE.Raycaster()
      rc.setFromCamera(mouse, camera)
      const hits = rc.intersectObjects(hitboxesRef.current.filter(Boolean))
      return hits.length > 0 ? (hits[0].object.userData.projectIndex as number) : null
    },
    [],
  )

  const getScreenPos = useCallback(
    (idx: number): { sx: number; sy: number } => {
      const camera = cameraRef.current!
      const worldPos = pinWorldRef.current[idx]
      const p = worldPos.clone().project(camera)
      return {
        sx: (p.x * 0.5 + 0.5) * canvasSize.w,
        sy: (-p.y * 0.5 + 0.5) * canvasSize.h,
      }
    },
    [canvasSize],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isTouchRef.current) return
      const idx = doRaycast(e.clientX, e.clientY)
      if (idx !== null && hoveredIdxRef.current !== idx) {
        hoveredIdxRef.current = idx
        const { sx, sy } = getScreenPos(idx)
        setHoverState({ index: idx, screenX: sx, screenY: sy })
        if (canvasRef.current) canvasRef.current.style.cursor = 'pointer'
      } else if (idx === null && hoveredIdxRef.current !== null) {
        hoveredIdxRef.current = null
        setHoverState(null)
        if (canvasRef.current) canvasRef.current.style.cursor = 'default'
      }
    },
    [doRaycast, getScreenPos],
  )

  const handleMouseLeave = useCallback(() => {
    hoveredIdxRef.current = null
    setHoverState(null)
  }, [])

  // Bug 2: clear devMode session flag before navigating away from globe
  const navigateToProject = useCallback((slug: string) => {
    sessionStorage.removeItem('devMode')
    window.location.href = `/projects/${slug}`
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const idx = doRaycast(e.clientX, e.clientY)
      if (idx !== null) navigateToProject(projectsWithLocation[idx].slug)
    },
    [doRaycast, navigateToProject, projectsWithLocation],
  )

  const lastTapRef = useRef<number | null>(null)
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      isTouchRef.current = true
      if (e.changedTouches.length === 0) return
      const t = e.changedTouches[0]
      const idx = doRaycast(t.clientX, t.clientY)
      if (idx !== null) {
        if (lastTapRef.current === idx) {
          navigateToProject(projectsWithLocation[idx].slug) // Bug 2
        } else {
          lastTapRef.current = idx
          hoveredIdxRef.current = idx
          const { sx, sy } = getScreenPos(idx)
          setHoverState({ index: idx, screenX: sx, screenY: sy })
        }
      } else {
        lastTapRef.current = null
        hoveredIdxRef.current = null
        setHoverState(null)
      }
    },
    [doRaycast, getScreenPos, navigateToProject, projectsWithLocation],
  )

  if (!webglOk) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
          color: '#71717A',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <span>Globe view requires WebGL.</span>
        {onSwitchToTimeline && (
          <button
            onClick={onSwitchToTimeline}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '9999px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: '#FAFAFA',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.08em',
            }}
          >
            SWITCH TO TIMELINE
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' /* Bug 4 */ }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onTouchEnd={handleTouchEnd}
        aria-hidden="true"
      />

      {hoverState !== null && projectsWithLocation[hoverState.index] && (
        <InfoCard
          project={projectsWithLocation[hoverState.index]}
          screenX={hoverState.screenX}
          screenY={hoverState.screenY}
          canvasW={canvasSize.w}
          canvasH={canvasSize.h}
        />
      )}

      <ul
        aria-label="Projects list"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, overflow: 'hidden' }}
      >
        {projects.map((p) => (
          <li key={p.slug}>
            <a href={`/projects/${p.slug}`}>{p.title}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
