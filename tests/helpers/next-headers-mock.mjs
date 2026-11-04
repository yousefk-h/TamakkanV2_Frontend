// Stand-in for `next/headers` in tests. In Next, `cookies()` returns the
// cookie store of the request currently being handled; here each simulated
// request runs inside `requestCookies.run(jar, ...)`, so concurrent requests
// each see only their own jar - exactly the isolation the real runtime gives.
import { AsyncLocalStorage } from "node:async_hooks";

export const requestCookies = new AsyncLocalStorage();

export async function cookies() {
  const jar = requestCookies.getStore();
  if (!jar) throw new Error("cookies() called outside a simulated request");
  return jar;
}

/** A minimal cookie store with the subset of Next's API the BFF uses. */
export function createCookieJar(initial = {}) {
  const values = new Map(Object.entries(initial));
  const options = new Map();
  return {
    get(name) {
      return values.has(name) ? { name, value: values.get(name) } : undefined;
    },
    set(name, value, opts) {
      values.set(name, value);
      options.set(name, opts);
    },
    delete(name) {
      values.delete(name);
      options.delete(name);
    },
    snapshot() {
      return Object.fromEntries(values);
    },
    optionsFor(name) {
      return options.get(name);
    },
  };
}
