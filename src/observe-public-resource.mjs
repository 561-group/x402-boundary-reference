import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { validatePaymentRequired } from "@x402/core/schemas";

const EVM_NETWORK = /^eip155:[1-9][0-9]*$/u;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const UINT = /^(?:0|[1-9][0-9]*)$/u;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function ni(value) { return `ni:///sha-256;${createHash("sha256").update(JSON.stringify(stable(value))).digest("base64url")}`; }

/** Refuse credential-bearing, local, and literal-IP targets before fetch. */
export function publicHttpsUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) throw new TypeError("resourceUrl must be one bounded absolute HTTPS URL");
  let url; try { url = new URL(value); } catch { throw new TypeError("resourceUrl must be one bounded absolute HTTPS URL"); }
  const hostname = url.hostname.replace(/^\[|\]$/gu, "").replace(/\.$/u, "").toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash || isIP(hostname) !== 0 || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new TypeError("resourceUrl must name a credential-free public HTTPS DNS host");
  return url.href;
}

function acceptance(value, index) {
  if (!["exact", "batch-settlement"].includes(value?.scheme)) throw new TypeError(`accepts[${index}] uses an unsupported x402 scheme`);
  if (!EVM_NETWORK.test(value.network) || !UINT.test(value.amount) || BigInt(value.amount) === 0n || !EVM_ADDRESS.test(value.payTo) || (value.asset !== "native" && !EVM_ADDRESS.test(value.asset)) || !Number.isSafeInteger(value.maxTimeoutSeconds) || value.maxTimeoutSeconds <= 0) throw new TypeError(`accepts[${index}] is not one valid EVM x402 alternative`);
  return Object.freeze({ ...value, asset: value.asset === "native" ? "native" : value.asset.toLowerCase(), payTo: value.payTo.toLowerCase() });
}

/**
 * Inspect a public x402 v2 challenge without credentials, payment, signing,
 * settlement, redirect following, or consumption of the protected response body.
 * The caller MUST supply the egress-safe fetch capability: this package never
 * resolves and follows arbitrary Internet DNS through ambient process network.
 */
export async function observePublicX402Resource({ resourceUrl, method = "GET", fetchImpl, timeoutMs = 10_000, signal } = {}) {
  const url = publicHttpsUrl(resourceUrl);
  const verb = typeof method === "string" ? method.toUpperCase() : "";
  if (!["GET", "HEAD"].includes(verb)) throw new TypeError("method must be GET or HEAD");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 30_000 || typeof fetchImpl !== "function") throw new TypeError("observation requires an explicit egress-safe fetch implementation and timeout from 250 through 30000ms");
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const response = await fetchImpl(url, { method: verb, headers: { accept: "application/json" }, redirect: "manual", signal: signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]) });
  if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error("x402 observation refuses redirects");
  if (response.status !== 402) throw new Error(`x402 resource returned HTTP ${response.status}, not 402`);
  const header = response.headers.get("payment-required");
  if (header === null || header.length === 0 || header.length > 65_536) throw new Error("x402 resource did not return one bounded payment-required header");
  let paymentRequired;
  try { paymentRequired = validatePaymentRequired(decodePaymentRequiredHeader(header)); } catch (error) { throw new Error(`payment-required header violates the official x402 schema: ${error instanceof Error ? error.message : String(error)}`); }
  if (paymentRequired.x402Version !== 2 || publicHttpsUrl(paymentRequired.resource.url) !== url || paymentRequired.accepts.length < 1 || paymentRequired.accepts.length > 32) throw new TypeError("x402 challenge is not an exact public v2 resource declaration");
  const normalized = stable({ ...paymentRequired, accepts: paymentRequired.accepts.map(acceptance) });
  return Object.freeze({ profile: "org.561-group.x402.public-resource-observation.v1", method: verb, resourceUrl: url, paymentRequired: normalized, observationDigest: ni({ method: verb, paymentRequired: normalized }), authority: Object.freeze({ publicReadOnly: true, paymentAttempted: false, signingAttempted: false, settlementAttempted: false, resourceBodyConsumed: false }) });
}
