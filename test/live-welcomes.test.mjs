import test from "node:test";
import assert from "node:assert/strict";
import { LiveWelcomes } from "../src/live-welcomes.mjs";
import { QUESTIONS } from "../src/game.mjs";
import { answerSpeech } from "../public/assets/reward-text.js";
import { ceremonyView } from "../public/assets/camera-director.js";
const user = (id) => ({ id, name: id });
test("initial connection history, stale timestamps and future-dated arrivals are ignored", () => {
  let now = 1700000000000;
  const w = new LiveWelcomes({ now: () => now });
  assert.equal(w.offer(user("a")), false);
  w.connected();
  now += 4999;
  assert.equal(w.offer(user("a")), false);
  now += 1001;
  assert.equal(
    w.offer(user("old"), { common: { createTime: (now - 10000) / 1000 } }),
    false,
  );
  assert.equal(w.offer(user("future"), { createTime: now + 6000 }), false);
  assert.equal(w.offer(user("fresh"), { createTime: now }), true);
});
test("only the three latest arrivals survive a burst, duplicates and delayed batches are discarded", () => {
  let now = 1700000000000;
  const w = new LiveWelcomes({ now: () => now });
  w.connected();
  now += 6000;
  for (let i = 0; i < 5; i++) w.offer(user(String(i)));
  assert.equal(w.offer(user("4")), false);
  now += 1500;
  assert.deepEqual(
    w.take().map((x) => x.user.id),
    ["2", "3", "4"],
  );
  w.offer(user("late"));
  now += 6000;
  assert.deepEqual(w.take(), []);
});
test("reconnecting clears pending arrivals and starts a new history guard", () => {
  let now = 1700000000000;
  const w = new LiveWelcomes({ now: () => now });
  w.connected();
  now += 6000;
  w.offer(user("a"));
  w.reset();
  assert.deepEqual(w.take(), []);
  w.connected();
  now += 6000;
  assert.equal(w.offer(user("a"), { createTime: now - 7000 }), false);
  assert.equal(w.offer(user("b"), { createTime: now }), true);
});
test("question bank interleaves easy, medium and hard questions with complete metadata", () => {
  assert.equal(QUESTIONS.length, 144);
  for (const difficulty of ["easy", "medium", "hard"])
    assert.equal(
      QUESTIONS.filter((q) => q.difficulty === difficulty).length,
      48,
    );
  assert.ok(QUESTIONS.every((q) => q.topic && q.explanation));
  for (let i = 0; i < 144; i += 3)
    assert.deepEqual(
      QUESTIONS.slice(i, i + 3).map((q) => q.difficulty),
      ["easy", "medium", "hard"],
    );
});
test("result speech is just the answer letter, regardless of prompt or explanation", () => {
  for (let answer = 0; answer < 4; answer++)
    assert.equal(
      answerSpeech({
        answer,
        prompt: "Dài",
        options: ["Một", "Hai", "Ba", "Bốn"],
        explanation: "Không đọc lại",
      }),
      `Đáp án ${"ABCD"[answer]}.`,
    );
});
test("ceremony begins with the podium then switches to a panorama after eight seconds", () => {
  const g = { phase: "finished", phaseDeadline: 31000 };
  assert.equal(ceremonyView(g, 1000).panorama, false);
  assert.equal(ceremonyView(g, 8999).panorama, false);
  assert.equal(ceremonyView(g, 9000).panorama, true);
  g.phase = "paused";
  g.pausedPhase = "finished";
  assert.equal(ceremonyView(g, 9000).panorama, true);
  g.phase = "racing";
  assert.equal(ceremonyView(g, 31000).active, false);
});
