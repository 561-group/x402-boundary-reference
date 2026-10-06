import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

function exactRouteSet(routes) {
  if (routes === null || typeof routes !== "object" || Array.isArray(routes) || Object.keys(routes).length === 0) {
    throw new TypeError("routes must be one nonempty x402 route configuration");
  }
  return routes;
}

function discoveryMap(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("discoveryByRoute must be an object keyed by exact route");
  }
  return value;
}

/**
 * Attach official x402 Bazaar discovery declarations to already-priced routes.
 *
 * Seller economics remain in the route configuration. Capability schemas,
 * examples and discovery metadata remain in discoveryByRoute so either side can
 * be reviewed or generated independently.
 */
export function withBazaarDiscovery(routes, discoveryByRoute = {}) {
  const base = exactRouteSet(routes);
  const discovery = discoveryMap(discoveryByRoute);

  for (const route of Object.keys(discovery)) {
    if (!Object.hasOwn(base, route)) {
      throw new TypeError(`Bazaar discovery names unknown route ${route}`);
    }
  }

  const enriched = {};
  for (const [route, configuration] of Object.entries(base)) {
    const declaration = discovery[route];
    if (declaration === undefined) {
      enriched[route] = configuration;
      continue;
    }
    if (declaration === null || typeof declaration !== "object" || Array.isArray(declaration)) {
      throw new TypeError(`${route} Bazaar discovery declaration must be an object`);
    }
    if (
      configuration.extensions !== undefined &&
      (configuration.extensions === null ||
        typeof configuration.extensions !== "object" ||
        Array.isArray(configuration.extensions))
    ) {
      throw new TypeError(`${route} extensions must be an object when present`);
    }

    enriched[route] = Object.freeze({
      ...configuration,
      extensions: Object.freeze({
        ...(configuration.extensions ?? {}),
        ...declareDiscoveryExtension(declaration),
      }),
    });
  }

  return Object.freeze(enriched);
}
