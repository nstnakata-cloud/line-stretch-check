import crypto from 'node:crypto'

export function validLineSignature(raw, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  if (!signature) return false
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export async function pushLine(userId, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return { skipped: true }
  const response = await fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: userId, messages }) })
  if (!response.ok) throw new Error(`LINE push failed: ${response.status}`)
  return { sent: true }
}
