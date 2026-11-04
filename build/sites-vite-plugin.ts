// Local stub for the OpenAI Sites platform's vite plugin, which is
// normally injected by that hosting platform and isn't part of this
// source checkout. No-op so `vite dev`/`build` can run locally.
export function sites() {
  return { name: "sites-local-stub" };
}
