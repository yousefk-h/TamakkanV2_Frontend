// Practice UI state (Avatar + Voice): pure presentation helpers and wiring guards. No browser, no network.
//
// Run with: npm run test:ui
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { deriveVoiceIndicator, voiceControls } = await import(new URL("../lib/voice/voiceUiState.ts", import.meta.url).href);
const { deriveAvatarTurn, avatarControls, isAvatarSessionActive } = await import(new URL("../lib/spatialreal/avatarUiState.ts", import.meta.url).href);
const { deriveCartoonCharacterView } = await import(new URL("../lib/cartoon/cartoonCharacterState.ts", import.meta.url).href);
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

const live = { phase: "live", connection: "connected", agentPresent: true, agentState: "listening", micEnabled: true };

test("voice indicator: every session state maps to one clear visual state", () => {
  assert.equal(deriveVoiceIndicator({ ...live, phase: "idle", connection: "idle" }), "idle");
  assert.equal(deriveVoiceIndicator({ ...live, phase: "starting", connection: "idle" }), "connecting");
  assert.equal(deriveVoiceIndicator({ ...live, connection: "connecting" }), "connecting");
  assert.equal(deriveVoiceIndicator({ ...live, connection: "reconnecting" }), "reconnecting");
  assert.equal(deriveVoiceIndicator({ ...live, agentPresent: false, agentState: null }), "waiting");
  assert.equal(deriveVoiceIndicator({ ...live, agentState: "initializing" }), "waiting");
  assert.equal(deriveVoiceIndicator({ ...live, agentState: "speaking" }), "speaking");
  assert.equal(deriveVoiceIndicator({ ...live, agentState: "thinking" }), "thinking");
  assert.equal(deriveVoiceIndicator(live), "listening");
  assert.equal(deriveVoiceIndicator({ ...live, agentState: "idle" }), "listening");
  assert.equal(deriveVoiceIndicator({ ...live, micEnabled: false }), "muted");
  assert.equal(deriveVoiceIndicator({ ...live, phase: "ending" }), "ending");
  assert.equal(deriveVoiceIndicator({ ...live, phase: "ended" }), "ended");
  assert.equal(deriveVoiceIndicator({ ...live, phase: "error" }), "error");
});

test("voice indicator: Mariam speaking wins over a muted mic (the student mic state is shown separately)", () => {
  assert.equal(deriveVoiceIndicator({ ...live, agentState: "speaking", micEnabled: false }), "speaking");
});

test("cartoon character view: no live call shows the idle pose, never a guessed state", () => {
  assert.deepEqual(deriveCartoonCharacterView({ phase: "idle", agentPresent: false, agentState: null }), { agentState: null, idleGlances: true });
  assert.deepEqual(deriveCartoonCharacterView({ phase: "starting", agentPresent: false, agentState: null }), { agentState: null, idleGlances: true });
  assert.deepEqual(deriveCartoonCharacterView({ phase: "ended", agentPresent: false, agentState: null }), { agentState: null, idleGlances: true });
  // Live but the tutor hasn't joined yet (or dropped): still the idle pose, not a stale state.
  assert.deepEqual(deriveCartoonCharacterView({ phase: "live", agentPresent: false, agentState: "thinking" }), { agentState: null, idleGlances: true });
});

test("cartoon character view: live states pass through verbatim, glances only while idle/listening", () => {
  assert.deepEqual(deriveCartoonCharacterView({ phase: "live", agentPresent: true, agentState: "thinking" }), { agentState: "thinking", idleGlances: false });
  assert.deepEqual(deriveCartoonCharacterView({ phase: "live", agentPresent: true, agentState: "speaking" }), { agentState: "speaking", idleGlances: false });
  assert.deepEqual(deriveCartoonCharacterView({ phase: "live", agentPresent: true, agentState: "listening" }), { agentState: "listening", idleGlances: true });
  assert.deepEqual(deriveCartoonCharacterView({ phase: "live", agentPresent: true, agentState: "idle" }), { agentState: "idle", idleGlances: true });
  assert.deepEqual(deriveCartoonCharacterView({ phase: "live", agentPresent: true, agentState: null }), { agentState: null, idleGlances: true });
  // Ending (goodbye) still reflects the real last-known state - the call screen doesn't snap to idle early.
  assert.deepEqual(deriveCartoonCharacterView({ phase: "ending", agentPresent: true, agentState: "speaking" }), { agentState: "speaking", idleGlances: false });
});

