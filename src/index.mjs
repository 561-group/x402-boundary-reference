import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";

export { observePublicX402Resource, publicHttpsUrl } from "./observe-public-resource.mjs";
export { withBazaarDiscovery } from "./bazaar.mjs";
export { catalogueExactEvmProducts } from "./catalogue.mjs";

function explicitEvmNetwork(value) {
  if (!/^eip155:[1-9][0-9]*$/u.test(value ?? "")) throw new TypeError("network must be one explicit EVM CAIP-2 identifier");
  return value;
}

function exactRouteSet(routes, registeredNetwork) {
  if (routes === null || typeof routes !== "object" || Array.isArray(routes) || Object.keys(routes).length === 0) throw new TypeError("routes must be one nonempty x402 route configuration");
  for (const [route, configuration] of Object.entries(routes)) {
    if (!/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/\S*$/u.test(route)) throw new TypeError(`invalid x402 route ${route}`);
    const accepts = Array.isArray(configuration?.accepts) ? configuration.accepts : [configuration?.accepts];
    if (accepts.length === 0 || accepts.some((entry) => entry?.scheme !== "exact")) throw new TypeError(`${route} must use the official x402 exact scheme`);
    // An x402 resource must not advertise an acceptance network that this
    // resource server has not registered. The declaration and verifier must
    // agree before any challenge can advertise a payable route.
    if (accepts.some((entry) => entry.network !== registeredNetwork)) {
      throw new TypeError(`${route} acceptance network must match registered ${registeredNetwork}`);
    }
  }
  return routes;
}

/**
 * Construct a standard x402 v2 exact-EVM Express boundary. The caller owns
 * the route, price, recipient, books, and separately hired facilitator.
 * This library neither holds credentials nor settles, signs, or stores payment.
 */
export function createExactEvmPaymentBoundary({ network, routes, facilitatorUrl, facilitatorClient, afterSettle } = {}) {
  const selectedNetwork = explicitEvmNetwork(network);
  const admittedRoutes = exactRouteSet(routes, selectedNetwork);
  if (facilitatorClient === undefined && (typeof facilitatorUrl !== "string" || !/^https?:\/\//u.test(facilitatorUrl))) {
    throw new TypeError("facilitatorUrl is required when no facilitatorClient is supplied");
  }
  const facilitator = facilitatorClient ?? new HTTPFacilitatorClient({ url: facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitator).register(selectedNetwork, new ExactEvmScheme());
  if (afterSettle !== undefined) resourceServer.onAfterSettle(afterSettle);
  return Object.freeze({ network: selectedNetwork, resourceServer, middleware: paymentMiddleware(admittedRoutes, resourceServer) });
}
