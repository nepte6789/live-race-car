import test from "node:test";
import assert from "node:assert/strict";
import { Race } from "../src/game.mjs";
import { Bots } from "../src/bots.mjs";
function fixture() {
  let now = 1000;
  const r = new Race({ now: () => now }),
    b = new Bots(r, { now: () => now, random: () => 0.5 });
  b.configure(true, 12);
  r.join({ id: "human1" });
  r.join({ id: "human2" });
  r.start({ immediate: true });
  return {
    r,
    b,
    advance(ms) {
      now += ms;
    },
    chat(n = 6, solo = false) {
      for (let i = 0; i < n; i++) {
        now += 1000;
        r.comment(
          { id: solo ? "human1" : i % 2 ? "human2" : "human1" },
          "Chơi tiếp " + i,
        );
      }
    },
    count() {
      return [...r.users.values()].filter((p) => p.id.startsWith("bot-"))
        .length;
    },
  };
}
test("sustained real comments retire bots gradually and retired slots do not refill across rounds", () => {
  const f = fixture();
  f.chat();
  f.b.tick();
  assert.equal(f.count(), 11);
  f.chat();
  f.b.tick();
  assert.equal(f.count(), 11);
  f.advance(4000);
  f.b.tick();
  assert.equal(f.count(), 10);
  f.r.reset();
  f.r.start({ immediate: true });
  f.b.tick();
  assert.equal(f.count(), 10);
  assert.ok(f.r.users.has("human1"));
  assert.ok(f.r.users.has("human2"));
});
test("one person spamming and simulated comments do not retire the field", () => {
  const f = fixture();
  f.chat(12, true);
  f.b.tick();
  assert.equal(f.count(), 12);
  f.r.realComments = [];
  for (let i = 0; i < 20; i++) f.r.comment({ id: "bot-1", demo: true }, "A");
  f.b.tick();
  assert.equal(f.count(), 12);
});
test("when capacity already squeezed the bot field, retirement still removes a bot without replacement", () => {
  const f = fixture();
  f.r.config.capacity = 3;
  for (const p of [...f.r.users.values()])
    if (p.demo && p.id !== "bot-1") f.r.users.delete(p.id);
  f.chat();
  f.b.tick();
  assert.equal(f.count(), 0);
  assert.equal(f.b.effectiveTarget, 0);
  f.b.fill();
  assert.equal(f.count(), 0);
});
test("the award grace period and paused race preserve bots and results", () => {
  const f = fixture();
  f.chat();
  f.r.firstFinisherAt = f.r.now();
  f.b.tick();
  assert.equal(f.count(), 12);
  f.r.firstFinisherAt = null;
  f.r.pause();
  f.b.tick();
  assert.equal(f.count(), 12);
});
test("explicitly enabling bots again restores the host target", () => {
  const f = fixture();
  f.chat();
  f.b.tick();
  assert.equal(f.count(), 11);
  f.b.configure(true, 12);
  assert.equal(f.count(), 12);
});
