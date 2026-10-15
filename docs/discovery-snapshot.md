# x402 discovery merchant snapshot: spec and design

Status: first increment. Claims are marked Observed (inspected), Inferred, or Untested.
This document is generic: it names no merchant, host or address. Which merchant to watch is data
supplied by whoever holds it (see "Where the data goes").

## Spec

Purpose: record, as dated data, the demand an x402 Bazaar-style discovery service reports for one
merchant `payTo`, and diff two records, so a seller can tell "a call happened" from "nothing
happened" between two days without a wallet, key, or account.

Requirements:

1. R1. Input is a parameter record, validated by `readSnapshotParameters` (that function is the
   reader of the record; there is no separate schema file):

   | field | type | rule |
   | --- | --- | --- |
   | `endpoint` | string | https URL of the discovery merchant listing |
   | `payTo` | string | full 20-byte `0x` address |

   Example (synthetic): `{ "endpoint": "https://discovery.example.test/merchant", "payTo": "0xabab...ab" }`.
2. R2. Output is a snapshot record: per-resource listed prices, 30-day calls, 30-day unique payers,
   `lastCalledAt`, totals, `complete`, and `problems`.
3. R3. A diff of two snapshots lists added/removed resources, per-resource deltas, `active`,
   `newPayerSignals`, `activeWithoutPayerRise`, `priceChanges`, and `incomplete`.
4. R4. The reader never pays, signs, or reads secrets.

Non-requirements: it does not claim to be the whole ledger. Whether the discovery service sees every
paid call is Untested; the on-chain Transfer events to `payTo` are the independent complement.

## Consumer rules

- `complete` is true only when the declared total equals the resources read and `problems` is empty.
  When it is false, treat the snapshot as a partial view: do not read `added`/`removed` of a diff as
  real changes (the diff sets `incomplete`), and do not replace a previous complete snapshot as the
  baseline with it. Read `problems` for the reason (page cap, empty page, total changed mid-paging,
  duplicate URLs, malformed amount, multi-option pricing).
- A response whose `payTo` (or any `accepts[].payTo`) differs from the requested one is refused with
  an error, never recorded under the requested address.
- Counters that are absent or malformed are `null`, not `0`. Amounts that are not integer strings are
  `null` and mark the snapshot incomplete. Only `accepts[0]` is the headline `amount`; every option's
  amount is kept in `amounts`, and a diff treats a change in any of them as a price change.

## Signals and their limits (Inferred from the field semantics; Untested against two live days)

- `active`: `lastCalledAt` advanced, or a newly listed resource already has a `lastCalledAt` or calls.
  This is the only evidence of a new call; the 30-day counters are rolling windows and fall as old
  calls age out.
- `newPayerSignals`: unique payer count rose, or a newly listed resource has payers. It can miss a real
  new payer: if one payer ages out of the 30-day window the day another arrives, the delta is 0.
  `activeWithoutPayerRise` lists exactly those active resources for which the discovery service cannot
  say whether the caller is new.
- Per-resource unique-payer counts cannot be summed across resources into a number of distinct buyers,
  and the discovery service does not say which payers belong to the seller. No claim about "organic"
  versus own-wallet demand follows from a snapshot; that needs the on-chain ledger and a list of the
  seller's own addresses (not built).

## Design (LLD)

`src/discovery-snapshot.mjs`, exported as `./snapshot`.

- `readSnapshotParameters(record)` validates R1.
- `merchantUrl(parameters, offset)` builds one page request (limit 20).
- `takeSnapshot(parameters, { fetchJson, now })` pages until `offset >= total` (hard cap 50 pages).
  Transport is injected; the module has no network code and no dependencies.
- `snapshotRecord({ parameters, pages, takenAt, notes })` is the pure reducer. It drops payload
  examples (large, not demand data), sorts by resource, collapses duplicate resource URLs (last wins,
  recorded in `problems`), and checks every page's total against the first page's.
- `diffSnapshots(previous, next)` is pure and refuses different `payTo` or `endpoint`.

Tests (`test/discovery-snapshot.test.mjs`) use synthetic data built inline (`example.test`
hosts, a placeholder address). No captured live payload is committed.

## Observed in this PR

- Observed: the 16 tests pass under `node --test` on Node 24, run from the session scratchpad on
  copies of the two files, not through the package's own `npm test` and not in CI (Untested).
- Observed earlier (by the author, not reproducible from this repo, since no capture is committed): an
  unauthenticated GET of a real Bazaar merchant endpoint returned a listing whose entries carry
  `accepts[0]` (scheme, network, asset, amount in token base units), `serviceName`, `tags`,
  `lastUpdated`, and `quality.{l30DaysTotalCalls, l30DaysUniquePayers, lastCalledAt}`. The synthetic
  test data imitates that shape; it is Inferred to match, not byte-checked against a live response.

## Where the data goes (not decided here)

The parameter record and the dated snapshots are holdings of whoever owns the merchant, so they belong
with that owner's parameters and holdings, not in this repo. Until a holder is chosen, no runner
should write records anywhere; this PR adds the reader only.

## Next increments (candidates, not specified)

A runner, an on-chain Transfer reader, and a cross-check between them are plausible follow-ups. None
is specified here: each needs its own field list, checkpoint format and schema before it is buildable.
