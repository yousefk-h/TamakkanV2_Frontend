import { existsSync, readFileSync } from "node:fs";

const required = [
  "dist/standalone/server.js",
  "dist/standalone/dist/client",
  "dist/standalone/dist/server",
];
for (const path of required) {
  if (!existsSync(path)) throw new Error(`Missing V2 build output: ${path}`);
}
if (!readFileSync(required[0], "utf8").includes("startProdServer")) {
  throw new Error("The standalone entry does not start the production server");
}
console.log("Validated V2 standalone server and client/server bundles.");
