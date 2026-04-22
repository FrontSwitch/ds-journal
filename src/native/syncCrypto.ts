import type { SyncEvent } from '../types'

interface SyncRequest {
  peer_device_id: string
  from_counter: number
  events: SyncEvent[]
  request_nonce: number
  cold_sync: boolean
}

interface SyncResponse {
  events: SyncEvent[]
  server_time: number
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}

async function deriveKeys(peerCode: string): Promise<{ encKey: CryptoKey; macKey: CryptoKey }> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(peerCode),
    { name: 'HKDF' },
    false,
    ['deriveBits']
  )

  const [encBits, macBits] = await Promise.all([
    crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('dsj-sync-enc-v1') },
      keyMaterial,
      256
    ),
    crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('dsj-sync-hmac-v1') },
      keyMaterial,
      256
    ),
  ])

  const [encKey, macKey] = await Promise.all([
    crypto.subtle.importKey('raw', encBits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
    crypto.subtle.importKey('raw', macBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  ])

  return { encKey, macKey }
}

async function encryptPayload(data: Uint8Array, key: CryptoKey): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, data)
  return `${toHex(nonce)}.${toHex(ciphertext)}`
}

async function decryptPayload(encoded: string, key: CryptoKey): Promise<Uint8Array> {
  const dot = encoded.indexOf('.')
  if (dot === -1) throw new Error('Invalid payload format')
  const nonce = fromHex(encoded.slice(0, dot))
  const ct = fromHex(encoded.slice(dot + 1))
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct)
  return new Uint8Array(plain)
}

/** Replicate the `sync_send_to_peer` Tauri command using Web Crypto + fetch. */
export async function sendToPeer(
  peerAddress: string,
  peerCode: string,
  ourDeviceId: string,
  fromCounter: number,
  coldSync: boolean,
  events: SyncEvent[]
): Promise<{ events: SyncEvent[]; server_time: number }> {
  const { encKey, macKey } = await deriveKeys(peerCode)
  const enc = new TextEncoder()

  // Random 8-byte request nonce → u64 (JS safe integer up to 2^53)
  const nonceBytes = crypto.getRandomValues(new Uint8Array(8))
  const nonceHex = toHex(nonceBytes)
  // Build as two u32 to stay in safe integer range
  const nonceHi = (nonceBytes[0] << 24 | nonceBytes[1] << 16 | nonceBytes[2] << 8 | nonceBytes[3]) >>> 0
  const nonceLo = (nonceBytes[4] << 24 | nonceBytes[5] << 16 | nonceBytes[6] << 8 | nonceBytes[7]) >>> 0
  const requestNonce = nonceHi * 4294967296 + nonceLo

  const req: SyncRequest = {
    peer_device_id: ourDeviceId,
    from_counter: fromCounter,
    events,
    request_nonce: requestNonce,
    cold_sync: coldSync,
  }

  const reqJson = enc.encode(JSON.stringify(req))
  const encryptedPayload = await encryptPayload(reqJson, encKey)

  // Body: "<our_device_id>|<encrypted_payload>"
  const body = `${ourDeviceId}|${encryptedPayload}`

  // HMAC over "<nonce_hex>|<encrypted_payload>"
  const macData = enc.encode(`${nonceHex}|${encryptedPayload}`)
  const sigBuf = await crypto.subtle.sign('HMAC', macKey, macData)
  const authHeader = `${nonceHex}.${toHex(sigBuf)}`

  const resp = await fetch(`http://${peerAddress}/dsj/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'X-DSJ-Auth': authHeader,
    },
    body,
  })

  if (!resp.ok) {
    throw new Error(`Peer returned ${resp.status}`)
  }

  // Server responds with a JSON-encoded encrypted string
  const respEncrypted: string = await resp.json()
  const respBytes = await decryptPayload(respEncrypted, encKey)
  const syncResp: SyncResponse = JSON.parse(new TextDecoder().decode(respBytes))
  return syncResp
}
