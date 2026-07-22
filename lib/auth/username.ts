export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/
const LOGIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@accounts.tripper.app`
}

/** Supports new username accounts and legacy accounts created with an email. */
export function loginIdentifierToEmail(identifier: string) {
  const normalized = identifier.trim().toLowerCase()
  return normalized.includes('@') ? normalized : usernameToEmail(normalized)
}

export function isValidLoginIdentifier(identifier: string) {
  const normalized = identifier.trim()
  return USERNAME_PATTERN.test(normalized) || LOGIN_EMAIL_PATTERN.test(normalized)
}
