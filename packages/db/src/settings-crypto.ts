import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

function encryptionKey() {
  const encoded = process.env.SETTINGS_ENCRYPTION_KEY
  if (!encoded) throw new Error("SETTINGS_ENCRYPTION_KEY must be configured")
  const decoded = Buffer.from(encoded, "base64")
  if (decoded.length === 32) return decoded
  if (Buffer.byteLength(encoded) === 32) return Buffer.from(encoded)
  throw new Error("SETTINGS_ENCRYPTION_KEY must be a 32-byte base64 key")
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`
}

export function decryptSecret(value: string) {
  const [version, iv, tag, ciphertext] = value.split(":")
  if (version !== "v1" || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unsupported encrypted setting")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
