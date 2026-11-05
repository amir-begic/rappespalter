# Contributing to Rappespalter

Thanks for helping. Bug reports, bank formats and small fixes are the most useful
contributions. For a bigger feature, open an issue first so we can agree on the
approach before you write it.

## Never share real financial data

Not in issues, pull requests, screenshots, test files or commit messages. That covers
bank exports, IBANs, names, addresses, amounts and backups of your database. When a
bug needs a file to reproduce it, make a small one with invented values: keep the
structure (columns, XML elements) and replace everything else. Screenshots can come
from the demo database (see "Regenerating the README screenshots" in
[CLAUDE.md](CLAUDE.md)).

## Setting up

You need Node.js 22 and pnpm. See [Getting started](README.md#getting-started) for
the database setup, and [docs/ELECTRON.md](docs/ELECTRON.md) for the desktop app.

```bash
pnpm install
cp .env.example .env
pnpm exec prisma migrate dev
pnpm dev
```

## Before you open a pull request

CI runs these on every pull request, so run them locally first:

```bash
pnpm exec tsc --noEmit   # types
pnpm lint                # lint
pnpm i18n:check          # translations
pnpm test                # unit tests
```

- **Read [CLAUDE.md](CLAUDE.md).** Despite the name it's the project's architecture
  notes and conventions: how imports, transfers, rules, the portfolio and the
  desktop app work, and why.
- **Keep maths pure.** Calculations live in `src/lib/*.ts` without database or
  network access, with tests in `src/lib/__tests__/`. Add or update a test when you
  change one.
- **Translate everything.** Every visible string goes through `t()`. Add the key to
  `src/locales/en-CH.ts` and the other three languages; English is fine as a
  placeholder if you don't speak them, just say so in the pull request.
- **Older databases must keep working.** The desktop app doesn't run migrations on
  existing databases, so new tables are created on demand (see the `ensure*Table`
  helpers).
- **Network access is opt-in and documented.** Anything that goes online is listed
  in the README's Privacy section, sends as little as possible, and is triggered by
  the user or rate-limited.
- Keep pull requests focused; one change per pull request is easiest to review.

## Adding a bank format

Supporting another bank's export is very welcome. Open an issue with the "Bank or
broker format" template first. The useful information is the file's structure (column
headers, date and number formats, how money in and out is shown) and a few rows with
**invented** values.

## Licence

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE).
