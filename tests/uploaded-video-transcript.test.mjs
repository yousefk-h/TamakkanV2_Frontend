import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const builder = fs.readFileSync(new URL("../components/admin/topics/builder/ProgramBuilder.tsx", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../lib/api/client.ts", import.meta.url), "utf8");

test("a successful device-video upload immediately starts the existing transcript pipeline", () => {
  const uploadHandler = builder.slice(builder.indexOf("const handleUploadVideo"), builder.indexOf("const handleRemoveVideo"));
  assert.match(uploadHandler, /topicsApi\.uploadSourceVideo/);
  assert.match(uploadHandler, /await startTranscriptGeneration\(\)/);
  assert.match(builder, /topicsApi\.generateTranscript\(topicId\)/);
});

test("device video uses the direct signed-upload contract before finalization", () => {
  assert.match(client, /source-video-signature/);
  assert.match(client, /source-video-finalize/);
});
