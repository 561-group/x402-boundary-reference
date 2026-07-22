import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createExactEvmPaymentBoundary, observePublicX402Resource, publicHttpsUrl } from "../src/index.mjs";

const NETWORK = "eip155:84532";
const PAY_TO = "0x0000000000000000000000000000000000000001";
const facilitator = { async getSupported() { return { kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }], extensions: [], signers: {} }; }, async verify() { throw new Error("unpaid test must not verify"); }, async settle() { throw new Error("unpaid test must not settle"); } };

test("constructs an official x402 v2 exact-EVM challenge without payment", async () => {
  const boundary = createExactEvmPaymentBoundary({ network: NETWORK, facilitatorClient: facilitator, routes: { "GET /value": { accepts: [{ scheme: "exact", network: NETWORK, price: "$0.001", payTo: PAY_TO }] } } });
  const app = express(); app.use(boundary.middleware); app.get("/value", (_request, response) => response.json({ value: true }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/value`);
    const challenge = JSON.parse(Buffer.from(response.headers.get("payment-required"), "base64").toString("utf8"));
    assert.equal(response.status, 402); assert.equal(challenge.x402Version, 2); assert.equal(challenge.accepts[0].scheme, "exact"); assert.equal(challenge.accepts[0].network, NETWORK);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("refuses implicit networks, custom schemes, credentials, and local observation targets", () => {
  assert.throws(() => createExactEvmPaymentBoundary({ network: "", facilitatorClient: facilitator, routes: { "GET /value": { accepts: { scheme: "exact" } } } }), /CAIP-2/u);
  assert.throws(() => createExactEvmPaymentBoundary({ network: NETWORK, facilitatorClient: facilitator, routes: { "GET /value": { accepts: { scheme: "custom" } } } }), /exact scheme/u);
  for (const target of ["http://example.com", "https://user:pass@example.com", "https://localhost/value", "https://127.0.0.1/value", "https://[::1]/value"]) assert.throws(() => publicHttpsUrl(target), /public HTTPS DNS host/u);
});

test("refuses ambient network discovery without an explicit egress-safe provider", async () => {
  await assert.rejects(observePublicX402Resource({ resourceUrl: "https://example.com/value" }), /explicit egress-safe fetch implementation/u);
});
