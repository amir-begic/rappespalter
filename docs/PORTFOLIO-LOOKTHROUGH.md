# Portfolio look-through

See which companies, countries and sectors you actually own once your ETFs are
broken down into their underlying holdings ("constituents"), combined with the
stocks you hold directly.

> Naming: in the existing portfolio code a **holding** is one of *your* positions
> (`/portfolio/[symbol]`). The companies inside an ETF are called
> **constituents** here to keep the two apart.

## Goal

For every company, show how many CHF of it you own and where that comes from:

> Nestlé — Fr. 1'240 (2.1% of securities) · 71% via CHSPI · 29% via VWRL

…plus the same breakdown by country and sector, and how concentrated the
portfolio is (top-10 share).

## How it works

```
exposure(company) = Σ over ETFs  value_CHF(ETF) × weight(company in ETF)
                  + value_CHF(direct position in company)
```

- `value_CHF(ETF)` is today's position value from `computePortfolio`, so the
  look-through moves with daily prices with no extra data.
- `weight` comes from the constituent file the fund publishes. It only changes
  through relative price moves and index reviews, so a file a few months old
  is still a good approximation (e.g. NVIDIA in VWRL went from 4.44% to 5.01%
  between 31 Jul and 30 Sep 2026, one of the larger drifts).
- Cash, futures, FX and fund-in-fund rows aren't companies. They are summed
  into one **Cash & other** line, so each ETF still adds up to its value.
- An ETF with no constituent data shows as a single **Not looked through**
  line rather than disappearing.

## Data sources

Each fund company publishes the full list in its own format. Files are uploaded
per ETF (the files don't reliably say which fund they describe) and the
format is detected from the content.

| Issuer | Example fund | Where | Format | Notes |
|---|---|---|---|---|
| iShares | CHSPI | ishares.com → fund page → Holdings → *Download Holdings* | CSV | No ISIN. Weights rounded to 2 dp, so weights are recomputed from *Market Value*. `’` thousands separator. Header has the "as of" date. Includes cash and futures rows. |
| Vanguard | VWRL | ch.vanguard → fund page → Holdings details → *Download* | XLSX | No ISIN. Monthly, as at month end, ~4 weeks late. Weights total ~99.5% (cash omitted). Same company can appear once per share class (GOOGL/GOOG, RO/ROP). |
| Xtrackers (DWS) | XMME | `etf.dws.com/etfdata/export/CHE/ENG/excel/product/constituent/<ISIN>/` | XLSX | Has ISIN. Daily. Weights are fractions. Includes cash, futures, a fund-in-fund position and suspended Russian lines without a weight. |

**Refresh cadence.** Xtrackers is fetched automatically during *Refresh prices*
when the stored file is more than 7 days old. The fund ISIN comes from the
first uploaded file's name (`Constituent_<ISIN>.xlsx`). iShares blocks
scripted downloads and Vanguard has no stable file URL, so those two are
uploaded by hand. Quarterly is plenty. A file whose "as of" date is more than
100 days old is flagged as stale.

Adding another issuer means one more parser in `constituents.ts`. Swap-based
ETFs (some Xtrackers and Amundi funds) publish their *collateral basket*, not
the index, so their files are useless for this. The parser can't detect that,
so it's a documented limitation.

## Matching companies across files

Only Xtrackers has ISINs, so a company is identified by whichever of these
the rows share, combined with union-find:

1. **ISIN**
2. **Ticker + country** (iShares ↔ Vanguard)
3. **Normalised name in the same country**: upper-case, punctuation removed,
   legal and class suffixes stripped (`AG`, `SA`, `LTD`, `INC`, `CORP`,
   `HOLDINGS`, `GROUP`, `ADR`, `H`, `A`, `NON VOTING PRE`…)
4. **Normalised name across countries**, but only when the legal forms
   don't conflict. Dual listings and issuers disagreeing on the country
   (Tencent is CN at Xtrackers and HK at Vanguard) need this. Without the
   legal-form check, *Siemens AG* (DE) merged with *Siemens Ltd* (India),
   *EQT Corp* (US) with *EQT AB* (Sweden), and *NMDC Ltd* (India) with *NMDC
   Group PJSC* (Abu Dhabi).
5. **Name prefix** for names that look truncated (Xtrackers cuts names at
   ~34 characters, e.g. `INDUSTRIAL AND COMMERCIAL BANK OF`)
6. **Directly held stocks** (no country in the Yuh export) link by name, or
   by ticker when the first word of the name agrees (`AAPL` "Apple" ↔ "Apple Inc")

Share classes of one company (Alphabet A/C, Samsung common/preferred) merge
into one entry on purpose.

Measured on the real files from Nov 2026:

- CHSPI → VWRL: 92% of CHSPI's weight matches by ticker. The rest is mostly
  Swiss mid-caps that VWRL doesn't hold, so there was nothing to match.
- XMME → VWRL: 79% with plain names, **92%** with the full rules above
  (94% before the legal-form check, but that included the false merges). The
  misses are naming variants (`GPO FINANCE BANORTE`, `FOMENTO ECONOMICO
  MEXICANO UBD`), Gulf banks, and EM companies listed in the US (`NU HOLDINGS`).
- Cross-country merges left after the legal-form check: 18, all genuine
  (Ferrari IT/US, Shopify CA/US, Credicorp PE/US, …). One known false split:
  BeOne Medicines (AG at Xtrackers, Ltd at Vanguard).

A miss doesn't lose money. The company shows up as two lines instead of one,
which slightly understates concentration.

**Country and sector** come from the row with the largest weight. Countries
are normalised to ISO codes. Sectors are mapped to one set of names: iShares
and Xtrackers use GICS and Vanguard uses ICB, so e.g. Vanguard's
*Technology* becomes *Information Technology*. The two systems don't agree
on every company (Alphabet is Technology in ICB but Communication Services in
GICS), so sector totals are approximate.

**Currency** is the trading currency of each holding line, which is what moves
its CHF value when exchange rates change, whatever currency the ETF is quoted
in. iShares (*Market Currency*) and Xtrackers (*Currency*) files say it.
Vanguard's doesn't, so those rows use the country's currency (Chinese
companies → HKD, as most index constituents are Hong Kong listings). The page
shows what share of the total is estimated this way. It's counted per line,
not per company, because one company can trade in several currencies (A and H
shares).

