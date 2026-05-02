# Guestbook Worker

This Worker stores guestbook entries in Cloudflare KV. It's free forever
within Cloudflare's daily limits (100k reads, 1k writes — well above
any realistic portfolio traffic).

## Deploy

1. Log in to https://dash.cloudflare.com
2. Workers & Pages → Create → Create Worker
3. Name: `guestbook` (or whatever you prefer)
4. Deploy the Hello World template
5. After deploy, click **Edit code**
6. Replace ALL contents with the contents of `guestbook-worker.js`
7. Click **Save and Deploy**
8. Click **← Workers & Pages** then click your worker → Settings →
   Variables and Secrets → **Bindings**:
   - Add Binding → KV Namespace → name it `GUESTBOOK` → create new
     namespace (or pick existing) called `guestbook-entries`
   - Add Binding → KV Namespace → name it `RATELIMIT` → create new
     namespace called `guestbook-ratelimit`
9. Copy the Worker URL (e.g. `https://guestbook.YOUR-SUBDOMAIN.workers.dev`)
10. Update `WORKER_URL` constant in `src/components/react/Guestbook.tsx`

## Update CORS allowed origins

Edit `ALLOWED_ORIGINS` in `guestbook-worker.js` to include your live
site domain. Currently set to `https://robertotestcs50.github.io`.

Redeploy the Worker after editing (paste the updated code into the editor
and click Save and Deploy again).

## View entries

Cloudflare dashboard → Workers & Pages → KV → `guestbook-entries` →
View entries. You can read, edit, or delete any entry directly here.

## Spam protection built in

- **Rate limiting** — 3 submissions per IP per hour (via RATELIMIT KV)
- **Honeypot field** — bots fill all fields they find; the Worker
  silently drops entries where `website` is non-empty
- **Input sanitisation** — control characters stripped, lengths capped
- **CORS** — only requests from allowed origins are accepted

## Free tier limits (Cloudflare Workers)

| Resource       | Free limit       | Expected usage |
|----------------|-----------------|----------------|
| Requests       | 100,000 / day   | < 100 / day    |
| KV reads       | 100,000 / day   | < 100 / day    |
| KV writes      | 1,000 / day     | < 10 / day     |
| KV storage     | 1 GB            | < 1 MB total   |
