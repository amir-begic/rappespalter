// Password-protected backups (Settings → Backup & restore). Pure: buffers in and out.
//
// File layout (all integers unsigned):
//   0   8  magic "RPBACKUP"
//   8   1  format version (1)
//   9   1  scrypt cost as log2(N)
//   10  1  scrypt block size r
//   11  1  scrypt parallelism p
//   12  16 salt
//   28  12 AES-GCM nonce
//   40  16 AES-GCM tag
//   56  …  ciphertext of the gzipped SQLite file
// The 40 header bytes before the tag are authenticated too (AAD), so the cost
// settings can't be swapped. The key is scrypt(password, salt), 32 bytes.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"
import { gunzipSync, gzipSync } from "node:zlib"

const MAGIC = Buffer.from("RPBACKUP", "ascii")
const VERSION = 1
const HEADER = 40 // up to the tag
const TAG = 16
// ~128 MB and a fraction of a second: slow to guess, fine to wait for once.
const COST = { log2N: 17, r: 8, p: 1 }

export const ENCRYPTED_EXTENSION = ".rpbackup"
export const MIN_PASSWORD_LENGTH = 8

export class BackupPasswordError extends Error {
  constructor(public code: "needsPassword" | "wrongPassword" | "tooShort" | "unsupported", message: string) {
    super(message)
  }
}

export const isEncryptedBackup = (data: Uint8Array) =>
  data.length >= MAGIC.length && Buffer.from(data.subarray(0, MAGIC.length)).equals(MAGIC)

function deriveKey(password: string, salt: Buffer, log2N: number, r: number, p: number) {
  const N = 2 ** log2N
  return scryptSync(password.normalize("NFC"), salt, 32, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 })
}

export function encryptBackup(database: Buffer, password: string, cost = COST): Buffer {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BackupPasswordError("tooShort", `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  const salt = randomBytes(16)
  const nonce = randomBytes(12)
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION, cost.log2N, cost.r, cost.p]), salt, nonce])
  const cipher = createCipheriv("aes-256-gcm", deriveKey(password, salt, cost.log2N, cost.r, cost.p), nonce)
  cipher.setAAD(header)
  const body = Buffer.concat([cipher.update(gzipSync(database)), cipher.final()])
  return Buffer.concat([header, cipher.getAuthTag(), body])
}

export function decryptBackup(data: Buffer, password: string | null | undefined): Buffer {
  if (!isEncryptedBackup(data)) return data
  if (!password) throw new BackupPasswordError("needsPassword", "This backup is protected with a password")
  if (data.length < HEADER + TAG || data[8] !== VERSION) {
    throw new BackupPasswordError("unsupported", "This backup was made with a newer version of Rappespalter")
  }
  const [log2N, r, p] = [data[9], data[10], data[11]]
  // Refuse absurd costs from a crafted file instead of exhausting memory.
  if (log2N < 10 || log2N > 20 || r < 1 || r > 16 || p < 1 || p > 4) {
    throw new BackupPasswordError("unsupported", "Unsupported backup settings")
  }
  const header = data.subarray(0, HEADER)
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(password, data.subarray(12, 28), log2N, r, p), data.subarray(28, 40))
  decipher.setAAD(header)
  decipher.setAuthTag(data.subarray(HEADER, HEADER + TAG))
  let zipped: Buffer
  try {
    zipped = Buffer.concat([decipher.update(data.subarray(HEADER + TAG)), decipher.final()])
  } catch {
    throw new BackupPasswordError("wrongPassword", "Wrong password, or the file is damaged")
  }
  return gunzipSync(zipped)
}
