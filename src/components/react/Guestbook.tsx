/**
 * GUESTBOOK BACKEND
 *
 * Entries are stored in a Cloudflare Worker + KV.
 *
 * Setup (one-time):
 *   1. Deploy the Worker — see /cloudflare-worker/README.md
 *   2. Replace WORKER_URL below with your Worker's URL
 *
 * Free tier limits (impossible to hit for a portfolio):
 *   - 100,000 reads per day
 *   - 1,000 writes per day
 *   - Storage: 1 GB
 *
 * View entries:
 *   Cloudflare Dashboard → Workers & Pages → KV → guestbook-entries
 *
 * Spam protection:
 *   - Rate limit: 3 submissions per IP per hour (handled in Worker)
 *   - Honeypot field: bots fill it, humans don't
 *   - Max name 30 chars, max message 80 chars
 */

// ─── UPDATE THIS after deploying the Worker ────────────────────────────────
const WORKER_URL = 'https://guestbook.robertozuca27.workers.dev'
// ──────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { useReducedMotion } from 'framer-motion'
import seed from '../../data/guestbook-seed.json'

interface Entry {
  name: string
  country: string
  message: string
  date: string
}

const LOCAL_KEY = 'guestbook-local'
const MAX_DISPLAY = 50

const COUNTRIES = [
  '🌍','🇺🇸','🇪🇸','🇬🇧','🇫🇷','🇩🇪','🇮🇹','🇯🇵','🇰🇷','🇧🇷',
  '🇲🇽','🇦🇷','🇵🇹','🇳🇱','🇧🇪','🇨🇳','🇮🇳','🇦🇺','🇸🇪','🇳🇴',
  '🇩🇰','🇵🇱','🇨🇭','🇨🇦','🇳🇿','🇿🇦','🇳🇬','🇲🇦','🇸🇦','🇹🇷',
]

function readLocal(): Entry[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') } catch { return [] }
}

function writeLocal(entries: Entry[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(0, 20))) } catch {}
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}

