// Session-isolation guards for the frontend (Avatar Practice vs Voice Practice, student vs student, tab vs tab).
// Source-level: nothing here can start a session. Run with: npm run test:isolation
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8");

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (["node_modules", "dist", ".next", "tests"].includes(name)) continue;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

const SESSION_FILES = [...readdirSync(join(root, "lib/voice")).map(f => `lib/voice/${f}`), ...readdirSync(join(root, "lib/spatialreal")).map(f => `lib/spatialreal/${f}`), ...readdirSync(join(root, "lib/cartoon")).map(f => `lib/cartoon/${f}`), "components/student/player/MariamSession.tsx", "components/student/player/VoiceSession.tsx", "components/student/player/CartoonSession.tsx", "components/student/player/CartoonCharacterPanel.tsx", "components/cartoon/CartoonCharacter.tsx", "components/student/player/PlayerMain.tsx", "components/student/player/PracticeModeSwitch.tsx", "components/student/player/CourseContent.tsx"].filter(f => f.endsWith(".ts") || f.endsWith(".tsx"));

test("no module-level mutable state anywhere in the session code (no shared 'current session')", () => {
  for (const file of SESSION_FILES) {
    const src = read(file);
    assert.ok(!/^(let|var) /m.test(src), `${file}: top-level let/var`);
    assert.ok(!/^(export )?const \w+(: [^=]+)? = new (Map|Set|WeakMap|WeakSet)\(/m.test(src), `${file}: top-level Map/Set`);
    assert.ok(!/^(export )?const \w+(: [^=]+)? = (\[\]|\{\});?$/m.test(src), `${file}: top-level mutable literal`);
    assert.ok(!/globalThis\.|window\.[A-Za-z_]+\s*=|sessionStorage|localStorage/.test(src), `${file}: global/browser storage`);
  }
});

test("the only shared structure in the request path is the H1 refresh map, keyed per refresh token", () => {
  const route = read("app/api/backend/[...path]/route.ts");
  const maps = route.match(/^const \w+ = new Map</gm) ?? [];
  assert.equal(maps.length, 1);
  assert.match(route, /refreshesInFlight = new Map<string,/);
  assert.match(route, /refreshesInFlight\.get\(/);
});

test("lesson player mounts exactly ONE practice mode at a time, only inside the Discuss tab", () => {
  const src = read("components/student/player/PlayerMain.tsx");
  assert.equal((src.match(/<MariamSession\b/g) ?? []).length, 1);
  assert.equal((src.match(/<VoiceSession\b/g) ?? []).length, 1);
  assert.equal((src.match(/<CartoonSession\b/g) ?? []).length, 1);
  assert.match(src, /practice === "avatar" \? \(\s*<MariamSession[^]*?\) : practice === "cartoon" \? \(\s*<CartoonSession[^]*?\) : \(\s*<VoiceSession/, "a strict three-way either/or ternary - never two modes at once");
  const discuss = src.slice(src.indexOf('tab === "discuss" && ('));
  assert.ok(discuss.includes("<MariamSession") && discuss.includes("<VoiceSession") && discuss.includes("<CartoonSession"), "every mode lives only under the Discuss tab");
  assert.ok(!src.slice(0, src.indexOf('tab === "discuss" && (')).match(/<(MariamSession|VoiceSession|CartoonSession)/), "never mounted outside it");
  // each mode reports its own activity through its OWN state variable (no shared flag to clobber)
  assert.match(src, /onActiveChange=\{setAvatarActive\}/);
  assert.match(src, /onActiveChange=\{setVoiceActive\}/);
  assert.match(src, /onActiveChange=\{setCartoonActive\}/);
  // Stage 3: a live Avatar session (with a reported session id) no longer locks the switch, so the student can tap
  // "Cartoon" to trigger a handoff - Voice/Cartoon stay fully locked while active, same as before.
  assert.match(src, /locked=\{voiceActive \|\| cartoonActive \|\| \(avatarActive && !avatarSessionId\) \|\| handoffPending\}/);
});

test("Avatar mic-gate and avatar speaking state exist ONLY in Avatar Practice files", () => {
  const offenders = walk(".")
    .map(f => f.replace(/^\.\//, ""))
    .filter(f => /micGate|createMicGate|isMariamSpeaking|ActiveSpeakersChanged|MIC_HOLD_TOPIC/.test(read(f)))
    .sort();
  assert.deepEqual(offenders, [
    "components/student/player/MariamSession.tsx",
    "lib/spatialreal/avatarTurn.ts",
    "lib/spatialreal/avatarUiState.ts",
    "lib/spatialreal/micGate.ts",
    "lib/spatialreal/types.ts",
    "lib/spatialreal/useSpatialRealAvatar.ts",
  ]);
});

test("Voice and Avatar code never import each other", () => {
  for (const file of [...readdirSync(join(root, "lib/voice")).map(f => `lib/voice/${f}`), "components/student/player/VoiceSession.tsx", "components/student/player/VoiceCallView.tsx", "components/student/player/VoiceConversation.tsx", "components/student/player/CartoonSession.tsx", "components/student/player/CartoonCharacterPanel.tsx", "components/cartoon/CartoonCharacter.tsx"]) {
    const src = read(file);
    assert.ok(!/from ["'][^"']*(spatialreal|MariamSession|micGate|avatarUiState)[^"']*["']/.test(src), `${file} imports Avatar code`);
    assert.ok(!/@spatialwalk\//.test(src), `${file} uses the SpatialReal SDK`);
  }
  for (const file of [...readdirSync(join(root, "lib/spatialreal")).map(f => `lib/spatialreal/${f}`), "components/student/player/MariamSession.tsx"].filter(f => /\.tsx?$/.test(f))) {
    const src = read(file);
    assert.ok(!/from ["'][^"']*(lib\/voice|VoiceSession|voiceRoom|useVoicePractice)[^"']*["']/.test(src), `${file} imports Voice code`);
  }
});

test("Avatar cleanup removes its own listeners and disposes its own gate", () => {
  const hook = read("lib/spatialreal/useSpatialRealAvatar.ts");
  // The room listeners (agent state, speakers, reconnect) live in `avatarTurn.ts`; the hook stops that watcher.
  assert.match(hook, /stopWatching\(\)/);
  assert.match(read("lib/spatialreal/avatarTurn.ts"), /for \(const \[event, handler\] of events\) room\.off\(event, handler\)/);
  assert.match(hook, /gate\.dispose\(\)/);
  assert.match(hook, /if \(gateRef\.current === gate\) gateRef\.current = null/, "only clears its own gate");
  assert.match(hook, /const live = \(\) => !cancelled/, "late SDK callbacks from a superseded connection are ignored");
  assert.ok((hook.match(/if \(live\(\)\)|if \(!live\(\)\) return/g) ?? []).length >= 6, "every SDK callback checks it still belongs to the current session");
});

test("Voice calls always carry an explicit session id, and a stale room cannot close a newer session", () => {
  const hook = read("lib/voice/useVoicePractice.ts");
  assert.match(hook, /if \(sessionIdRef\.current !== sessionId\) return;/, "finish() ignores a room that is no longer current");
  assert.match(hook, /sessionsApi\.endVoice\(sessionId,/);
  assert.match(hook, /confirmVoiceConnected\(sessionId\)/);
  assert.match(hook, /onEnded: cause => void finish\(sessionId, room, cause\)/, "each room closure captures its OWN session id");
  assert.match(hook, /onAgentJoined: \(\) => void confirmConnected\(sessionId\)/);
  assert.ok(!/sessionsApi\.(endVoice|confirmVoiceConnected)\(sessionIdRef\.current/.test(hook), "never resolves 'the current session' for a callback");
  assert.match(hook, /if \(startingRef\.current \|\| \(roomRef\.current && !roomRef\.current\.isEnded\)\) return;/, "never two rooms from one hook");
  assert.match(hook, /if \(!room_name\.startsWith\("voice-"\)\)/, "never joins a non-voice token");
  assert.match(hook, /void roomRef\.current\?\.end\("user_ended"\);\s*\n\s*\};\s*\n\s*\}, \[\]\);/, "unmount ends THIS hook's own room");
});

test("Avatar requests never carry a mode; only Voice sends it, and only the owner can end/confirm", () => {
  const client = read("lib/api/client.ts");
  assert.match(client, /mode === "voice_practice" \? \{ topic_id: topicId, mode \} : \{ topic_id: topicId \}/);
  assert.ok(!/sessionsApi\.(start|endVoice|confirmVoiceConnected)/.test(read("components/student/player/MariamSession.tsx")) || /sessionsApi\.start\(topicId\)/.test(read("components/student/player/MariamSession.tsx")));
  assert.ok(!/endVoice|confirmVoiceConnected|voice_practice/.test(read("components/student/player/MariamSession.tsx")), "Avatar never calls the Voice lifecycle");
  assert.ok(!/sessionsApi\.start\(topicId\)|"topic_discussion"/.test(read("lib/voice/useVoicePractice.ts")), "Voice never starts an Avatar session");
});

test("VoiceRoom has no static/shared mutable state (each start is a fresh room object)", () => {
  const src = read("lib/voice/voiceRoom.ts");
  assert.ok(!/\bstatic\s+(?!readonly)\w+\s*[:=]/.test(src));
  assert.match(read("lib/voice/useVoicePractice.ts"), /new VoiceRoom\(/);
});

test("the auth/API layer has no browser storage, no shared token/promise cache and no session singleton", () => {
  const files = [...walk("lib/api"), ...walk("lib/auth"), ...walk("app/api")];
  assert.ok(files.length > 3);
  for (const file of files) {
    const src = read(file);
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src.replace(/\/\*[^]*?\*\//g, "").replace(/\/\/.*$/gm, "")), `${file}: browser storage / script-readable cookie`);
    assert.ok(!/^(let|var) /m.test(src), `${file}: top-level let/var`);
  }
  // the ONLY module-level containers in these layers: the H1 per-refresh-token map and a constant status Set
  const containers = files.flatMap(f => [...read(f).matchAll(/^(?:export )?const (\w+)(?::[^=]+)? = new (Map|Set|WeakMap)[<(]/gm)].map(m => `${f}:${m[1]}`)).sort();
  assert.deepEqual(containers, ["app/api/backend/[...path]/route.ts:refreshesInFlight", "lib/api/server/backend.ts:NULL_BODY_STATUSES"]);
  // the client API never holds a token: requests rely on HttpOnly cookies set by the BFF
  assert.ok(!/Authorization|Bearer /.test(read("lib/api/client.ts").replace(/\/\*[^]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "no client-held bearer token");
});

test("a LiveKit token only ever lives in the started session's own closure (never stored, never re-read)", () => {
  const voice = read("lib/voice/useVoicePractice.ts");
  const avatar = read("components/student/player/MariamSession.tsx");
  assert.match(voice, /const \{ session_id: sessionId, server_url, participant_token, room_name, max_duration_minutes \} = started;/);
  assert.match(voice, /await room\.connect\(server_url, participant_token\)/);
  assert.ok(!/participant_token/.test(voice.replace(/const \{[^}]*participant_token[^}]*\} = started;/, "").replace("room.connect(server_url, participant_token)", "")), "token used only at connect");
  assert.match(avatar, /setConnection\(\{\s*roomName: room_name,\s*token: participant_token,\s*url: server_url,/);
  assert.match(avatar, /onDisconnected: \(\) => \{[^}]*setConnection\(null\)/, "the avatar token is dropped when the session ends");
  assert.ok(!/(localStorage|sessionStorage)/.test(avatar + voice));
});
