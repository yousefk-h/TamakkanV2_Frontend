// Preloaded with `node --import` so tests can import the real BFF route
// handlers (TypeScript, run through Node's own type-stripping) outside the
// Next/vinext runtime. See bff-hooks.mjs for what gets redirected.
import { register } from "node:module";

register("./bff-hooks.mjs", import.meta.url);
