/**
 * Create a UUID-shaped client identifier without requiring a secure origin.
 *
 * `crypto.randomUUID()` is unavailable in some mobile browsers when the app is
 * opened through a LAN HTTP address. `getRandomValues()` has wider support, so
 * prefer it and retain a low-collision fallback for older WebViews.
 */
export function createRandomId(): string {
  const webCrypto = globalThis.crypto

  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
  } else {
    const seed = `${Date.now()}-${Math.random()}-${Math.random()}`
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (seed.charCodeAt(index % seed.length) + Math.floor(Math.random() * 256)) & 0xff
    }
  }

  // RFC 4122 version 4 and variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
