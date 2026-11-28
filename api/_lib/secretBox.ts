import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// R-78: a customer's HR-system API key is stored encrypted, never in clear. AES-256-GCM with a server key from
// INTEGRATION_ENCRYPTION_KEY (32 random bytes, base64: `openssl rand -base64 32`). Without that key no connection can be
// made or used (the routes answer 503 integrations-unavailable). Changing the key makes every stored key unreadable:
// the connections then need their API key entered again.
//
// Format: "v1:<iv>:<tag>:<ciphertext>", each part base64.

export class SecretBoxUnavailable extends Error {
  constructor() { super('INTEGRATION_ENCRYPTION_KEY is not set or is not 32 bytes of base64') }
}

function serverKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY
  if (!raw) throw new SecretBoxUnavailable()
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new SecretBoxUnavailable()
  return key
}

export function secretBoxReady(): boolean {
  try { serverKey(); return true } catch { return false }
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', serverKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':')
}

/** The plain secret, or null when it cannot be opened (another server key, or a damaged value). */
export function openSecret(sealed: string): string | null {
  const [v, iv, tag, ct] = sealed.split(':')
  if (v !== 'v1' || !iv || !tag || ct === undefined) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', serverKey(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8')
  } catch (err) {
    if (err instanceof SecretBoxUnavailable) throw err
    return null
  }
}
