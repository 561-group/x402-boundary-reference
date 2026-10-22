# x402 Boundary Reference

<!-- 561-group-standards:badges:start -->
[![561 Group](https://img.shields.io/badge/561%20Group-561%20Group-1c282a)](https://github.com/561-group)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-1c282a)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/561-group/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

**Charge for specific Express API routes using the official x402 v2 exact-EVM payment scheme, with an explicit network, price, payee and facilitator.** This Apache-2.0 reference is for developers who want an inspectable integration boundary—not a managed checkout, payment wallet or growth scheme.

## Is this the right tool?

Use this reference if you operate an Express API and need to:

- put a standard x402 payment boundary in front of selected routes rather than inventing a proprietary payment envelope;
- explicitly select an EVM CAIP-2 network, route-level acceptance terms and an independent facilitator;
- inspect the public payment challenge of an x402 resource **without** signing, paying, settling or consuming its protected response;
- build an optional Bazaar discovery declaration or catalogue over bounded x402 products using the package's exports.

If you need hosted payment settlement, a customer CRM, custody, wallet/key management, a hosted inference endpoint or legal/compliance assurance, this package **does not provide them**. A chosen facilitator and the operational decisions remain the deployer's responsibility. Do not interpret a successful local test as proof that a paid public node is operational.

### Quick start

Install this project's dependencies using `npm install`, then run `npm run verify` to exercise its source checks and tests. An Express integration begins with an explicit route set:

```js
import express from "express";
import { createExactEvmPaymentBoundary } from "@561-group/x402-boundary-reference";

const boundary = createExactEvmPaymentBoundary({
  network: "eip155:8453",
  facilitatorUrl: "https://facilitator.example",
  routes: { "GET /analysis": { accepts: [{ scheme: "exact", network: "eip155:8453", price: "$0.01", payTo: "0x..." }] } },
});
const app = express();
app.use(boundary.middleware);
app.get("/analysis", (_request, response) => response.json({ result: "paid result" }));
```

This is an **illustration**, not a deployable payment configuration: replace the example facilitator and recipient with values admitted by the application owner and verify the actual chosen chain, token, terms and settlement configuration.

## Proof boundaries and operational safety

The caller supplies the route set, CAIP-2 network, price, payee and separately hired facilitator. This package holds no key, account, customer record, settlement ledger or hosted operation.

The public-resource inspection helper deliberately requires a caller-supplied **egress-safe** fetch capability. It does not use ambient process network access to resolve or follow arbitrary Internet DNS; the hiring enterprise owns DNS, SSRF and network-egress policy at that boundary.

Inspection validates the payment requirements with the official x402 schema and, when present, validates Bazaar metadata with the official discovery validators, including request method and colon-style route templates. A valid payment envelope with invalid discovery metadata refuses. The Express boundary registers the official Bazaar server extension so dynamic routes include concrete path parameters and a matching schema in their challenges.

Before publicly marketing a service built with this library, independently verify its real challenge, observed payment network, accepted resource, settlement and receiver. A GitHub star, a publication URL or a local passing test is not evidence of a completed paid request.

## Public product and operated-node companion

This source is published under Apache-2.0 by the [`561-group` GitHub organization](https://github.com/561-group). Its companion paid product is the **Metered RMN Inference** node listed at [`market.561.group`](https://market.561.group/): the code is free to run or adapt; the operated node sells execution on its advertised chains. The node's own live x402 challenge—not this README—is authoritative for price, chain and payee policy.

The 561 Group separately accepts sponsorship for the public research and reference layer. Current policy and the Base USDC sponsorship route are published at the market. Sponsorship is not a paid-node request.

Hosting, settlement operations, compliance assurance, response guarantees and support remain separate services.
