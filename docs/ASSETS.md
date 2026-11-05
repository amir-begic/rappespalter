# Assets & debts

Wealth → Assets tracks what you own beyond the snapshot accounts (gold, crypto,
collections, a car) and the loans and leases against it. Both feed Net Worth.

- Pure maths: `src/lib/assets.ts` (values, depreciation, loan balances, lease
  commitments, month-end totals, what a vehicle costs a month) and `src/lib/car.ts`
  (lease vs. buy).
- Tables: `Asset`, `AssetValue`, `Liability` (migration
  `20261104100000_assets_liabilities`; loading in `src/lib/assets-store.ts`).
- API: `/api/assets` (CRUD; GET lists assets and liabilities), `/api/assets/values`,
  `/api/liabilities`, `/api/assets/month-ends` (Net Worth), `/api/assets/car?id=`.
- Pages: `/assets`, `/assets/[id]` (vehicles: monthly cost and lease vs. buy),
  `/assets/lease-or-buy`.

## How an asset is valued

The value on a day is the latest *anchor* on or before it: the purchase (date +
price) or a valuation (`AssetValue`). Then:

- **manual**: the anchor's value, unchanged until the next valuation.
- **depreciation**: declining balance from the anchor,
  `value × (1 − rate)^years`, never below the residual value. A valuation resets
  the curve, which carries on from there.

Before the purchase (or the first valuation) the asset is worth nothing, and from
the day it's sold it's worth nothing to you. The sale stays in the history, so past
months on Net Worth don't change.

## Loans and leases

- **Loan / mortgage / other**: the balance follows the annuity schedule (the first
  payment is one month after the start). Without a monthly payment it's worked out
  from the principal, rate, term and balloon; with no term and no payment it's
  interest-only. A statement balance replaces the schedule from its date on.
  Balances count against net worth.
- **Lease**: not a debt. The payments still to come are a *commitment*, which Net
  Worth subtracts only when asked to. While a lease runs, its vehicle isn't yours
  and isn't counted.

## What a vehicle costs a month

`carCost()` adds up:

1. **Depreciation**: the value lost over the last 365 days, or since it was bought
   if that's more recent. A leased car has none, because the lease payment covers it.
2. **Financing**: lease payments, and interest on loans (`balance × rate / 12`).
   Repaying the principal is saving, not a cost.
3. **Running costs**: average spending over the last 12 complete months in the
   expense categories chosen on the car's page, one-offs left out. Only months since
   it was bought count. Payments to a loan's or lease's payee (`counterparty`) are
   left out, because they're already under financing.

## Lease vs. buy

`compareDeal()` compares paying cash, a loan and a lease for the same car over the
same years. A car you buy is sold at the end for its depreciated value; a leased car
goes back. Money paid into the car is carried forward at the investment return
("missed returns"), so tying up cash is a cost too. `leaseRate()` solves for the
interest rate a lease effectively charges, using the price, down payment, monthly
payment and buyout price.

## Adding a kind of asset: a worked example

Collectibles are one umbrella kind. The sub-type (`COLLECTIBLE_TYPES`) names the
collection and picks its illustration. Here's how "Pokémon cards" got in, and how
you'd add a new kind such as *Real estate*.

**1. Register it** in `ASSET_KINDS` (`src/lib/assets.ts`):

```ts
collectible: {
  label: "Collectibles", name: "Pokémon cards", valuation: "manual", depreciation: 0, liquid: false,
  units: [], hint: "One value for a whole collection — cards, watches, art, sneakers, wine…",
},
```

- `name` is what a new asset of this kind is called by default, which makes it a
  preset: picking Collectibles gives you "Pokémon cards" straight away.
- `valuation` is `"manual"` because Cardmarket, PriceCharting and the like have no
  free, stable API. A manual value for the whole collection, updated now and then,
  is honest about that. Gold and crypto are manual for the same reason (for now).
- `liquid: false` keeps it out of "Liquid" on Net Worth, because a binder of cards
  doesn't sell in a day.
- `units` is empty, so no quantity field is shown. Gold uses `["g", "oz", "kg"]`.

For a new sub-type of an existing kind, add it to `COLLECTIBLE_TYPES` instead.

**2. Draw it** in `components/asset-art.tsx`: add a motif to `MOTIFS` (a 120×120
viewBox centred near 60,62, ink outlines, paper and pop colours) and map the kind in
`KIND_ART` (blob seed + colour), or map a collectible sub-type in `COLLECTION_MOTIF`.
The cards motif is two tilted cards with a star, deliberately generic rather than a
copy of any brand's artwork.

**3. That's it.** The editor, the cards on the Assets page, the colours in charts,
month-end totals and Net Worth all read the registry. A kind with special maths (for
example property with a mortgage and imputed rental value) would add a function next
to `assetValueAt` and branch on `kind` there.
