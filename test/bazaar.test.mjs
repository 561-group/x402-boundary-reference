import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { validateAndExtract, validateDiscoveryExtensionSpec } from "@x402/extensions/bazaar";
import {
  createExactEvmPaymentBoundary,
  withBazaarDiscovery,
} from "../src/index.mjs";

const NETWORK = "eip155:84532";
const PAY_TO = "0x0000000000000000000000000000000000000001";
const facilitator = {
  async getSupported() {
    return {
      kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
      extensions: ["bazaar"],
      signers: {},
    };
  },
  async verify() { throw new Error("unpaid test must not verify"); },
  async settle() { throw new Error("unpaid test must not settle"); },
};

test("Bazaar metadata rides in the unpaid payment challenge", async () => {
  const routes = withBazaarDiscovery(
    {
      "GET /semantic-id": {
        accepts: [{ scheme: "exact", network: NETWORK, price: "$0.001", payTo: PAY_TO }],
        description: "Return a canonical semantic content identifier",
        mimeType: "application/json",
      },
    },
    {
      "GET /semantic-id": {
        input: { kind: "example.unit" },
        inputSchema: {
          type: "object",
          properties: {
            kind: { type: "string", description: "Semantic object kind" },
          },
          required: ["kind"],
        },
        output: {
          example: { id: "ni:///sha-256;example" },
          schema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      },
    },
  );

  const boundary = createExactEvmPaymentBoundary({
    network: NETWORK,
    facilitatorClient: facilitator,
    routes,
  });
  const app = express();
  app.use(boundary.middleware);
  app.get("/semantic-id", (_request, response) => {
    response.json({ id: "unreachable-without-payment" });
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/semantic-id`,
    );
    const challenge = JSON.parse(
      Buffer.from(response.headers.get("payment-required"), "base64").toString("utf8"),
    );

    assert.equal(response.status, 402);
    assert.equal(challenge.extensions?.bazaar?.info?.input?.type, "http");
    assert.equal(challenge.extensions?.bazaar?.info?.input?.method, "GET");
    assert.equal(
      challenge.extensions?.bazaar?.info?.input?.queryParams?.kind,
      "example.unit",
    );
    assert.equal(
      challenge.extensions?.bazaar?.info?.output?.example?.id,
      "ni:///sha-256;example",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Bazaar helper refuses catalog drift", () => {
  assert.throws(
    () =>
      withBazaarDiscovery(
        {
          "GET /value": {
            accepts: [{ scheme: "exact", network: NETWORK, price: "$0.001", payTo: PAY_TO }],
          },
        },
        { "GET /typo": { input: {} } },
      ),
    /unknown route/u,
  );
});

test("the official Bazaar server extension enriches dynamic paths and their schema", async () => {
  const routes = withBazaarDiscovery({ "GET /astronomy/:date": {
    accepts: [{ scheme: "exact", network: NETWORK, price: "$0.04", payTo: PAY_TO }],
  } }, { "GET /astronomy/:date": { method: "GET", input: {} } });
  routes["GET /astronomy/:date"].extensions.bazaar.routeTemplate = "/astronomy/:date";
  const boundary = createExactEvmPaymentBoundary({ network: NETWORK, facilitatorClient: facilitator, routes });
  const app = express(); app.use(boundary.middleware);
  let executed = false;
  app.get("/astronomy/:date", (_request, response) => { executed = true; response.json({ value: "protected" }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/astronomy/2026-10-13`);
    const challenge = JSON.parse(Buffer.from(response.headers.get("payment-required"), "base64").toString("utf8"));
    assert.equal(response.status, 402); assert.equal(executed, false);
    const extension = challenge.extensions.bazaar;
    assert.equal(extension.routeTemplate, "/astronomy/:date");
    assert.equal(extension.info.input.pathParams.date, "2026-10-13");
    assert.equal(validateDiscoveryExtensionSpec(extension).valid, true);
    assert.equal(validateAndExtract(extension).valid, true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