function mergeEntries(remote: Entry[], local: Entry[]): Entry[] {
  const combined = [...remote, ...local, ...seed.entries]
  const seen = new Set<string>()
  return combined
    .filter(e => {
      const k = `${e.date}|${e.name}|${e.message}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_DISPLAY)
}

export default function Guestbook() {
  const prefersReduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([...seed.entries])
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)

  const [nameInput, setNameInput]       = useState('')
  const [countryInput, setCountryInput] = useState('🌍')
  const [msgInput, setMsgInput]         = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [submitted, setSubmitted]       = useState(false)
  const [formError, setFormError]       = useState('')

  // ── Load entries from Worker when panel opens ──
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setOffline(false)

    async function load() {
      try {
        const res = await fetch(WORKER_URL, { method: 'GET' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: { entries: Entry[] } = await res.json()
        if (cancelled) return
        setEntries(mergeEntries(data.entries, readLocal()))
      } catch {
        if (!cancelled) {
          setOffline(true)
          setEntries(mergeEntries([], readLocal()))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [open])

  // ── Submit ──
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const name = nameInput.trim()
    const message = msgInput.trim()
    if (!name || !message) { setFormError('Name and message required.'); return }
    setFormError('')
    setSubmitting(true)

    const newEntry: Entry & { website: string } = {
      name: name.slice(0, 30),
      country: countryInput || '🌍',
      message: message.slice(0, 80),
      date: new Date().toISOString().slice(0, 10),
      website: '', // honeypot — leave empty
    }

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setFormError(
          res.status === 429
            ? 'Too many submissions. Try again in an hour.'
            : (data.error || 'Could not save. Please try again.'),
        )
        setSubmitting(false)
        return
      }
    } catch {
      setFormError('Network error — saving locally as backup.')
    }

    // Always update UI + save backup regardless of Worker result
    const { website: _w, ...stored } = newEntry
    const updated = [stored, ...readLocal()]
    writeLocal(updated)
    setEntries(prev => [stored, ...prev])
    setNameInput(''); setMsgInput(''); setCountryInput('🌍')
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 1500)
    setSubmitting(false)
  }, [nameInput, countryInput, msgInput, submitting])

  const EASE = prefersReduced ? 'none' : 'all 250ms cubic-bezier(0.4,0,0.2,1)'

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Expanded panel ── */}
      {open && (
        <div style={{
          position: 'absolute', bottom: '2.5rem', left: 0,
          width: 'min(320px, 90vw)', maxHeight: '70vh',
          background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '1rem',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          zIndex: 50,
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
            }}>
              Visitors · {entries.length}
              {offline && (
                <span style={{ color: '#FF5C00', marginLeft: '0.5rem' }}>OFFLINE</span>
              )}
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close guestbook"
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px', padding: '0 0.25rem', lineHeight: 1 }}>
              ×
            </button>
          </div>

          {/* Entry list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 1rem' }}>
            {loading ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.3)', padding: '1rem 0', textAlign: 'center', letterSpacing: '0.06em' }}>
                Loading entries…
              </div>
            ) : (
              entries.map((e, i) => (
                <div key={i} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>
                    {e.country} <strong style={{ color: '#fff' }}>{e.name}</strong> — {e.message}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.28)', marginTop: '0.15rem', letterSpacing: '0.04em' }}>
                    {fmtDate(e.date)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'relative' }}>
            {/* Honeypot — invisible to humans, bots fill it */}
            <input type="text" name="website" value="" onChange={() => {}} tabIndex={-1}
              autoComplete="off" aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
            />

            {submitted ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#FF5C00', textAlign: 'center', padding: '0.5rem 0', letterSpacing: '0.08em' }}>
                ✓ Marked.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    value={nameInput} onChange={e => setNameInput(e.target.value.slice(0, 30))}
                    placeholder="Name" maxLength={30} required
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.375rem',
                      padding: '0.375rem 0.5rem', color: '#fff',
                      fontFamily: 'var(--font-sans)', fontSize: '12px', outline: 'none',
                    }}
                  />
                  <select value={countryInput} onChange={e => setCountryInput(e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '0.375rem', padding: '0.375rem 0.25rem', color: '#fff',
                      fontFamily: 'var(--font-sans)', fontSize: '14px', outline: 'none', cursor: 'pointer',
                    }}>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <input
                  value={msgInput} onChange={e => setMsgInput(e.target.value.slice(0, 80))}
                  placeholder="Leave a mark… (max 80 chars)" maxLength={80} required
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.375rem',
                    padding: '0.375rem 0.5rem', color: '#fff',
                    fontFamily: 'var(--font-sans)', fontSize: '12px', outline: 'none',
                    boxSizing: 'border-box', marginBottom: '0.5rem',
                  }}
                />

                {formError && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#FF5C00', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                    {formError}
                  </div>
                )}

                <button type="submit" disabled={submitting} style={{
                  display: 'block', width: '100%',
                  padding: '0.4rem 1rem',
                  background: submitting ? 'rgba(255,92,0,0.35)' : '#FF5C00',
                  color: '#0A0A0A', border: 'none', borderRadius: '9999px',
                  fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: submitting ? 'default' : 'pointer', transition: EASE,
                }}>
                  {submitting ? '…' : 'Sign'}
                </button>
              </>
            )}
          </form>
        </div>
      )}

      {/* ── Trigger pill ── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'rgba(10,10,10,0.82)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '9999px',
          padding: '0.35rem 0.875rem', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em',
          color: '#FF5C00', textTransform: 'uppercase', whiteSpace: 'nowrap',
          transition: EASE,
        }}
      >
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: '#FF5C00', flexShrink: 0,
          animation: 'dmPulse 2s ease-in-out infinite',
        }} />
        + Leave a mark
      </button>
    </div>
  )
}
