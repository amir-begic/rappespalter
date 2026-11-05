# Security policy

Rappespalter keeps people's financial data, so security reports matter a lot.

## Reporting a vulnerability

Please **don't open a public issue.** Report it privately through GitHub's
[security advisories](https://github.com/amir-begic/rappespalter/security/advisories/new)
("Report a vulnerability"). Include what an attacker could do, the steps to
reproduce it, and the version (Settings → Updates, or the release you downloaded).

You'll get an answer within a week. Fixes go out as a normal release through the
app's updater, and the advisory is published once enough installs have updated.

## Scope

The app runs locally and has no server or accounts of its own. Things that are in
scope, for example:

- another program or web page on the same computer reaching the app's local server
  (it should only answer its own window)
- the updater installing something that isn't a genuine release
- a crafted bank, broker or backup file that runs code or reads files when imported
- the app sending more data to an outside service than the README's Privacy section
  says

Someone who already controls your user account can read the database file. That's
outside what the app can protect against.