test("voice controls appear only when usable", () => {
  assert.deepEqual(voiceControls({ phase: "idle", connection: "idle" }), { showMic: false, showEnd: false });
  assert.deepEqual(voiceControls({ phase: "starting", connection: "idle" }), { showMic: false, showEnd: false });
  assert.deepEqual(voiceControls({ phase: "live", connection: "connecting" }), { showMic: false, showEnd: true });
  assert.deepEqual(voiceControls({ phase: "live", connection: "connected" }), { showMic: true, showEnd: true });
  assert.deepEqual(voiceControls({ phase: "live", connection: "reconnecting" }), { showMic: true, showEnd: true });
  assert.deepEqual(voiceControls({ phase: "ended", connection: "ended" }), { showMic: false, showEnd: false });
});

const av = { status: "connected", micRequested: true, isMariamSpeaking: false, isMicMuted: false, isPublishingMicrophone: true };

test("avatar turn: speaking / your turn / manual mute / connecting / error", () => {
  assert.equal(deriveAvatarTurn(av), "yourTurn");
  assert.equal(deriveAvatarTurn({ ...av, isMariamSpeaking: true }), "mariamSpeaking");
  assert.equal(deriveAvatarTurn({ ...av, isMicMuted: true }), "mariamSpeaking");
  assert.equal(deriveAvatarTurn({ ...av, isPublishingMicrophone: false }), "listening");
  assert.equal(deriveAvatarTurn({ ...av, status: "connecting" }), "connecting");
  assert.equal(deriveAvatarTurn({ ...av, status: "initializing" }), "connecting");
  assert.equal(deriveAvatarTurn({ ...av, status: "error" }), "error");
});

test("avatar turn: the student's own mute always wins the label (never shows 'Your turn' while muted)", () => {
  assert.equal(deriveAvatarTurn({ ...av, micRequested: false }), "micOff");
  assert.equal(deriveAvatarTurn({ ...av, micRequested: false, isMariamSpeaking: true }), "micOff");
});

test("avatar controls: mic hidden until connected, End always available while a call exists", () => {
  assert.deepEqual(avatarControls("connecting"), { showMic: false, showEnd: true });
  assert.deepEqual(avatarControls("initializing"), { showMic: false, showEnd: true });
  assert.deepEqual(avatarControls("connected"), { showMic: true, showEnd: true });
  assert.deepEqual(avatarControls("idle"), { showMic: false, showEnd: true }, "End stays reachable after a half-torn-down connection");
  assert.deepEqual(avatarControls("error"), { showMic: false, showEnd: true });
  assert.deepEqual(avatarControls("disconnecting"), { showMic: false, showEnd: false });
});

test("practice-mode lock: avatar is active while connecting or live, not before or after", () => {
  assert.equal(isAvatarSessionActive("connecting"), true);
  assert.equal(isAvatarSessionActive("live"), true);
  for (const phase of ["idle", "ended", "error"]) assert.equal(isAvatarSessionActive(phase), false);
});

test("wiring: the lesson player locks the switch for voice OR cartoon, and for avatar only before it has a live session id", () => {
  const player = read("components/student/player/PlayerMain.tsx");
  // Stage 3: a live Avatar session (one with a reported session id) no longer locks the switch - that is exactly
  // what lets the student tap "Cartoon" to trigger the handoff, instead of only switching once Avatar has ended.
  assert.match(player, /locked=\{voiceActive \|\| cartoonActive \|\| \(avatarActive && !avatarSessionId\) \|\| handoffPending\}/);
  assert.match(player, /onActiveChange=\{setAvatarActive\}/);
  assert.match(player, /onActiveChange=\{setCartoonActive\}/);
  assert.match(player, /onActiveChange=\{setVoiceActive\}/, "Voice Practice's wiring is kept even though it's no longer a primary switch choice");
  assert.match(player, /onSessionReady=\{setAvatarSessionId\}/, "MariamSession reports its own session id for the handoff");
  assert.match(read("components/student/player/MariamSession.tsx"), /onActiveChange\?\.\(false\)/, "reports inactive on unmount");
});

