/**
 * discovery-snapshot - dated records of a merchant's demand as the x402 Bazaar discovery
 * service reports it, and the day-over-day diff of two such records.
 *
 * Generic: the endpoint URL and the merchant's payTo address are data handed in by the caller
 * (a parameter record); nothing here names a merchant. The reader does not sign, pay, or hold a
 * wallet; the discovery merchant endpoint is keyless. A snapshot is the discovery service's own
 * view of demand, not the whole ledger (whether it sees every paid call is Untested); the on-chain
 * Transfer ledger is the complement and would be a separate reader.
 *
 * A snapshot is a pure function of (response pages, endpoint, payTo, takenAt, notes). Fetching is
 * injected so tests and other hosts supply their own transport.
 *
 * `complete` is true only when the declared total equals the resources read and `problems` is empty.
 * A consumer must not read `added` / `removed` of a diff as real when either snapshot is not complete.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PAGE_LIMIT = 20;
const MAX_PAGES = 50;

export const SNAPSHOT_KIND = "x402.discovery-merchant-snapshot/v1";

/** Validate a parameter record: { endpoint, payTo }. Returns it frozen, or throws. */
export function readSnapshotParameters(record) {
  const { endpoint, payTo } = record ?? {};
  if (typeof endpoint !== "string") throw new TypeError("snapshot parameters: endpoint must be a string URL");
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new TypeError("snapshot parameters: endpoint must be https");
  if (typeof payTo !== "string" || !ADDRESS.test(payTo)) {
    throw new TypeError("snapshot parameters: payTo must be a full 20-byte 0x address");
  }
  return Object.freeze({ endpoint: url.origin + url.pathname, payTo });
}

/** The request URL for one page of the merchant listing. */
export function merchantUrl({ endpoint, payTo }, offset = 0) {
  const url = new URL(endpoint);
  url.searchParams.set("payTo", payTo);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  url.searchParams.set("offset", String(offset));
  return url.toString();
}

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** A counter becomes a finite non-negative number, or null when absent or malformed (never 0 by accident). */
const num = (value) => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** An amount is a base-unit integer string, or null. Decimals and junk are not coerced. */
const amountOf = (value) => (typeof value === "string" && /^\d+$/.test(value) ? value
  : Number.isSafeInteger(value) && value >= 0 ? String(value) : null);

/** Reduce one Bazaar resource entry to the fields demand analysis needs (drops payload examples). */
export function resourceEntry(raw) {
  if (raw === null || typeof raw !== "object" || typeof raw.resource !== "string" || raw.resource === "") {
    throw new TypeError("resource entry: resource must be a non-empty string");
  }
  const accepts = Array.isArray(raw.accepts) ? raw.accepts : [];
  const accept = accepts[0] ?? {};
  const quality = raw.quality ?? {};
  return Object.freeze({
    resource: raw.resource,
    serviceName: raw.serviceName ?? null,
    network: accept.network ?? null,
    asset: accept.asset ?? null,
    amount: amountOf(accept.amount),
    amounts: Object.freeze(accepts.map((a) => amountOf(a?.amount))),
    tags: Object.freeze([...(raw.tags ?? [])]),
    calls30d: num(quality.l30DaysTotalCalls),
    uniquePayers30d: num(quality.l30DaysUniquePayers),
    lastCalledAt: quality.lastCalledAt ?? null,
    lastUpdated: raw.lastUpdated ?? null,
  });
}

/**
 * Build a dated snapshot record from the pages of a merchant listing.
 * A page (or an accepts entry) naming a different payTo is refused: it is not this merchant's data.
 * `notes` are fetch-level problems from the caller (page cap, empty page); they make the record incomplete.
 */
export function snapshotRecord({ parameters, pages, takenAt, notes = [] }) {
  const { endpoint, payTo } = readSnapshotParameters(parameters);
  const problems = [...notes];
  const seen = new Map();
  for (const page of pages) {
    if (page.payTo !== undefined && !same(page.payTo, payTo)) {
      throw new Error(`snapshotRecord: response payTo ${page.payTo} does not match requested payTo`);
    }
    for (const raw of page.resources ?? []) {
      for (const a of raw?.accepts ?? []) {
        if (a?.payTo !== undefined && !same(a.payTo, payTo)) {
          throw new Error(`snapshotRecord: accepts payTo for ${raw.resource} does not match requested payTo`);
        }
      }
      const entry = resourceEntry(raw);
      if (seen.has(entry.resource)) problems.push(`duplicate resource (last wins): ${entry.resource}`);
      seen.set(entry.resource, entry);
    }
  }
  const resources = [...seen.values()].sort((a, b) => (a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0));
  const declared = pages[0]?.pagination?.total ?? null;
  for (const [i, page] of pages.entries()) {
    const t = page.pagination?.total ?? null;
    if (t !== declared) problems.push(`pagination total changed at page ${i}: ${declared} -> ${t}`);
  }
  const amounts = resources.map((r) => r.amount);
  const unpriced = amounts.filter((a) => a === null).length;
  const multiOption = resources.filter((r) => r.amounts.length > 1).length;
  if (unpriced) problems.push(`${unpriced} resource(s) without a valid integer amount`);
  if (multiOption) problems.push(`${multiOption} resource(s) list several accepts; only the first is priced`);
  return Object.freeze({
    kind: SNAPSHOT_KIND,
    endpoint,
    payTo,
    takenAt: new Date(takenAt).toISOString(),
    declaredTotal: declared,
    complete: declared !== null && declared === resources.length && problems.length === 0,
    problems: Object.freeze(problems),
    totals: Object.freeze({
      resources: resources.length,
      calls30d: resources.reduce((sum, r) => sum + (r.calls30d ?? 0), 0),
      listedPriceUnits: amounts.reduce((sum, a) => sum + BigInt(a ?? "0"), 0n).toString(),
    }),
    resources: Object.freeze(resources),
  });
}

