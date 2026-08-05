/**
 * Guest ("try without an account") login is a testing affordance. It mints a
 * real Supabase user, so it stays off unless explicitly enabled per environment.
 * NEXT_PUBLIC_ so the login page and the API route read the same switch.
 */
export const GUEST_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GUEST_LOGIN === 'true'
