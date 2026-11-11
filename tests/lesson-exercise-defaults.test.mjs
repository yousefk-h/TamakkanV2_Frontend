import assert from "node:assert/strict";
import { test } from "node:test";

const { withExerciseDefaults } = await import(new URL("../lib/topics/helpers.ts", import.meta.url).href);

// Regression for the Lesson Builder crash after Slice 5 (4cafce0): a reading/
// multiple_choice exercise authored before `ordering_words`/`accepted_answers`/
// `dialogue_turns`/`pairs` existed arrives from the API (or from an AI
// suggestion for a different kind) without those keys at all, not merely
// with empty arrays - `item.ordering_words.length` then threw
// "item.ordering_words is undefined" in Step4ExercisesSchedule.tsx.

test("a legacy exercise missing every newer list field is backfilled with empty arrays, not undefined", () => {
  const legacy = {
    kind: "reading", prompt: "Read the passage", options: [], correct_option: null,
    explanation: "", content: "Once upon a time...", arabic_note: "", media_url: "", audio_url: "",
    allow_resubmit: true, deadline_at: null,
    // pairs/ordering_words/accepted_answers/dialogue_turns/min_words intentionally absent, as a pre-Slice-5 document would be
  };
  const fixed = withExerciseDefaults(legacy);
  assert.deepEqual(fixed.pairs, []);
  assert.deepEqual(fixed.ordering_words, []);
  assert.deepEqual(fixed.accepted_answers, []);
  assert.deepEqual(fixed.dialogue_turns, []);
  assert.doesNotThrow(() => fixed.ordering_words.length);
  assert.doesNotThrow(() => fixed.pairs.length);
});

test("a mixed list of legacy and new-kind exercises all normalize safely", () => {
  const mixed = [
    { kind: "multiple_choice", prompt: "p1", options: ["a", "b"], correct_option: 0, explanation: "", content: "", arabic_note: "", media_url: "", audio_url: "", allow_resubmit: true, deadline_at: null },
    { kind: "game", prompt: "p2", options: [], correct_option: null, explanation: "", content: "", arabic_note: "", media_url: "", audio_url: "", pairs: [{ left: "hi", right: "hello" }], allow_resubmit: true, deadline_at: null },
    { kind: "word_order", prompt: "p3", options: [], correct_option: null, explanation: "", content: "", arabic_note: "", media_url: "", audio_url: "", allow_resubmit: true, deadline_at: null }, // incomplete draft: no ordering_words yet
    { kind: "dialogue_completion", prompt: "p4", options: [], correct_option: null, explanation: "", content: "", arabic_note: "", media_url: "", audio_url: "", dialogue_turns: [{ speaker: "A", text: "Hi", is_blank: false }, { speaker: "B", is_blank: true }], allow_resubmit: true, deadline_at: null },
  ];
  const fixed = mixed.map(withExerciseDefaults);
  for (const exercise of fixed) {
    assert.ok(Array.isArray(exercise.options));
    assert.ok(Array.isArray(exercise.pairs));
    assert.ok(Array.isArray(exercise.ordering_words));
    assert.ok(Array.isArray(exercise.accepted_answers));
    assert.ok(Array.isArray(exercise.dialogue_turns));
  }
  // A dialogue turn itself can also be missing accepted_answers (e.g. a teacher
  // hasn't ticked "is blank" yet, or an older partial draft) - must not crash either.
  assert.deepEqual(fixed[3].dialogue_turns[1].accepted_answers, []);
});

test("a brand-new word_order draft (freshly switched from another kind) never has undefined ordering_words", () => {
  // Mirrors what a teacher sees immediately after switching an existing
  // exercise card's kind in the palette, before any word is typed in.
  const incompleteDraft = { kind: "word_order", prompt: "", options: [], correct_option: null, explanation: "", content: "", arabic_note: "", media_url: "", audio_url: "", allow_resubmit: true, deadline_at: null };
  const fixed = withExerciseDefaults(incompleteDraft);
  assert.deepEqual(fixed.ordering_words, []);
  assert.doesNotThrow(() => fixed.ordering_words.map(word => word));
});

test("an AI suggestion for one kind never carries undefined fields that belong to a different kind", () => {
  // Simulates a batch of AI-drafted "error_correction" suggestions: the
  // provider output only fills what its own prompt asked for, so
  // ordering_words/pairs/dialogue_turns may be entirely absent on the raw object.
  const suggestion = {
    kind: "error_correction", prompt: "Fix the sentence", options: [], correct_option: null,
    explanation: "Past tense", content: "She go to school yesterday.", arabic_note: "", media_url: "", audio_url: "",
    accepted_answers: ["She went to school yesterday."], allow_resubmit: true, deadline_at: null,
  };
  const fixed = withExerciseDefaults(suggestion);
  assert.deepEqual(fixed.ordering_words, []);
  assert.deepEqual(fixed.pairs, []);
  assert.deepEqual(fixed.dialogue_turns, []);
  assert.deepEqual(fixed.accepted_answers, ["She went to school yesterday."]);
});