test("wiring: Avatar -> Cartoon handoff calls the backend's generic handoff route, not a cold Cartoon start", () => {
  const player = read("components/student/player/PlayerMain.tsx");
  assert.match(player, /practice === "avatar" && next === "cartoon" && avatarActive && avatarSessionId/, "only intercepted for an ACTIVE avatar session with a known id");
  assert.match(player, /const targetSessionId = overrideSessionId \?\? avatarSessionId/, "uses the live Avatar id or the recovery override");
  assert.match(player, /sessionsApi\.handoff\(targetSessionId\)/, "calls the handoff endpoint with the selected live Avatar id");
  assert.match(player, /setCartoonHandoffStart\(started\)/, "the session the handoff created is handed to CartoonSession, never re-started cold");
  assert.match(player, /setPractice\("cartoon"\)/, "only switches the mounted component AFTER the handoff call resolves");
  // Failure: a recoverable, visible error - never a silent fallback to a cold restart.
  assert.match(player, /setHandoffError\(/);
  assert.match(player, /handoffError && \(/, "the error is actually rendered, not just stored");
});

test("wiring: a cold Cartoon mount (not from a handoff) still starts normally, and the handoff session is consumed at most once", () => {
  const cartoon = read("components/student/player/CartoonSession.tsx");
  assert.match(cartoon, /handoffStart\?: SessionStartResponse \| null/);
  assert.match(cartoon, /startFromHandoff\(handoffStart\)/);
  assert.match(cartoon, /consumedHandoffRef\.current = true/, "consumed exactly once, never re-joined on a later render");
  assert.match(cartoon, /onHandoffConsumed\?\.\(\)/);
});

test("wiring: the Only Voice toggle is pure presentation state - it never calls the handoff/session APIs", () => {
  const cartoon = read("components/student/player/CartoonSession.tsx");
  const toggleLine = cartoon.split("\n").find(line => line.includes("setOnlyVoice"));
  assert.ok(toggleLine, "the Only Voice toggle exists");
  assert.ok(!/sessionsApi|startFromHandoff\(/.test(toggleLine), "toggling Only Voice touches no session API");
  assert.doesNotMatch(read("components/student/player/CartoonCharacterPanel.tsx"), /sessionsApi/, "the character panel (Only Voice lives here) never calls the API directly");
});

test("wiring: Cartoon Practice reuses useVoicePractice (same pipeline) and renders the unmodified VoiceCallView underneath", () => {
  const cartoon = read("components/student/player/CartoonSession.tsx");
  assert.match(cartoon, /useVoicePractice\(topicId, messages, enrollmentId\)/, "no second AI pipeline - same hook as Voice Practice");
  assert.match(cartoon, /<VoiceCallView/, "falls back to the exact existing call screen, not a fork of it");
  assert.match(cartoon, /room\?\.toggleMicrophone\(\)/);
  assert.match(cartoon, /onEnd=\{end\}/);
  const panel = read("components/student/player/CartoonCharacterPanel.tsx");
  assert.match(panel, /deriveCartoonCharacterView/, "character pose comes from the real session state, not an invented timer");
});

test("scope: Avatar session logic, the mic gate and Voice session logic are untouched by the UI pass", () => {
  assert.ok(!/ActiveSpeakersChanged|createMicGate/.test(read("components/student/player/MariamSession.tsx")), "no gate logic in the component");
  const voice = read("components/student/player/VoiceSession.tsx");
  assert.match(voice, /useVoicePractice\(topicId, messages, enrollmentId\)/);
  assert.match(voice, /room\?\.toggleMicrophone\(\)/);
  assert.match(voice, /onEnd=\{end\}/);
  assert.match(read("components/student/player/VoiceCallView.tsx"), /onClick=\{onEnd\}/);
});

test("mobile guards: no fixed-pixel avatar floor, dvh with fallback, Course Content is a sheet below xl", () => {
  assert.ok(!/minHeight: 280/.test(read("components/student/player/MariamSession.tsx")));
  const css = read("app/globals.css");
  assert.match(css, /\.avatar-stage-spacer/);
  assert.match(css, /46dvh/);
  assert.match(css, /max-height: min\(46vh, 26rem\);\s*max-height: min\(46dvh, 26rem\)/, "dvh has a vh fallback");
  const cc = read("components/student/player/CourseContent.tsx");
  assert.match(cc, /xl:hidden/);
  assert.match(cc, /sheet-dialog/);
  assert.match(cc, /hidden[^"]*xl:block/);
});

test("short/landscape screens cap the avatar, voice card and transcript; RTL back arrow flips", () => {
  const css = read("app/globals.css");
  assert.match(css, /@media \(max-height: 520px\) and \(orientation: landscape\)/);
  assert.match(css, /\.voice-call-card/);
  assert.match(read("components/student/player/VoiceCallView.tsx"), /voice-call-card/);
  assert.match(read("app/student/lessons/[topicId]/page.tsx"), /rtl:rotate-180/, "back arrow points the reading direction's way");
});

test("a half-torn-down avatar session never leaves the student stuck (End stays, the mode lock releases)", () => {
  assert.equal(avatarControls("idle").showEnd, true);
  assert.match(read("components/student/player/MariamSession.tsx"), /avatar\.status !== "idle"/, "lock releases once the avatar is idle again");
});

test("i18n: every new string exists in English and Arabic", () => {
  const keys = [
    "modeAvatarShort", "modeVoiceShort", "modeCartoon", "modeCartoonShort", "modeCartoonDesc",
    "statusMariamSpeaking", "statusMicMuted", "tutorName", "courseContentCount", "mariamSpeakingMicPaused", "yourTurn",
    "cartoonHandoffError",
  ];
  for (const file of ["lib/i18n/messages/en.ts", "lib/i18n/messages/ar.ts"]) {
    const src = read(file);
    for (const key of keys) assert.match(src, new RegExp(`${key}:`), `${file} is missing ${key}`);
  }
  for (const file of ["lib/i18n/messages/en.ts", "lib/i18n/messages/ar.ts"]) {
    const src = read(file);
    assert.match(src, /cartoonSession:/, `${file} is missing the cartoonSession block`);
    assert.match(src, /onlyVoiceToggle:/, `${file} is missing onlyVoiceToggle`);
  }
});

test("practice mode switch: Cartoon Practice is listed before Avatar Practice, Voice is no longer a primary choice, and the default mode is unchanged", () => {
  const switchSrc = read("components/student/player/PracticeModeSwitch.tsx");
  const cartoonAt = switchSrc.indexOf('key: "cartoon"');
  const avatarAt = switchSrc.indexOf('key: "avatar"');
  assert.ok(cartoonAt > -1 && avatarAt > -1, "both primary modes are offered");
  assert.ok(cartoonAt < avatarAt, "Cartoon Practice is shown first");
  assert.ok(!switchSrc.includes('key: "voice"'), "Voice Practice is not one of the switch's own options");
  // Display order only: the initial selection lives in PlayerMain and still starts on Avatar Practice.
  assert.match(read("components/student/player/PlayerMain.tsx"), /useState<PracticeChoice>\("avatar"\)/);
});

test("Voice Practice stays fully intact: its own hook/component are untouched and its mode/routes still work if selected", () => {
  const hook = read("lib/voice/useVoicePractice.ts");
  assert.match(hook, /sessionsApi\.start\(topicId, "voice_practice", enrollmentId\)/);
  const voice = read("components/student/player/VoiceSession.tsx");
  assert.match(voice, /useVoicePractice\(topicId, messages, enrollmentId\)/);
  const player = read("components/student/player/PlayerMain.tsx");
  assert.match(player, /<VoiceSession topicId=\{topic\.id\} enrollmentId=\{enrollmentId\} watched=\{watched\} onActiveChange=\{setVoiceActive\} \/>/, "still reachable by code path, just not offered by the switch");
});
