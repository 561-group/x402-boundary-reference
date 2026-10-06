import { withBazaarDiscovery } from "./bazaar.mjs";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} is required`);
  }
  return value;
}

/**
 * Compile a list of independently priced products into one official x402 route
 * catalog with Bazaar discovery declarations.
 *
 * This does not mount handlers or choose prices. It only removes repetitive,
 * error-prone route/discovery assembly from multi-product sellers.
 */
export function catalogueExactEvmProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new TypeError("products must be a nonempty array");
  }

  const routes = {};
  const discovery = {};
  const ids = new Set();

  for (const product of products) {
    const id = requiredString(product?.id, "product.id");
    if (ids.has(id)) throw new TypeError(`duplicate product id ${id}`);
    ids.add(id);

    const method = requiredString(product.method, `${id}.method`).toUpperCase();
    if (!METHODS.has(method)) throw new TypeError(`${id}.method is not supported`);
    const path = requiredString(product.path, `${id}.path`);
    if (!/^\/\S*$/u.test(path)) throw new TypeError(`${id}.path must be an absolute route path`);

    const route = `${method} ${path}`;
    if (Object.hasOwn(routes, route)) throw new TypeError(`duplicate product route ${route}`);
    if (product.accepts === undefined) throw new TypeError(`${id}.accepts is required`);
    if (product.discovery === null || typeof product.discovery !== "object" || Array.isArray(product.discovery)) {
      throw new TypeError(`${id}.discovery must be an object`);
    }

    routes[route] = Object.freeze({
      accepts: product.accepts,
      ...(product.description !== undefined ? { description: product.description } : {}),
      ...(product.mimeType !== undefined ? { mimeType: product.mimeType } : {}),
      ...(product.resource !== undefined ? { resource: product.resource } : {}),
      ...(product.extensions !== undefined ? { extensions: product.extensions } : {}),
    });
    discovery[route] = product.discovery;
  }

  return withBazaarDiscovery(routes, discovery);
}
