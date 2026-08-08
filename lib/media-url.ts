/**
 * Shared media URL sanitiser. Lives outside any one screen so trip covers,
 * member avatars and library thumbnails all reject the same unsafe schemes.
 */
export function safeCoverImageUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim()
  if (!candidate) return null
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}
