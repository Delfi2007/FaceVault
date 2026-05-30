// AES-256-GCM encryption using Web Crypto API

const KEY_NAME = 'facevault-master-key'

async function getMasterKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(KEY_NAME)
  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const exported = await crypto.subtle.exportKey('raw', key)
  localStorage.setItem(KEY_NAME, btoa(String.fromCharCode(...new Uint8Array(exported))))
  return key
}

export async function encryptEmbedding(embedding: number[]): Promise<string> {
  const key = await getMasterKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(embedding))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decryptEmbedding(encrypted: string): Promise<number[]> {
  const key = await getMasterKey()
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return JSON.parse(new TextDecoder().decode(decrypted))
}

export async function hashEmbedding(embedding: number[]): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(embedding))
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
