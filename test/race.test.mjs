import test from "node:test";
import assert from "node:assert/strict";
import { Race, QUESTIONS } from "../src/game.mjs";
import { Bots } from "../src/bots.mjs";
const p = (id) => ({ id: String(id), name: "Tay đua " + id });
function setup() {
  let now = 1000;
  const r = new Race({ now: () => now, random: () => 0.5 });
  return {
    r,
    advance(ms) {
      now += ms;
    },
    tick(ms = 100) {
      now += ms;
      r.tick();
    },
    go() {
      r.start();
      now += 5000;
      r.tick();
    },
  };
}
test("144 unique questions have four options and valid answer keys", () => {
  assert.equal(QUESTIONS.length, 144);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 144);
  assert.equal(new Set(QUESTIONS.map((q) => q.prompt)).size, 144);
  assert.ok(
    QUESTIONS.every(
      (q) =>
        q.options.length === 4 &&
        new Set(q.options).size === 4 &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < 4,
    ),
  );
});
test("comment joins and first ABCD answer locks; question answer is hidden until reveal", () => {
  const f = setup(),
    r = f.r;
  r.join(p(1));
  f.go();
  assert.equal(r.phase, "racing");
  assert.equal(r.snapshot().quiz.answer, undefined);
  const answer = "ABCD"[QUESTIONS[0].answer];
  assert.equal(r.comment(p(2), answer).ok, true);
  assert.equal(r.users.get("2").correct, 1);
  assert.equal(r.comment(p(2), "A").reason, "locked");
  assert.ok(r.users.get("2").boostUntil > r.now());
  f.advance(20000);
  r.tick();
  assert.equal(r.quizPhase, "reveal");
  assert.equal(r.snapshot().quiz.answer, QUESTIONS[0].answer);
  assert.equal(r.comment(p(3), answer).reason, "closed");
});
test("nitro increases distance, shield blocks attacks, unprotected opponents slow and spin", () => {
  const f = setup(),
    r = f.r;
  r.join(p("a"));
  r.join(p("b"));
  f.go();
  const b = r.users.get("b"),
    a = r.users.get("a");
  b.progress = 100;
  r.gift(p("b"), { coins: 10, streakId: "shield" });
  assert.ok(b.shieldUntil > r.now());
  r.gift(p("a"), { coins: 50, streakId: "attack" });
  assert.equal(b.slowUntil, 0);
  assert.equal(r.events.at(-1).blocked, true);
  f.advance(9000);
  r.tick();
  r.gift(p("a"), { coins: 100, streakId: "spin" });
  assert.ok(b.spinUntil > r.now());
  r.gift(p("a"), { coins: 1, streakId: "nitro" });
  f.tick();
  assert.ok(a.speed > b.speed);
});
test("gift streaks award only increments and replayed event IDs do not award twice", () => {
  const f = setup(),
    r = f.r;
  r.gift(p(1), { coins: 1, count: 1, repeatEnd: false, eventId: "1" });
  r.gift(p(1), { coins: 1, count: 3, repeatEnd: false, eventId: "2" });
  r.gift(p(1), { coins: 1, count: 3, repeatEnd: true, eventId: "3" });
  r.gift(p(1), { coins: 1, count: 3, repeatEnd: true, eventId: "3" });
  assert.equal(r.users.get("1").xp, 3);
  assert.equal(r.events.filter((e) => e.type === "gift").length, 2);
});
test("pause freezes movement, quiz clock and powerup remaining time", () => {
  const f = setup(),
    r = f.r;
  r.join(p(1));
  f.go();
  r.gift(p(1), { streakId: "x" });
  const position = r.users.get("1").progress,
    remaining = r.users.get("1").boostUntil - r.now(),
    quiz = r.quizDeadline - r.now();
  r.pause();
  f.advance(60000);
  r.tick();
  assert.equal(r.users.get("1").progress, position);
  assert.equal(r.comment(p(1), "B"), undefined);
  r.pause();
  assert.equal(r.users.get("1").boostUntil - r.now(), remaining);
  assert.equal(r.quizDeadline - r.now(), quiz);
  f.tick();
  assert.ok(r.users.get("1").progress > position);
});
test("one lap ends at the finish line, preserves winner and auto starts next round", () => {
  const f = setup(),
    r = f.r;
  r.configure({ laps: 1 });
  r.config.trackLength = 100;
  r.join(p(1));
  f.go();
  for (let i = 0; i < 100 && r.phase !== "finished"; i++) f.tick();
  assert.equal(r.phase, "finished");
  assert.equal(r.snapshot().winner, "1");
  assert.equal(r.users.get("1").progress, 100);
  assert.equal(r.users.get("1").wins, 1);
  f.advance(29999);
  r.tick();
  assert.equal(r.phase, "finished");
  f.advance(1);
  r.tick();
  assert.equal(r.phase, "racing");
  assert.equal(r.round, 2);
  assert.equal(r.users.size, 1);
  assert.equal(r.users.get("1").progress, 0);
});
test("first finisher gives other racers at most fifteen seconds to finish", () => {
  const f = setup(),
    r = f.r;
  r.config.trackLength = 100;
  r.config.laps = 1;
  r.join(p(1));
  r.join(p(2));
  f.go();
  r.users.get("1").progress = 99;
  r.users.get("2").progress = 0;
  r.users.get("2").slowUntil = r.now() + 30000;
  f.tick();
  assert.ok(r.firstFinisherAt);
  assert.equal(r.phase, "racing");
  f.advance(15000);
  r.tick();
  assert.equal(r.phase, "finished");
  assert.equal(r.ranking()[0].id, "1");
});
test("likes retain their remainder, charge can be spent only once and real follow goal is deduplicated", () => {
  const f = setup(),
    r = f.r;
  r.join(p(1));
  f.go();
  r.like(p(1), 6);
  r.like(p(1), 6);
  assert.equal(r.users.get("1").charge, 3);
  r.like(p(1), 90);
  r.comment(p(1), "nitro");
  assert.equal(r.users.get("1").charge, 0);
  const until = r.users.get("1").boostUntil;
  r.comment(p(1), "nitro");
  assert.equal(r.users.get("1").boostUntil, until);
  r.follow(p(1));
  r.follow(p(1));
  r.follow({ ...p(2), demo: true });
  assert.equal(r.snapshot().followCount, 1);
});
test("capacity and mid-race joins stay within limits without overwriting drivers", () => {
  const f = setup(),
    r = f.r;
  for (let i = 0; i < 100; i++) r.join(p(i));
  assert.equal(r.join(p("over")), null);
  assert.equal(r.users.size, 100);
  r.users.delete("99");
  f.go();
  for (const x of r.users.values()) x.progress = 250;
  const next = r.join(p("late"));
  assert.equal(next.progress, 220);
  assert.equal(r.users.size, 100);
});
test("invalid rules reject edits; camera mode may change during racing", () => {
  const f = setup(),
    r = f.r;
  assert.throws(() => r.configure({ laps: 0 }));
  assert.throws(() => r.configure({ shieldCoins: 80, attackCoins: 50 }));
  assert.equal(r.config.shieldCoins, 10);
  r.join(p(1));
  f.go();
  assert.throws(() => r.configure({ laps: 2 }));
  r.configure({ camera: "overview" });
  assert.equal(r.config.camera, "overview");
});
test("simulation and bots can be cleared without removing real racers", () => {
  const f = setup(),
    r = f.r,
    b = new Bots(r, { now: r.now, random: () => 0.5 });
  r.join(p("real"));
  b.configure(true, 12);
  assert.equal(r.users.size, 13);
  b.clear();
  assert.equal(r.users.size, 1);
  assert.ok(r.users.has("real"));
});
