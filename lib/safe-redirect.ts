export function getSafeRedirectPath(
  next: string | null | undefined,
  origin: string,
  fallback = '/dashboard'
): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  try {
    if (new URL(next, origin).origin !== origin) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
