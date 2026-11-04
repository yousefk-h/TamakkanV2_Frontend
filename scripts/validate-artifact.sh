#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

standalone="${SITES_PROJECT_ROOT}/dist/standalone/server.js"

[[ -f "${standalone}" ]] || {
  echo "Missing standalone server: dist/standalone/server.js" >&2
  exit 66
}
[[ -d "${SITES_PROJECT_ROOT}/dist/standalone/dist/client" && -d "${SITES_PROJECT_ROOT}/dist/standalone/dist/server" ]] || {
  echo "Missing standalone client or server bundle" >&2
  exit 66
}

node --input-type=module - "${standalone}" <<'NODE'
import { readFile } from "node:fs/promises";

const [standalonePath] = process.argv.slice(2);
const standaloneSource = await readFile(standalonePath, "utf8");
if (!standaloneSource.includes("startProdServer")) throw new Error("Standalone entry must start the production server");
NODE

echo "Validated V2 artifact: standalone server and client/server bundles are present."
