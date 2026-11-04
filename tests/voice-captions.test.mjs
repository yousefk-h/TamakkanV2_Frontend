// Voice Practice focused-conversation UI: the caption selector (lib/voice/captions.ts) and source-level guards for
// the transcript trust model, accessibility and mobile wiring. No browser, no network, no paid session.
//
// Run with: npm run test:voice
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { selectCaptionView, RECENT_TURNS } = await import(new URL("../lib/voice/captions.ts", import.meta.url).href);
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

let n = 0;
const seg = (speaker, text, final = true, id = `s${++n}`) => ({ id, speaker, text, final, firstSeen: n });

test("no segments -> no caption and no context", () => {
  assert.deepEqual(selectCaptionView([]), { current: null, recent: [] });
  assert.deepEqual(selectCaptionView([seg("agent", "   ")]), { current: null, recent: [] }, "blank text is not a caption");
});

test("the latest utterance is the current caption, whoever said it", () => {
  const a = seg("agent", "What do you usually do on weekends?");
  assert.equal(selectCaptionView([a]).current, a);
  const b = seg("student", "I usually");
  const view = selectCaptionView([a, b]);
  assert.equal(view.current, b);
  assert.equal(view.current.final, false === b.final ? false : true, "the final flag of the real segment is preserved, never invented");
});

test("an interim student hypothesis is shown as itself (not final); only real segments are ever selected", () => {
  const a = seg("agent", "Tell me about your day.");
  const interim = seg("student", "I wake up at", false);
  const view = selectCaptionView([a, interim]);
  assert.equal(view.current.final, false);
  assert.equal(view.current.text, "I wake up at");
  // nothing is synthesised: every returned text comes from an input segment
  const inputs = new Set([a.text, interim.text]);
  for (const turn of view.recent) assert.ok(inputs.has(turn.text));
});

test("recent context is exactly the previous 2 turns, oldest first, and never repeats the current line", () => {
  assert.equal(RECENT_TURNS, 2);
  const s = [seg("agent", "Q1"), seg("student", "A1"), seg("agent", "Q2"), seg("student", "A2"), seg("agent", "Q3")];
  const view = selectCaptionView(s);
  assert.equal(view.current.text, "Q3");
  assert.deepEqual(view.recent.map(t => t.text), ["Q2", "A2"]);
  assert.ok(!view.recent.some(t => t.text === view.current.text), "current line not duplicated");
  assert.deepEqual(view.recent.map(t => t.speaker), ["agent", "student"]);
});

test("fewer than 2 earlier turns -> only what exists", () => {
  const s = [seg("agent", "Hello!"), seg("student", "Hi")];
  assert.deepEqual(selectCaptionView(s).recent.map(t => t.text), ["Hello!"]);
  assert.deepEqual(selectCaptionView([seg("agent", "Only line")]).recent, []);
});

test("consecutive segments by the same speaker are ONE earlier turn, and the current segment is never merged into it", () => {
  const s = [seg("agent", "Q1"), seg("student", "I like"), seg("student", "football"), seg("agent", "Nice!"), seg("student", "Thanks")];
  const view = selectCaptionView(s);
  assert.equal(view.current.text, "Thanks");
  assert.deepEqual(view.recent.map(t => t.text), ["I like football", "Nice!"]);
  // a second student segment right after the current one does not pull the earlier one into the current line
  const s2 = [seg("agent", "Q"), seg("student", "First part"), seg("student", "second part")];
  const v2 = selectCaptionView(s2);
  assert.equal(v2.current.text, "second part");
  assert.deepEqual(v2.recent.map(t => t.text), ["Q", "First part"]);
});

