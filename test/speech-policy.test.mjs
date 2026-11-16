import test from "node:test";
import assert from "node:assert/strict";
import { quietForResults } from "../public/assets/speech-policy.js";
import { Race } from "../src/game.mjs";
import { interactionSpeech } from "../public/assets/reward-text.js";
const state = () => ({
  phase: "racing",
  awaitingAwards: false,
  racers: [{ progress: 100, speed: 64 }],
  config: { laps: 5, trackLength: 2400, autoNext: true },
  quiz: { phase: "question", deadline: 21000 },
});
test("supplemental speech pauses for the last five seconds and result reveal", () => {
  const g = state();
  assert.equal(quietForResults(g, 15999), false);
  assert.equal(quietForResults(g, 16000), true);
  g.quiz.phase = "reveal";
  assert.equal(quietForResults(g, 1000), true);
});
test("speech pauses near the finish, during grace and just before the next round", () => {
  const g = state();
  g.racers[0].progress = 11900;
  assert.equal(quietForResults(g, 1000), true);
  g.racers[0].progress = 100;
  g.awaitingAwards = true;
  assert.equal(quietForResults(g, 1000), true);
  g.awaitingAwards = false;
  g.quiz = null;
  g.phase = "finished";
  g.phaseDeadline = 31000;
  assert.equal(quietForResults(g, 27000), false);
  assert.equal(quietForResults(g, 28000), true);
  g.config.autoNext = false;
  assert.equal(quietForResults(g, 30000), false);
});
test("only real comments generate throttled readable events; answer processing still works for bots", () => {
  let now = 1000;
  const r = new Race({ now: () => now });
  r.comment({ id: "real", name: "An" }, "Xin chào", "a");
  r.comment({ id: "real" }, "Lên xe", "b");
  r.comment({ id: "bot", demo: true }, "A", "c");
  assert.equal(r.events.filter((e) => e.type === "comment").length, 1);
  now += 10000;
  r.comment({ id: "real" }, "B", "d");
  const event = r.events.filter((e) => e.type === "comment").at(-1);
  assert.equal(event.answer, true);
  assert.equal(interactionSpeech(event), "An chọn đáp án B.");
});
test("a real commenter gets a slot before bots when the track is full, without removing real players", () => {
  const r = new Race();
  for (let i = 0; i < 100; i++) r.join({ id: String(i), demo: i < 10 });
  r.comment({ id: "new", name: "Khách thật" }, "Xin chào");
  assert.equal(r.users.size, 100);
  assert.ok(r.users.has("new"));
  for (let i = 10; i < 100; i++) assert.ok(r.users.has(String(i)));
  assert.equal([...r.users.values()].filter((p) => p.demo).length, 9);
});

test("new joins preserve a finished bot in the podium places instead of changing the result", () => {
  const r = new Race();
  r.config.capacity = 2;
  r.join({ id: "winner", demo: true });
  r.join({ id: "real" });
  r.users.get("winner").finishedAt = 1000;
  r.users.get("winner").progress = 12000;
  r.firstFinisherAt = 1000;
  assert.equal(r.join({ id: "new" }), null);
  assert.ok(r.users.has("winner"));
  assert.ok(r.users.has("real"));
});
