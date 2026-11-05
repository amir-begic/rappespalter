import { describe, expect, it } from "vitest"
import { BackupPasswordError, decryptBackup, encryptBackup, isEncryptedBackup } from "../backup-crypto"
import { REMIND_AFTER_DAYS, backupDue } from "../backup-status"

// Low scrypt cost so the tests stay fast; the format stores the cost it used.
const FAST = { log2N: 10, r: 8, p: 1 }
const database = Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(4096, 7)])

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e instanceof BackupPasswordError ? e.code : String(e)
  }
  return null
}

describe("password-protected backups", () => {
  const locked = encryptBackup(database, "correct horse", FAST)

  it("round-trips with the right password", () => {
    expect(isEncryptedBackup(locked)).toBe(true)
    expect(decryptBackup(locked, "correct horse").equals(database)).toBe(true)
  })
  it("doesn't contain the database in the clear", () => {
    expect(locked.includes(Buffer.from("SQLite format 3"))).toBe(false)
  })
  it("refuses a wrong or missing password", () => {
    expect(code(() => decryptBackup(locked, "wrong horse"))).toBe("wrongPassword")
    expect(code(() => decryptBackup(locked, ""))).toBe("needsPassword")
    expect(code(() => decryptBackup(locked, null))).toBe("needsPassword")
  })
  it("notices a changed byte, in the body or in the header", () => {
    const body = Buffer.from(locked); body[body.length - 1] ^= 1
    expect(code(() => decryptBackup(body, "correct horse"))).toBe("wrongPassword")
    const salt = Buffer.from(locked); salt[20] ^= 1
    expect(code(() => decryptBackup(salt, "correct horse"))).toBe("wrongPassword")
  })
  it("refuses absurd cost settings from a crafted file", () => {
    const crafted = Buffer.from(locked); crafted[9] = 30
    expect(code(() => decryptBackup(crafted, "correct horse"))).toBe("unsupported")
  })
  it("refuses a newer format version", () => {
    const newer = Buffer.from(locked); newer[8] = 2
    expect(code(() => decryptBackup(newer, "correct horse"))).toBe("unsupported")
  })
  it("passes a plain database through untouched", () => {
    expect(isEncryptedBackup(database)).toBe(false)
    expect(decryptBackup(database, null)).toBe(database)
  })
  it("needs a password of at least 8 characters", () => {
    expect(code(() => encryptBackup(database, "short", FAST))).toBe("tooShort")
  })
  it("uses a new salt every time", () => {
    expect(encryptBackup(database, "correct horse", FAST).equals(locked)).toBe(false)
  })
})

describe("backup reminder", () => {
  const now = new Date("2026-11-05T12:00:00Z")
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

  it("stays quiet with nothing to lose", () => {
    expect(backupDue({ lastBackupAt: null, firstDataAt: null, snoozedUntil: null, now })).toBeNull()
  })
  it("reminds a month after the first data when there was never a backup", () => {
    expect(backupDue({ lastBackupAt: null, firstDataAt: daysAgo(10), snoozedUntil: null, now })).toBeNull()
    expect(backupDue({ lastBackupAt: null, firstDataAt: daysAgo(REMIND_AFTER_DAYS), snoozedUntil: null, now })).toBe(REMIND_AFTER_DAYS)
  })
  it("counts from the last backup", () => {
    expect(backupDue({ lastBackupAt: daysAgo(5), firstDataAt: daysAgo(400), snoozedUntil: null, now })).toBeNull()
    expect(backupDue({ lastBackupAt: daysAgo(45), firstDataAt: daysAgo(400), snoozedUntil: null, now })).toBe(45)
  })
  it("stays quiet while snoozed", () => {
    const snoozedUntil = new Date(now.getTime() + 86_400_000)
    expect(backupDue({ lastBackupAt: daysAgo(45), firstDataAt: null, snoozedUntil, now })).toBeNull()
    expect(backupDue({ lastBackupAt: daysAgo(45), firstDataAt: null, snoozedUntil: daysAgo(1), now })).toBe(45)
  })
})
