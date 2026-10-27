import { defineEventHandler, getQuery, getRequestIP, getRequestHeader, createError } from 'h3'
import { useRuntimeConfig } from '#imports'

const UNIQUE_ID = /^[A-Za-z0-9._]{1,64}$/
const TOKEN_TTL_SEC = 600
const MAX_TRACKED_IPS = 5000

// ponytail: per-process limiter; behind several instances each keeps its own window.
const hits = new Map<string, { count: number, resetAt: number }>()

function allow(ip: string, perMinute: number): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || entry.resetAt <= now) {
    if (!entry && hits.size >= MAX_TRACKED_IPS) {
      for (const [key, value] of hits) {
        if (value.resetAt <= now) hits.delete(key)
      }
      if (hits.size >= MAX_TRACKED_IPS) hits.delete(hits.keys().next().value as string)
    }
    hits.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  entry.count++
  return entry.count <= perMinute
}

// The API key stays on the server; the browser only receives a short-lived
// token scoped to one allowed creator.
export default defineEventHandler(async (event) => {
  const uniqueId = String(getQuery(event).uniqueId ?? '').replace(/^@/, '').toLowerCase()
  if (!UNIQUE_ID.test(uniqueId)) {
    throw createError({ statusCode: 400, message: 'Invalid uniqueId' })
  }
  const config = useRuntimeConfig().tiktool as { apiKey?: string, creators?: string[], allowAnyCreator?: boolean, trustProxy?: boolean, tokensPerMinute?: number } | undefined
  if (!config?.apiKey) {
    throw createError({ statusCode: 500, message: 'TikTool API key is not configured' })
  }
  const allowed = (config.creators ?? []).map(c => c.replace(/^@/, '').toLowerCase())
  if (!config.allowAnyCreator && !allowed.includes(uniqueId)) {
    throw createError({ statusCode: 403, message: 'Creator is not enabled for this site' })
  }
  // Behind a proxy the socket address is the proxy itself, so the client
  // address has to come from the forwarding headers the proxy sets.
  const ip = (config.trustProxy
    ? getRequestHeader(event, 'cf-connecting-ip') || getRequestIP(event, { xForwardedFor: true })
    : getRequestIP(event, { xForwardedFor: false })) ?? 'unknown'
  if (!allow(ip, config.tokensPerMinute || 10)) {
    throw createError({ statusCode: 429, message: 'Too many requests' })
  }
  try {
    const res = await $fetch<{ data?: { token?: string } }>('https://api.tik.tools/authentication/jwt', {
      method: 'POST',
      headers: { 'x-api-key': config.apiKey },
      body: { expire_after: TOKEN_TTL_SEC, allowed_creators: [uniqueId] },
    })
    if (!res?.data?.token) throw new Error('empty token')
    return { token: res.data.token }
  } catch {
    throw createError({ statusCode: 502, message: 'Could not create a live connection token' })
  }
})
