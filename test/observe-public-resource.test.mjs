import assert from "node:assert/strict";
import test from "node:test";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { observePublicX402Resource } from "../src/observe-public-resource.mjs";

const url = "https://market.example.test/v1/astronomy/2026-10-13";
const required = extensions => ({ x402Version: 2, resource: { url }, accepts: [{ scheme: "exact", network: "eip155:8453", amount: "40000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: `0x${"11".repeat(20)}`, maxTimeoutSeconds: 300 }], ...(extensions === undefined ? {} : { extensions }) });
function observe(extensions) {
  let calls = 0;
  return observePublicX402Resource({ resourceUrl: url, fetchImpl: async (target, init) => {
    assert.equal(++calls, 1); assert.equal(target, url); assert.equal(init.method, "GET"); assert.equal(init.redirect, "manual");
    assert.equal(init.headers["payment-signature"], undefined);
    return new Response("", { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify(required(extensions))).toString("base64") } });
  } });
}

test("Bazaar remains optional and unknown optional extensions remain intact", async () => {
  const absent = await observe(); assert.match(absent.observationDigest, /^ni:\/\/\/sha-256;/u);
  const other = await observe({ "example-extension": { evidence: true } });
  assert.equal(other.paymentRequired.extensions["example-extension"].evidence, true);
});

test("official discovery admits colon route templates", async () => {
  const extension = declareDiscoveryExtension({ method: "GET", input: { latitude: 0 }, inputSchema: { type: "object", properties: { latitude: { type: "number" } } } });
  extension.bazaar.routeTemplate = "/v1/astronomy/:date";
  const result = await observe(extension);
  assert.equal(result.paymentRequired.extensions.bazaar.routeTemplate, "/v1/astronomy/:date");
  assert.equal(result.authority.resourceBodyConsumed, false);
});

test("valid payment requirements with deployed-style brace route templates refuse", async () => {
  const extension = declareDiscoveryExtension({ method: "GET" });
  extension.bazaar.routeTemplate = "/v1/astronomy/{date}";
  await assert.rejects(observe(extension), /routeTemplate/u);
});

test("malformed discovery, schema contradictions and method drift refuse", async () => {
  for (const bazaar of [null, [], {}, { info: {}, schema: {} }]) await assert.rejects(observe({ bazaar }), /Bazaar/u);
  const mismatch = declareDiscoveryExtension({ method: "POST", bodyType: "json", input: {} });
  await assert.rejects(observe(mismatch), /observed HTTP method/u);
  const invalid = declareDiscoveryExtension({ method: "GET", input: { unit: "degrees" }, inputSchema: { type: "object", properties: { unit: { type: "number" } } } });
  await assert.rejects(observe(invalid), /schema/u);
});
