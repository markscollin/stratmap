import type { OrgNode, OrgEdge, Department } from '../types'

export interface SharePayload {
  name: string
  nodes: OrgNode[]
  edges: OrgEdge[]
  departments: Department[]
  exportedAt: string
}

async function compress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(data as unknown as Uint8Array<ArrayBuffer>)
  writer.close()
  const chunks: Uint8Array[] = []
  const reader = cs.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out
}

async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(data as unknown as Uint8Array<ArrayBuffer>)
  writer.close()
  const chunks: Uint8Array[] = []
  const reader = ds.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out
}

function toBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64url(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function encodeSharePayload(payload: SharePayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const compressed = await compress(bytes)
  return toBase64url(compressed)
}

export async function decodeSharePayload(token: string): Promise<SharePayload> {
  const bytes = fromBase64url(token)
  const decompressed = await decompress(bytes)
  return JSON.parse(new TextDecoder().decode(decompressed)) as SharePayload
}