test("the selector is pure: it neither mutates its input nor reads or writes any transcript store", () => {
  const s = [seg("agent", "A"), seg("student", "B"), seg("agent", "C")];
  const snapshot = JSON.stringify(s);
  selectCaptionView(s);
  assert.equal(JSON.stringify(s), snapshot);
  const src = read("lib/voice/captions.ts");
  assert.ok(!/fetch\(|localStorage|sessionStorage|browser_transcript|transcript_history|finalTurns|sessionsApi/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
});

test("trust model is untouched: the collector and the end payload code did not change shape", () => {
  const collector = read("lib/voice/transcript.ts");
  assert.match(collector, /finalTurns\(\): TranscriptTurn\[\]/);
  assert.match(collector, /if \(!segment\.final\) continue;/, "only FINAL segments ever become turns");
  const room = read("lib/voice/voiceRoom.ts");
  assert.match(room, /finalTranscript\(\)/);
  for (const file of ["components/student/player/VoiceSession.tsx", "components/student/player/VoiceCallView.tsx", "components/student/player/VoiceConversation.tsx", "lib/voice/captions.ts"]) {
    const src = read(file);
    assert.ok(!/transcript_history|sessionsApi|fetch\(/.test(src), `${file} must not send or store transcript data`);
  }
  assert.ok(!/transcript_history/.test(read("lib/voice/useVoicePractice.ts")), "Voice never writes the trusted transcript field");
});

test("accessibility: only the current caption/status are live regions; the full conversation is not", () => {
  const voice = read("components/student/player/VoiceCallView.tsx");
  const conv = read("components/student/player/VoiceConversation.tsx");
  const code = conv.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal((code.match(/aria-live=/g) ?? []).length, 1, "exactly one live region in the conversation components");
  assert.match(conv, /aria-live="polite"[^>]*aria-busy=\{current \? !current\.final : false\}/, "caption waits for a finished line");
  assert.ok(/CurrentCaption/.test(voice));
  // the sheet holds history: no live region, non-modal dialog, Escape closes, focus returns
  const sheet = conv.slice(conv.indexOf("export function ConversationSheet"));
  assert.ok(!/aria-live/.test(sheet), "history is never announced again");
  assert.match(sheet, /role="dialog" aria-modal="false"/);
  assert.match(sheet, /event\.key === "Escape"/);
  assert.match(sheet, /returnTo\?\.focus\(/);
  // the old full-transcript region with aria-live is gone from the call page
  assert.ok(!/transcript-scroll/.test(voice) && !/aria-live="polite">\s*\{segments/.test(voice));
});

test("the call page shows caption + recent context, and opens the full conversation from a button", () => {
  const voice = read("components/student/player/VoiceCallView.tsx");
  assert.match(voice, /selectCaptionView\(segments\)/);
  assert.match(voice, /<RecentContext recent=\{captionView\.recent\}/);
  assert.match(voice, /t\("voiceSession\.conversationButton"\)/);
  assert.match(voice, /aria-haspopup="dialog"/);
  assert.match(voice, /<ConversationSheet segments=\{segments\}/);
  assert.match(voice, /setSheetOpen\(false\);[^\n]*\n\s*onStart\(\)/, "a new call never inherits an open sheet");
  // controls are NOT inside the sheet
  const sheetStart = voice.indexOf("<ConversationSheet");
  assert.ok(voice.indexOf("voiceSession.endCall") < sheetStart && voice.indexOf("voiceSession.muteMic") < sheetStart);
});

test("mobile: the sheet is non-modal (controls stay usable), safe-area aware, scrolls on its own, and controls are scrolled clear of it", () => {
  const css = read("app/globals.css");
  const sheet = css.slice(css.indexOf(".conversation-sheet {"));
  assert.match(sheet, /position: fixed/);
  assert.match(sheet, /env\(safe-area-inset-bottom/);
  assert.match(sheet, /max-height: min\(46vh, 26rem\);\s*max-height: min\(46dvh, 26rem\)/, "dvh with a vh fallback");
  assert.match(css, /\.caption-window \{[^}]*overflow: hidden/);
  const conv = read("components/student/player/VoiceConversation.tsx");
  assert.match(conv, /overflow-y-auto overscroll-contain/, "the history scrolls independently");
  const voice = read("components/student/player/VoiceCallView.tsx");
  assert.match(voice, /matchMedia\("\(max-width: 639px\)"\)/);
  assert.match(voice, /max-sm:pb-\[46dvh\]/);
  assert.ok(!/showModal|<Dialog/.test(conv), "the conversation sheet is not a modal dialog");
});

test("i18n: every new Voice string exists in English and Arabic", () => {
  for (const file of ["lib/i18n/messages/en.ts", "lib/i18n/messages/ar.ts"]) {
    const src = read(file);
    for (const key of ["captionEmpty", "recentLabel", "conversationButton", "conversationTitle", "transcriptNote", "speakerYou", "speakerTutor", "tutorName"]) {
      assert.match(src, new RegExp(`${key}:`), `${file} is missing ${key}`);
    }
  }
});

test("Avatar code is untouched by the Voice UI change", () => {
  for (const file of ["components/student/player/VoiceSession.tsx", "components/student/player/VoiceCallView.tsx", "components/student/player/VoiceConversation.tsx", "lib/voice/captions.ts"]) {
    assert.ok(!/from ["'][^"']*(spatialreal|MariamSession)[^"']*["']|micGate/.test(read(file)), `${file} must not depend on Avatar code`);
  }
});
