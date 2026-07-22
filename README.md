# x402 Boundary Reference

An Apache-2.0 reference implementation for two things only:

- building an explicit x402 v2 exact-EVM payment boundary for an Express route;
- inspecting one public x402 v2 challenge without paying, signing, settling, or consuming its protected response.

The caller supplies the route set, CAIP-2 network, price, payee, and separately hired facilitator. This package holds no key, account, customer record, settlement ledger, or hosted operation.

The inspection helper intentionally requires a caller-supplied **egress-safe**
fetch capability. It does not use ambient process network access to resolve or
follow arbitrary Internet DNS; the hiring enterprise owns DNS, SSRF, and
network-egress policy at that boundary.

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

Run `npm install` then `npm run verify`. Hosting, settlement operations, compliance assurance, response guarantees, and support are deliberately separate paid services.
