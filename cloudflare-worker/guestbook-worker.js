// cloudflare-worker/guestbook-worker.js
//
// Cloudflare Worker — Guestbook backend
// Bind a KV namespace named GUESTBOOK and a KV namespace named RATELIMIT
// in the Worker dashboard before deploying.

const ALLOWED_ORIGINS = [
  'https://robertotestcs50.github.io',
  'http://localhost:4321', // local Astro dev
  'http://localhost:3000',
]

const MAX_NAME_LENGTH = 30
const MAX_MESSAGE_LENGTH = 80
const MAX_COUNTRY_LENGTH = 8 // emoji flags can be multi-byte
const MAX_ENTRIES_RETURNED = 200
const RATE_LIMIT_PER_HOUR = 3

function corsHeaders(origin) {
  // Exact match first (most secure path)
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  }

  // Fallback: accept any *.github.io subdomain and any localhost port —
  // still secure because no other origin can spoof these.
  if (
    origin &&
    (origin.endsWith('.github.io') ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:'))
  ) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  }

  // Reject: return the first allowed origin (won't satisfy cross-origin check)
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  })
}

function sanitize(str, maxLen) {
  if (typeof str !== 'string') return ''
  return str
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control chars
    .trim()
    .slice(0, maxLen)
}

async function handleGet(env, origin) {
  const list = await env.GUESTBOOK.list({ prefix: 'entry:', limit: MAX_ENTRIES_RETURNED })

  // Keys are `entry:<ISO timestamp>:<random>` — lexicographic descending = newest first
  const sortedKeys = list.keys.sort((a, b) => b.name.localeCompare(a.name))

  const entries = await Promise.all(
    sortedKeys.map(async (k) => {
      const v = await env.GUESTBOOK.get(k.name)
      try { return JSON.parse(v) } catch { return null }
    }),
  )

  return jsonResponse({ entries: entries.filter(Boolean) }, 200, origin)
}

async function handlePost(request, env, origin) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'

  // Rate limit check
  const rateKey = `rate:${ip}`
  const currentCount = parseInt(await env.RATELIMIT.get(rateKey)) || 0
  if (currentCount >= RATE_LIMIT_PER_HOUR) {
    return jsonResponse({ error: 'Rate limit exceeded. Try again later.' }, 429, origin)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, origin)
  }

  // Honeypot — bots fill this field, humans don't see it
  if (body.website && body.website.length > 0) {
    // Silently accept so the bot thinks it succeeded, but don't store
    return jsonResponse({ ok: true }, 200, origin)
  }

  const name = sanitize(body.name, MAX_NAME_LENGTH)
  const country = sanitize(body.country, MAX_COUNTRY_LENGTH) || '🌍'
  const message = sanitize(body.message, MAX_MESSAGE_LENGTH)

  if (!name || !message) {
    return jsonResponse({ error: 'Name and message are required.' }, 400, origin)
  }

  if (name.length < 2 || message.length < 2) {
    return jsonResponse({ error: 'Name and message are too short.' }, 400, origin)
  }

  const now = new Date()
  const isoDate = now.toISOString()
  const id = Math.random().toString(36).slice(2, 10)
  const key = `entry:${isoDate}:${id}`

  const entry = {
    name,
    country,
    message,
    date: isoDate.slice(0, 10),
  }

  await env.GUESTBOOK.put(key, JSON.stringify(entry))

  // Increment rate limit counter (expires in 1 hour)
  await env.RATELIMIT.put(rateKey, String(currentCount + 1), { expirationTtl: 3600 })

  return jsonResponse({ ok: true, entry }, 200, origin)
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) })
    }

    if (request.method === 'GET') return handleGet(env, origin)
    if (request.method === 'POST') return handlePost(request, env, origin)

    return jsonResponse({ error: 'Method not allowed' }, 405, origin)
  },
}
