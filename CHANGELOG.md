# Changelog

What changed for people using Rappespalter. The section for a version is also what
the app shows under Settings → Updates when that version is available, so keep it
short and in plain words. Headings are `## <version> — <date>`; the release
workflow finds a version's notes by that heading. Earlier versions are described in
the [GitHub releases](https://github.com/amir-begic/rappespalter/releases).

## 1.7.1 — 2026-11-06

- **Password-protected backups.** A backup can now have a password, so it's safe to keep on a cloud drive or a USB stick. Restoring asks for it.
- **Daily copies on this computer.** The app keeps a copy of your data for each day you use it (the last 7), plus one before every update and restore. Settings → Backup & restore lists them, and any of them can be restored.
- **Backup reminder.** The dashboard reminds you when your last backup is more than a month old.
- **Undo an import.** Imported the wrong file? Data → Import lists your recent imports, each with Undo. Single transactions can be deleted on Data → Transactions.
- **Friendlier Windows installer**, with the handwriting animation and a "Let's go!" at the end.
- **The start animation always finishes** before the app appears.

## 1.6.0 — 2026-11-05

- **Safer on your computer.** Only the app's own window can talk to its built-in server; other programs and websites are turned away.
- **Smoother updates.** The app brings your data up to date itself when a new version starts, also for backups made with older versions.
