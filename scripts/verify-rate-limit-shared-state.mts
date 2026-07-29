// Multi-instance proof for RM-012's shared rate limiter: opens two
// independent pg.Client connections (simulating two serverless instances
// that share zero JS process memory — exactly the failure mode the old
// in-memory Map had) and fires concurrent check_rate_limit calls for the
// same identity key. If the combined count is enforced correctly, the limit
// is genuinely shared across "instances" rather than per-connection state.
//
// Isolation model (different from supabase/tests/functional/run.mts): this
// script intentionally COMMITS, because proving cross-connection visibility
// requires each connection's writes to actually be durable and visible to
// the other connection — a single rolled-back transaction can't demonstrate
// that. It cleans up its own rows by scope/identity at the end instead.
//
// Not wired into `npm test` (needs a live disposable Postgres, e.g. from
// `supabase start`). Run manually:
//   node --experimental-strip-types scripts/verify-rate-limit-shared-state.mts
import assert from 'node:assert/strict'
import pg from 'pg'

const { Client } = pg

const DATABASE_URL =
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const SCOPE = 'verify_multi_instance'
const IDENTITY = `verify-${Date.now()}`
const LIMIT = 5

async function main() {
  const clientA = new Client({ connectionString: DATABASE_URL })
  const clientB = new Client({ connectionString: DATABASE_URL })
  await clientA.connect()
  await clientB.connect()

  try {
    await clientA.query(
      `insert into public.rate_limit_scope_config (scope, limit_count, window_seconds, shadow_mode)
       values ($1, $2, 3600, false)
       on conflict (scope) do update set limit_count = excluded.limit_count, window_seconds = excluded.window_seconds, shadow_mode = excluded.shadow_mode`,
      [SCOPE, LIMIT],
    )

    // Fire LIMIT + 5 concurrent calls split across two separate connections,
    // interleaved, for the same identity_key. If the limiter were still
    // per-connection (the old bug), each connection would independently
    // allow up to LIMIT calls — 2x too many would succeed.
    const callCount = LIMIT + 5
    const calls = Array.from({ length: callCount }, (_, i) => {
      const client = i % 2 === 0 ? clientA : clientB
      return client.query(
        `select public.check_rate_limit($1, $2, null, null) as result`,
        [SCOPE, IDENTITY],
      )
    })
    const results = await Promise.all(calls)
    const allowedCount = results.filter((r) => r.rows[0].result.allowed === true).length

    assert.equal(
      allowedCount,
      LIMIT,
      `expected exactly ${LIMIT} of ${callCount} concurrent calls across two connections to be allowed, got ${allowedCount} — the limiter is not actually shared across connections`,
    )
    console.log(`OK: ${allowedCount}/${callCount} concurrent calls allowed across two independent connections, matching the shared limit of ${LIMIT}.`)
  } finally {
    await clientA.query('delete from public.rate_limit_events where scope = $1 and identity_key = $2', [SCOPE, IDENTITY])
    await clientA.query('delete from public.rate_limit_scope_config where scope = $1', [SCOPE])
    await clientA.end()
    await clientB.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
