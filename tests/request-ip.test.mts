import assert from 'node:assert/strict'
import test from 'node:test'
import { getTrustedClientIp } from '../lib/request-ip.ts'

function withVercelEnv<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.VERCEL
  if (value === undefined) delete process.env.VERCEL
  else process.env.VERCEL = value
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.VERCEL
    else process.env.VERCEL = previous
  }
}

test('outside Vercel, forwarded headers are never trusted even if present', () => {
  withVercelEnv(undefined, () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.9',
      'x-vercel-forwarded-for': '203.0.113.9',
      'x-real-ip': '203.0.113.9',
    })
    assert.equal(getTrustedClientIp(headers), null)
  })
})

test('on Vercel, only x-vercel-forwarded-for (or x-real-ip fallback) is trusted, never x-forwarded-for', () => {
  withVercelEnv('1', () => {
    const spoofedOnly = new Headers({ 'x-forwarded-for': '198.51.100.7' })
    assert.equal(getTrustedClientIp(spoofedOnly), null, 'a bare x-forwarded-for header must never be trusted, even on Vercel')

    const trusted = new Headers({
      'x-forwarded-for': '198.51.100.7', // attacker-supplied, must be ignored
      'x-vercel-forwarded-for': '203.0.113.42, 10.0.0.1',
    })
    assert.equal(getTrustedClientIp(trusted), '203.0.113.42', 'must take the first entry of a comma-separated list')

    const realIpFallback = new Headers({ 'x-real-ip': '203.0.113.55' })
    assert.equal(getTrustedClientIp(realIpFallback), '203.0.113.55')

    const nothing = new Headers()
    assert.equal(getTrustedClientIp(nothing), null)
  })
})