## Data model

Two tables, in `prisma/schema.prisma` with a migration.

- **FundSource**: one row per ETF that has constituent data: `symbol` (→ Security),
  `provider`, `asOf`, `fileName`, `sourceUrl` (auto-fetch, Xtrackers only),
  `importedAt`.
- **FundConstituent**: one row per line of the latest file: `symbol`, `ticker`,
  `isin`, `name`, `country`, `sector`, `currency`, `assetClass` (`equity` | `cash` |
  `other`), `weight` (fraction of the fund).

A new file for an ETF replaces its previous rows (no history). *Delete
portfolio data* wipes both tables too.

## Code

| File | Role |
|---|---|
| `src/lib/portfolio/constituents.ts` | Pure. Detects the issuer format, parses into normalised rows. |
| `src/lib/portfolio/lookthrough.ts` | Pure. Matching and aggregation into companies, countries and sectors. |
| `src/lib/portfolio/market.ts` | `xtrackersConstituentsUrl(isin)` + `fetchConstituentFile(url)` through the same polite HTTP queue. |
| `src/lib/portfolio/store.ts` | Import/replace a fund's constituents, auto-fetch during refresh, `loadLookThrough()`. |
| `src/app/api/portfolio/lookthrough/route.ts` | `GET` result · `POST` upload (`file`, `symbol`) · `DELETE ?symbol=`. |
| `src/app/portfolio/look-through/page.tsx` | The page: sources, top companies, countries, sectors. |

## Page

`/portfolio/look-through`, linked from the Portfolio page:

1. **Summary**: securities value, share covered by constituent data, number of
   companies, top-10 concentration.
2. **Companies**: ranked by CHF exposure, filterable by name, with the split
   by holding as text ("CHSPI 94% · VWRL 6%"). Shows the top 20 at first,
   more on demand.
3. **Countries** / **Sectors**: ranked single-hue bars (top 12 + the rest),
   with *Cash & other* and any not-looked-through ETF listed separately.
4. **ETF holdings data**: one row per ETF with issuer, "as of" date, stale
   and auto-update badges, and upload/replace/remove. The card explains where
   each issuer's download is.

The split by holding is text rather than colour, because the theme's chart
colours aren't distinct enough to tell five holdings apart reliably.

## Out of scope (for now)

- History of constituent files or exposure over time.
- Drift-adjusting old weights with constituent prices (we don't price ~5'000
  stocks).
- Look-through of the Säule 3a / 2. Säule (no position data there).
- Editable alias table for missed matches. Add it if the remaining
  duplicates prove annoying.
