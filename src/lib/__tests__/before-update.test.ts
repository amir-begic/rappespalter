import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { BEFORE_UPDATE_KEEP, pruneBeforeUpdateCopies } from "../../../electron/before-update"

const copyName = (version: string, day: number) =>
  `rappespalter-${version}-2026-03-${String(day).padStart(2, "0")}T12-00-00-000Z.db`

describe("pruneBeforeUpdateCopies", () => {
  let dir: string
  const add = (...names: string[]) => names.forEach(name => writeFileSync(join(dir, name), ""))
  const left = () => readdirSync(dir).sort()

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "before-update-"))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("keeps everything up to the limit", () => {
    const names = ["1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0"].map((v, i) => copyName(v, i + 1))
    expect(names).toHaveLength(BEFORE_UPDATE_KEEP)
    add(...names)
    pruneBeforeUpdateCopies(dir)
    expect(left()).toEqual([...names].sort())
  })

  it("removes the oldest copies first", () => {
    const names = ["1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0", "1.6.0", "1.7.0"].map((v, i) => copyName(v, i + 1))
    add(...names)
    pruneBeforeUpdateCopies(dir)
    expect(left()).toEqual(names.slice(2).sort())
  })

  it("goes by time, not version: 1.10.0 is newer than 1.9.0", () => {
    const names = ["1.5.0", "1.6.0", "1.7.0", "1.8.0", "1.9.0", "1.10.0"].map((v, i) => copyName(v, i + 1))
    add(...names)
    pruneBeforeUpdateCopies(dir)
    expect(left()).toContain(copyName("1.10.0", 6))
    expect(left()).not.toContain(copyName("1.5.0", 1))
  })

  it("handles a patch number past 9 and a pre-release version", () => {
    const names = ["1.8.8", "1.8.9", "1.8.10", "1.8.11", "1.9.0-rc.1", "1.9.0"].map((v, i) => copyName(v, i + 1))
    add(...names)
    pruneBeforeUpdateCopies(dir)
    expect(left()).toEqual(names.slice(1).sort())
  })

  it("removes a copy's WAL files with it and leaves the kept ones' alone", () => {
    const names = ["1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0", "1.6.0"].map((v, i) => copyName(v, i + 1))
    add(...names)
    add(`${names[0]}-wal`, `${names[0]}-shm`, `${names[5]}-wal`, `${names[5]}-shm`)
    pruneBeforeUpdateCopies(dir)
    expect(left()).toEqual([...names.slice(1), `${names[5]}-wal`, `${names[5]}-shm`].sort())
  })
})
