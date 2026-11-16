import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceTraffic,
  aheadDistance,
  LANES,
  MIN_GAP,
} from "../src/traffic.mjs";
import { Race } from "../src/game.mjs";
const car = (id, progress, lane, speed = 44) => ({
  id,
  joined: id,
  progress,
  lane,
  targetLane: lane,
  desired: speed,
});
const step = (cars, now) =>
  advanceTraffic(cars, 0.05, now, 2400, (p) => p.desired);
test("one heart joins without a comment; duplicate event does not add a second driver or heart", () => {
  const game = new Race();
  game.like({ id: "real", name: "Khách" }, 1, "heart-1");
  game.like({ id: "real" }, 1, "heart-1");
  assert.equal(game.users.size, 1);
  assert.equal(game.users.get("real").likes, 1);
  assert.equal(game.chat.length, 0);
});
test("faster car changes lane before passing a slower car", () => {
  const rear = car(1, 0, -2, 65),
    front = car(2, 18, -2, 35),
    cars = [rear, front];
  for (let i = 0; i < 160; i++) {
    step(cars, 1000 + i * 50);
    if (Math.abs(rear.lane - front.lane) < 3.88)
      assert.ok(
        aheadDistance(rear.progress, front.progress, 2400) >= MIN_GAP - 1e-6,
      );
  }
  assert.ok(rear.progress > front.progress);
  assert.notEqual(rear.lane, front.lane);
});
test("blocked passing lanes force following rather than driving through", () => {
  const rear = car(1, 0, -2, 65),
    front = car(2, 12, -2, 35),
    cars = [rear, front, car(3, 0, -6, 35), car(4, 0, 2, 35)];
  for (let i = 0; i < 100; i++) {
    step(cars, 1000 + i * 50);
    assert.ok(front.progress - rear.progress >= MIN_GAP - 1e-6);
  }
  assert.equal(rear.lane, -2);
  assert.ok(rear.speed <= 35.0001);
});
test("unsafe manual lane swaps are refused", () => {
  const a = car(1, 10, -2),
    b = car(2, 10, 2);
  a.requestedLane = 2;
  b.requestedLane = -2;
  a.manualUntil = b.manualUntil = 9000;
  step([a, b], 1000);
  assert.equal(a.lane, -2);
  assert.equal(b.lane, 2);
});
test("traffic brakes across the finish line", () => {
  const rear = car(1, 2394, -2, 65),
    front = car(2, 4, -2, 20);
  rear.laneChangeUntil = 9000;
  step([rear, front], 1000);
  assert.ok(
    aheadDistance(rear.progress, front.progress, 2400) >= MIN_GAP - 1e-6,
  );
});
test("100 drivers remain separated during repeated boosts and overtakes", () => {
  const cars = Array.from({ length: 100 }, (_, i) =>
    car(i + 1, -Math.floor(i / 4) * 10, LANES[i % 4], 30 + ((i * 17) % 45)),
  );
  for (let tick = 0; tick < 800; tick++) {
    step(cars, 1000 + tick * 50);
    for (let i = 0; i < cars.length; i++)
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i],
          b = cars[j];
        if (Math.abs(a.lane - b.lane) >= 3.88) continue;
        const gap = Math.min(
          aheadDistance(a.progress, b.progress, 2400),
          aheadDistance(b.progress, a.progress, 2400),
        );
        assert.ok(
          gap >= MIN_GAP - 1e-5,
          `tick ${tick}: ${a.id}/${b.id} gap ${gap}`,
        );
      }
  }
});

test("late joins and resets occupy separate grid slots", () => {
  let now = 1000;
  const game = new Race({ now: () => now });
  for (let i = 0; i < 20; i++) game.like({ id: String(i) }, 1, "first-" + i);
  game.start();
  now += 5000;
  game.tick();
  for (let i = 20; i < 40; i++) game.like({ id: String(i) }, 1, "late-" + i);
  const users = [...game.users.values()];
  for (let i = 0; i < users.length; i++)
    for (let j = i + 1; j < users.length; j++) {
      if (users[i].lane === users[j].lane)
        assert.ok(Math.abs(users[i].progress - users[j].progress) >= 9);
    }
  game.reset();
  assert.equal(
    new Set([...game.users.values()].map((p) => `${p.lane}:${p.progress}`))
      .size,
    40,
  );
});
