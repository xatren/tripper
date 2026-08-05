/**
 * Guest ("try without an account") login is a testing affordance. It mints a
 * real Supabase user, so it stays off unless explicitly enabled per environment.
 * NEXT_PUBLIC_ so the login page and the API route read the same switch.
 */
// Trimmed: values piped into `vercel env add` pick up a trailing newline, which
// silently turned the flag off even though the dashboard showed "true".
export const GUEST_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GUEST_LOGIN?.trim() === 'true'
