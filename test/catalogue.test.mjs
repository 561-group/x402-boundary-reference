import assert from "node:assert/strict";
import test from "node:test";
import { catalogueExactEvmProducts } from "../src/catalogue.mjs";

const NETWORK = "eip155:8453";
const PAY_TO = "0x0000000000000000000000000000000000000001";

test("compiles independently priced products into one discoverable route catalog", () => {
  const routes = catalogueExactEvmProducts([
    {
      id: "semantic-id",
      method: "POST",
      path: "/semantic/identity",
      accepts: [{ scheme: "exact", network: NETWORK, price: "$0.002", payTo: PAY_TO }],
      description: "Canonical semantic identity",
      mimeType: "application/json",
      discovery: {
        bodyType: "json",
        input: { content: { objectKind: "example.unit" } },
        inputSchema: {
          type: "object",
          properties: { content: { type: "object" } },
          required: ["content"],
        },
        output: { example: { id: "ni:///sha-256;example" } },
      },
    },
    {
      id: "markdown-validate",
      method: "POST",
      path: "/document/markdown/validate",
      accepts: [{ scheme: "exact", network: NETWORK, price: "$0.001", payTo: PAY_TO }],
      description: "Validate one Markdown document",
      mimeType: "application/json",
      discovery: {
        bodyType: "json",
        input: { text: "# Hello" },
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
        output: { example: { conformant: true, findings: [] } },
      },
    },
  ]);

  assert.deepEqual(Object.keys(routes).sort(), [
    "POST /document/markdown/validate",
    "POST /semantic/identity",
  ]);
  assert.ok(routes["POST /semantic/identity"].extensions?.bazaar);
  assert.ok(routes["POST /document/markdown/validate"].extensions?.bazaar);
});

test("refuses duplicate routes and ids before server construction", () => {
  const base = {
    method: "POST",
    path: "/same",
    accepts: [{ scheme: "exact", network: NETWORK, price: "$0.001", payTo: PAY_TO }],
    discovery: {},
  };
  assert.throws(
    () => catalogueExactEvmProducts([{ ...base, id: "a" }, { ...base, id: "b" }]),
    /duplicate product route/u,
  );
  assert.throws(
    () => catalogueExactEvmProducts([
      { ...base, id: "a", path: "/one" },
      { ...base, id: "a", path: "/two" },
    ]),
    /duplicate product id/u,
  );
});