/** Fetch every page of the listing through `fetchJson(url) -> object` and return a snapshot. */
export async function takeSnapshot(parameters, { fetchJson, now = () => new Date() }) {
  const checked = readSnapshotParameters(parameters);
  const pages = [];
  const notes = [];
  let offset = 0;
  let finished = false;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const page = await fetchJson(merchantUrl(checked, offset));
    pages.push(page);
    const got = page.resources?.length ?? 0;
    const total = page.pagination?.total ?? 0;
    offset += got;
    if (offset >= total) { finished = true; break; }
    if (got === 0) { notes.push(`empty page at offset ${offset} before declared total ${total}`); finished = true; break; }
  }
  if (!finished) notes.push(`page cap ${MAX_PAGES} reached before the declared total`);
  return snapshotRecord({ parameters: checked, pages, takenAt: now(), notes });
}

/**
 * Diff two snapshots of the same merchant and endpoint.
 * `active`: resources whose lastCalledAt advanced, plus newly listed resources that already have a
 * lastCalledAt. This is the only evidence of a new call, since the 30-day counters are rolling windows.
 * `newPayerSignals`: resources whose unique payer count rose, plus newly listed resources with payers.
 * This can miss a real new payer: if one payer ages out of the window the day another arrives the delta
 * is 0. `activeWithoutPayerRise` lists active resources with no payer-count rise; for them Bazaar cannot
 * say whether the caller is new. `incomplete` is true when either snapshot is not `complete`, in which
 * case `added` and `removed` may be listing gaps rather than real changes.
 */
export function diffSnapshots(previous, next) {
  if (!same(previous.payTo, next.payTo)) {
    throw new Error("diffSnapshots: snapshots are for different payTo addresses");
  }
  if (previous.endpoint !== next.endpoint) {
    throw new Error("diffSnapshots: snapshots are for different endpoints");
  }
  const before = new Map(previous.resources.map((r) => [r.resource, r]));
  const after = new Map(next.resources.map((r) => [r.resource, r]));
  const addedEntries = next.resources.filter((r) => !before.has(r.resource));
  const added = addedEntries.map((r) => r.resource);
  const removed = previous.resources.filter((r) => !after.has(r.resource)).map((r) => r.resource);
  const priceKey = (r) => JSON.stringify(r.amounts ?? [r.amount]);
  const changed = [];
  for (const [resource, now] of after) {
    const was = before.get(resource);
    if (!was) continue;
    const delta = {
      resource,
      callsDelta: (now.calls30d ?? 0) - (was.calls30d ?? 0),
      uniquePayersDelta: (now.uniquePayers30d ?? 0) - (was.uniquePayers30d ?? 0),
      lastCalledAt: { from: was.lastCalledAt, to: now.lastCalledAt },
      amount: { from: was.amount, to: now.amount },
      priceChanged: priceKey(was) !== priceKey(now),
    };
    const moved = delta.callsDelta !== 0 || delta.uniquePayersDelta !== 0
      || was.lastCalledAt !== now.lastCalledAt || delta.priceChanged;
    if (moved) changed.push(delta);
  }
  const advanced = (d) => d.lastCalledAt.to !== null && (d.lastCalledAt.from === null || d.lastCalledAt.to > d.lastCalledAt.from);
  const activeChanged = changed.filter(advanced);
  const activeAdded = addedEntries.filter((r) => r.lastCalledAt !== null || (r.calls30d ?? 0) > 0);
  return Object.freeze({
    from: previous.takenAt,
    to: next.takenAt,
    incomplete: previous.complete !== true || next.complete !== true,
    added,
    removed,
    changed,
    active: [...activeChanged.map((d) => d.resource), ...activeAdded.map((r) => r.resource)],
    newPayerSignals: [
      ...changed.filter((d) => d.uniquePayersDelta > 0).map((d) => d.resource),
      ...addedEntries.filter((r) => (r.uniquePayers30d ?? 0) > 0).map((r) => r.resource),
    ],
    activeWithoutPayerRise: activeChanged.filter((d) => d.uniquePayersDelta <= 0).map((d) => d.resource),
    priceChanges: changed.filter((d) => d.priceChanged).map((d) => d.resource),
    totalsDelta: Object.freeze({
      resources: next.totals.resources - previous.totals.resources,
      calls30d: next.totals.calls30d - previous.totals.calls30d,
    }),
  });
}
