import test from "node:test";
import assert from "node:assert/strict";
import { Race, QUESTIONS } from "../src/game.mjs";
import { levelOf, modelOf } from "../src/progression.mjs";
import { selectShot } from "../public/assets/camera-director.js";
function setup() {
  let now = 1000;
  const r = new Race({ now: () => now });
  return {
    r,
    advance(ms) {
      now += ms;
    },
    go() {
      r.start();
      now += 5000;
      r.tick();
    },
    reveal() {
      now = r.quizDeadline;
      r.tick();
    },
  };
}
const user = (id) => ({ id, name: id });
test("hearts advance levels at GT/F1 boundaries and XP survives the next round", () => {
  const { r } = setup();
  r.like(user("a"), 1990, "a");
  assert.equal(levelOf(r.users.get("a").xp), 4);
  r.like(user("a"), 10, "b");
  assert.equal(r.snapshot().racers[0].model, "gt");
  r.like(user("a"), 2500, "c");
  assert.equal(r.snapshot().racers[0].level, 10);
  assert.equal(r.snapshot().racers[0].model, "formula");
  r.reset();
  assert.equal(r.snapshot().racers[0].level, 10);
  assert.equal(modelOf(levelOf(1e9)), "formula");
});
test("titles follow actual top hearts, quantity and high per-item gift value without combo duplicates", () => {
  const { r } = setup();
  r.like(user("a"), 2, "a");
  r.like(user("b"), 3, "b");
  r.gift(user("a"), {
    giftId: "rose",
    coins: 1,
    count: 10,
    repeatEnd: false,
    eventId: "gift1",
  });
  r.gift(user("a"), {
    giftId: "rose",
    coins: 1,
    count: 10,
    repeatEnd: true,
    eventId: "gift2",
  });
  r.gift(user("b"), { giftId: "big", coins: 100, count: 1, eventId: "big" });
  const a = r.snapshot().racers.find((p) => p.id === "a"),
    b = r.snapshot().racers.find((p) => p.id === "b");
  assert.equal(a.giftCount, 10);
  assert.deepEqual(a.honors, ["Đại hiệp tặng quà"]);
  assert.ok(b.honors.includes("Chuyên gia thả tim"));
  assert.ok(b.honors.includes("Đại gia bá khí"));
  r.like(user("a"), 2, "more");
  assert.ok(
    r
      .snapshot()
      .racers.find((p) => p.id === "a")
      .honors.includes("Chuyên gia thả tim"),
  );
});
test("quick hands uses cumulative correct response time with full penalties for misses and late joins", () => {
  const f = setup(),
    r = f.r;
  ["a", "b", "silent"].forEach((id) => r.join(user(id)));
  f.go();
  f.advance(1000);
  r.comment(user("a"), "ABCD"[QUESTIONS[0].answer]);
  f.advance(2000);
  r.comment(user("b"), "ABCD"[QUESTIONS[0].answer]);
  f.reveal();
  assert.ok(
    r
      .snapshot()
      .racers.find((p) => p.id === "a")
      .honors.includes("Nhanh tay lẹ mắt"),
  );
  assert.equal(r.users.get("silent").responseTotalMs, 20000);
  r.join(user("late"));
  assert.equal(r.users.get("late").responseTotalMs, 20000);
  r.nextQuiz();
  f.advance(1000);
  r.comment(user("b"), "ABCD"[QUESTIONS[1].answer]);
  f.reveal();
  assert.ok(
    r
      .snapshot()
      .racers.find((p) => p.id === "b")
      .honors.includes("Nhanh tay lẹ mắt"),
  );
  assert.equal(r.users.get("a").responseTotalMs, 21000);
  assert.equal(r.users.get("b").responseTotalMs, 4000);
});
test("paused time is excluded from answer timing; first submission locks measured time", () => {
  const f = setup(),
    r = f.r;
  r.join(user("a"));
  f.go();
  f.advance(500);
  r.pause();
  f.advance(60000);
  r.pause();
  f.advance(500);
  r.comment(user("a"), "ABCD"[QUESTIONS[0].answer]);
  f.advance(1000);
  r.comment(user("a"), "A");
  f.reveal();
  assert.equal(r.users.get("a").responseTotalMs, 1000);
});
test("exactly one gold car follows live ranking; podium winner stays first", () => {
  const f = setup(),
    r = f.r;
  r.join(user("a"));
  r.join(user("b"));
  f.go();
  r.users.get("b").progress = 100;
  assert.equal(r.snapshot().racers.find((p) => p.gold).id, "b");
  r.users.get("a").progress = 200;
  assert.equal(r.snapshot().racers.filter((p) => p.gold).length, 1);
  assert.equal(r.snapshot().racers[0].id, "a");
  r.config.laps = 1;
  r.users.get("a").progress = 2399;
  f.advance(100);
  r.tick();
  f.advance(15000);
  r.tick();
  assert.equal(r.phase, "finished");
  assert.equal(r.snapshot().winner, "a");
  assert.ok(r.snapshot().racers[0].gold);
});
test("broadcast camera visits all parts of the pack and different drivers on subsequent rotations", () => {
  const cars = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    boosted: i === 7,
  }));
  const shots = Array.from({ length: 12 }, (_, i) => selectShot(cars, i * 8));
  assert.ok(new Set(shots.map((s) => s.id)).size >= 6);
  assert.ok(shots.some((s) => Number(s.id) >= 8));
  assert.ok(shots.some((s) => s.kind === "overview"));
  assert.ok(shots.some((s) => s.kind === "front"));
  assert.ok(shots.some((s) => s.kind === "side"));
  assert.equal(selectShot(cars, 0, "auto", "10", true).id, "10");
  assert.equal(selectShot(cars, 0, "chase").id, "0");
  assert.equal(selectShot([], 0).id, null);
});
test("answer key remains hidden until timed reveal; automatic camera is configurable while racing", () => {
  const f = setup(),
    r = f.r;
  r.join(user("a"));
  f.go();
  r.configure({ camera: "auto" });
  f.advance(19999);
  assert.equal(r.snapshot().quiz.answer, undefined);
  f.advance(1);
  r.tick();
  assert.equal(r.snapshot().quiz.answer, QUESTIONS[0].answer);
});
