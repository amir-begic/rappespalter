// Runs once when the server starts, before it handles any request: bring the
// database up to the current schema, or stop (src/lib/migrate.ts); then keep a
// daily copy of it (src/lib/backup-copies.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { migrateOnStartup } = await import("@/lib/migrate")
  await migrateOnStartup()
  const { startDailyCopies } = await import("@/lib/backup-copies")
  startDailyCopies()
}
