import test from "node:test";
import assert from "node:assert/strict";
import { Race, QUESTIONS } from "../src/game.mjs";
function fixture(count = 2) {
  let now = 1000;
  const r = new Race({ now: () => now });
  r.config.laps = 1;
  r.config.trackLength = 1000;
  for (let i = 0; i < count; i++)
    r.join({ id: String(i), name: "Tay đua " + i });
  r.start();
  now += 5000;
  r.tick();
  return {
    r,
    advance(ms) {
      now += ms;
      r.tick();
    },
    finish() {
      r.users.get("0").progress = 999;
      now += 100;
      r.tick();
    },
  };
}
test("first finish closes the question and prevents automatic/manual questions and late answer rewards", () => {
  const f = fixture(),
    r = f.r;
  f.advance(500);
  r.comment({ id: "0" }, "ABCD"[QUESTIONS[0].answer]);
  f.finish();
  assert.equal(r.snapshot().awaitingAwards, true);
  assert.equal(r.snapshot().quiz, null);
  assert.equal(r.quizPhase, "closed");
  assert.equal(r.users.get("0").timedCorrect, 1);
  const index = r.quizIndex,
    xp = r.users.get("1").xp;
  r.nextQuiz();
  assert.equal(r.quizIndex, index);
  assert.equal(
    r.comment({ id: "1" }, "ABCD"[QUESTIONS[0].answer]).reason,
    "closed",
  );
  assert.equal(r.users.get("1").xp, xp);
  f.advance(14999);
  assert.equal(r.phase, "racing");
  assert.equal(r.snapshot().quiz, null);
  f.advance(1);
  assert.equal(r.phase, "finished");
  assert.equal(r.phaseDeadline - r.now(), 30000);
});
test("award screen lasts exactly thirty seconds then launches immediately with the same drivers and XP", () => {
  const f = fixture(1),
    r = f.r;
  r.like({ id: "0" }, 2000);
  const xp = r.users.get("0").xp;
  f.finish();
  assert.equal(r.phase, "finished");
  const round = r.round;
  f.advance(29999);
  assert.equal(r.phase, "finished");
  f.advance(1);
  assert.equal(r.phase, "racing");
  assert.equal(r.round, round + 1);
  assert.equal(r.users.size, 1);
  assert.equal(r.users.get("0").xp, xp);
  assert.ok(r.snapshot().quiz);
  assert.equal(r.snapshot().awaitingAwards, false);
  assert.equal(r.raceStartedAt, r.now());
});
test("pausing the grace period freezes the remaining finish time", () => {
  const f = fixture(),
    r = f.r;
  f.finish();
  f.advance(1000);
  r.pause();
  const before = r.snapshot().awardsDeadline - r.snapshot().effectiveTime;
  f.advance(60000);
  assert.equal(
    r.snapshot().awardsDeadline - r.snapshot().effectiveTime,
    before,
  );
  r.pause();
  assert.equal(r.snapshot().awardsDeadline - r.now(), before);
  f.advance(before - 1);
  assert.equal(r.phase, "racing");
  f.advance(1);
  assert.equal(r.phase, "finished");
});
test("pausing awards freezes the thirty-second clock, and disabling auto-next keeps the ceremony", () => {
  const f = fixture(1),
    r = f.r;
  f.finish();
  f.advance(10000);
  r.pause();
  const remaining = r.phaseDeadline - r.snapshot().effectiveTime;
  f.advance(60000);
  assert.equal(r.phaseDeadline - r.snapshot().effectiveTime, remaining);
  r.pause();
  assert.equal(r.phaseDeadline - r.now(), 20000);
  r.configure({ autoNext: false });
  f.advance(30000);
  assert.equal(r.phase, "finished");
  r.configure({ autoNext: true });
  f.advance(1);
  assert.equal(r.phase, "racing");
});

test("a finish coinciding with the reveal deadline never opens an extra question", () => {
  const f = fixture(),
    r = f.r;
  r.finishQuiz();
  r.quizDeadline = r.now() + 100;
  const index = r.quizIndex,
    scored = r.completedQuizzes;
  f.finish();
  assert.equal(r.quizIndex, index);
  assert.equal(r.completedQuizzes, scored);
  assert.equal(r.snapshot().quiz, null);
});
