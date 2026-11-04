// Module-resolution hooks for the BFF tests (registered by bff-loader.mjs).
//
// - `next/headers` only works inside a Next request context, so it resolves
//   to next-headers-mock.mjs, which serves a per-request cookie jar.
// - The app's own source uses extensionless relative imports (bundler-style);
//   Node's ESM resolver needs the `.ts` spelled out, so add it when that file
//   exists.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NEXT_HEADERS_MOCK = new URL("./next-headers-mock.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") {
    return { url: NEXT_HEADERS_MOCK, shortCircuit: true };
  }
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
  if (isRelative && !hasExtension && context.parentURL?.startsWith("file:")) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return { url: candidate.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
