// Mobile-only: track which project card is most visible in the viewport
// and toggle .is-active so only that card shows its subtitle.
// Desktop is unaffected — this guard fires immediately and returns.

let cleanupPrev: (() => void) | null = null

function initActiveCardObserver() {
  if (typeof window === 'undefined') return

  // Only run on touch / no-hover devices
  if (!window.matchMedia('(hover: none)').matches) return

  // Remove listeners from previous run (Astro view transitions)
  if (cleanupPrev) { cleanupPrev(); cleanupPrev = null }

  const cards = Array.from(
    document.querySelectorAll<HTMLElement>('[data-project-card]'),
  )
  if (cards.length === 0) return

  let activeCard: HTMLElement | null = null

  function updateActive() {
    const mid = window.innerHeight / 2
    let best: HTMLElement | null = null
    let bestDist = Infinity

    for (const card of cards) {
      const rect = card.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue
      const dist = Math.abs(rect.top + rect.height / 2 - mid)
      if (dist < bestDist) { bestDist = dist; best = card }
    }

    if (best !== activeCard) {
      activeCard?.classList.remove('is-active')
      best?.classList.add('is-active')
      activeCard = best
    }
  }

  // RAF-throttled scroll handler
  let ticking = false
  const onScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => { updateActive(); ticking = false })
      ticking = true
    }
  }

  updateActive()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', updateActive, { passive: true })

  cleanupPrev = () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', updateActive)
    activeCard?.classList.remove('is-active')
    activeCard = null
  }
}

// Auto-init: on first load and after every Astro view transition
function tryInit() {
  if (typeof window !== 'undefined') initActiveCardObserver()
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit)
  } else {
    tryInit()
  }
  document.addEventListener('astro:page-load', tryInit)
}
