// WhatsApp-style Messages redesign - same source-text-assertion convention as
// the rest of this test suite (no React-rendering harness here): pins real
// wiring (actual API calls, no fabricated capabilities) rather than mounting
// the component tree.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const workspace = fs.readFileSync(new URL("../components/messaging/MessagingWorkspace.tsx", import.meta.url), "utf8");
const header = fs.readFileSync(new URL("../components/messaging/ChatHeader.tsx", import.meta.url), "utf8");
const composer = fs.readFileSync(new URL("../components/messaging/MessageComposer.tsx", import.meta.url), "utf8");
const bubble = fs.readFileSync(new URL("../components/messaging/MessageBubble.tsx", import.meta.url), "utf8");
const recorder = fs.readFileSync(new URL("../components/messaging/VoiceRecorder.tsx", import.meta.url), "utf8");
const player = fs.readFileSync(new URL("../components/messaging/VoiceMessagePlayer.tsx", import.meta.url), "utf8");
const list = fs.readFileSync(new URL("../components/messaging/ConversationList.tsx", import.meta.url), "utf8");
const messageList = fs.readFileSync(new URL("../components/messaging/MessageList.tsx", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../lib/api/client.ts", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../lib/api/types.ts", import.meta.url), "utf8");

test("no call/video buttons and no fake online/presence status anywhere in the chat UI", () => {
  assert.doesNotMatch(header, /Phone|Video|phone-call|video-call/);
  assert.doesNotMatch(header, /Online now/i);
  assert.doesNotMatch(workspace, /Online now/i);
  assert.doesNotMatch(list, /Online now/i);
});

test("ChatHeader never shows a read-receipt/delivery-receipt indicator that isn't backed by real data", () => {
  assert.doesNotMatch(header, /CheckCheck|double.?check|delivered|seen at/i);
});

test("image attachments are real uploads through the real API client, never a hardcoded/simulated send", () => {
  assert.match(client, /sendImage: \(conversationId: string, file: File \| Blob\)/);
  assert.match(client, /messages\/conversations\/\$\{conversationId\}\/image/);
  assert.match(workspace, /messagesApi\.sendImage\(selected\.id, file\)/);
  assert.match(composer, /accept="image\/\*"/);
});

test("voice messages use a real getUserMedia/MediaRecorder flow, never a simulated recording or fake playback", () => {
  assert.match(recorder, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(recorder, /new MediaRecorder\(/);
  assert.match(recorder, /MediaRecorder\.isTypeSupported/);
  assert.doesNotMatch(recorder, /setTimeout.*blob|fake.*record/i);
  assert.match(client, /sendVoice: \(conversationId: string, blob: Blob, filename: string\)/);
  assert.match(workspace, /messagesApi\.sendVoice\(selected\.id, blob,/);
  // Real audio playback - an actual <audio> element, not a progress-bar animation standing in for one.
  assert.match(player, /<audio\s/);
  assert.match(player, /audio\.play\(\)/);
});

test("the voice recorder picks a browser-supported mime type with a graceful unsupported-browser message, never pretending to record", () => {
  assert.match(recorder, /MIME_CANDIDATES = \[/);
  assert.match(recorder, /audio\/webm/);
  assert.match(recorder, /audio\/mp4/);
  assert.match(recorder, /not supported in this browser/);
  assert.match(recorder, /Microphone access was denied/);
});

test("media URLs are never cached/reused - each render asks the server for a freshly-signed one via the real message object", () => {
  assert.match(types, /media_url: string \| null/);
  assert.match(types, /freshly signed delivery URL/);
  assert.doesNotMatch(workspace, /localStorage.*media_url|sessionStorage.*media_url/i);
});

test("sender identity is never client-supplied - every send call lets the server derive the sender from the authenticated session", () => {
  assert.doesNotMatch(client, /sendImage:.*sender/i);
  assert.doesNotMatch(client, /sendVoice:.*sender/i);
  assert.doesNotMatch(client, /reply:.*sender/i);
});

test("a student cannot be routed to message an arbitrary user id by construction - new-conversation composing stays teacher/admin only", () => {
  assert.match(workspace, /canCompose \? \(/);
  assert.match(workspace, /showNewMessage && canCompose/);
  assert.match(workspace, /showAnnouncement && canCompose/);
});

test("optimistic sends get a real pending/failed/retry lifecycle, never silently disappearing on failure", () => {
  assert.match(workspace, /_pending: true, _localId: localId/);
  assert.match(workspace, /failPending/);
  assert.match(workspace, /retryHandlers\.current\.set\(localId, attempt\)/);
  assert.match(bubble, /_failed/);
  assert.match(bubble, /onRetry/);
});

test("the message list preserves scroll position on pagination and only auto-scrolls to the bottom when the viewer is already there", () => {
  assert.match(messageList, /stickToBottom/);
  assert.match(messageList, /el\.scrollTop \+= el\.scrollHeight - prevScrollHeightRef\.current/);
  assert.match(messageList, /hasMore && !loadingOlder/);
});

test("conversation search filters the real loaded list, not a hardcoded demo list", () => {
  assert.match(list, /other_participant_name/);
  assert.match(workspace, /onQueryChange=\{setQuery\}/);
});

test("mobile shows the conversation list or the full-screen chat, never both at once, with a working back action", () => {
  assert.match(workspace, /selected \? "hidden sm:flex" : "flex"/);
  assert.match(workspace, /selected \? "flex" : "hidden sm:flex"/);
  assert.match(workspace, /onBack=\{\(\) => setSelected\(null\)\}/);
  assert.match(header, /onClick=\{onBack\}/);
});

test("this app's own smallest real-time mechanism (polling) is used, not a new infra dependency", () => {
  assert.match(workspace, /setInterval\(/);
  assert.doesNotMatch(workspace, /redis|socket\.io|WebSocket\(/i);
  assert.match(workspace, /document\.visibilityState === "visible"/);
});
