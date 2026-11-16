import test from "node:test";
import assert from "node:assert/strict";
import { Race } from "../src/game.mjs";
import { interactionSpeech } from "../public/assets/reward-text.js";
test("a first heart queues thanks; repeated hearts are grouped for twenty seconds without losing XP or likes", () => {
  let now = 1000;
  const r = new Race({ now: () => now });
  r.like({ id: "a", name: "An" }, 1, "1");
  assert.equal(r.events.filter((e) => e.type === "like").length, 1);
  r.like({ id: "a" }, 99, "2");
  assert.equal(r.events.filter((e) => e.type === "like").length, 1);
  assert.equal(r.users.get("a").likes, 100);
  assert.equal(r.users.get("a").xp, 10);
  now += 20000;
  r.like({ id: "a" }, 1, "3");
  assert.equal(r.events.filter((e) => e.type === "like").length, 2);
});
test("different viewers each receive their own thanks and duplicate event IDs do not add announcements", () => {
  const r = new Race();
  r.like({ id: "a" }, 1, "one");
  r.like({ id: "b" }, 1, "two");
  r.like({ id: "b" }, 1, "two");
  assert.equal(r.events.filter((e) => e.type === "like").length, 2);
});
test("speech names the person and action for hearts, flowers and other gifts", () => {
  assert.equal(
    interactionSpeech({ type: "like", name: "Ngọc Hà ❤️" }),
    "Cảm ơn Ngọc Hà đã thả tim cho đường đua.",
  );
  assert.equal(
    interactionSpeech({
      type: "gift",
      name: "An",
      giftName: "Rose",
      quantity: 3,
    }),
    "Cảm ơn An đã tặng 3 bông hoa hồng.",
  );
  assert.equal(
    interactionSpeech({
      type: "gift",
      name: "An",
      giftName: "Hoa hướng dương",
      quantity: 1,
    }),
    "Cảm ơn An đã tặng 1 bông hoa hướng dương.",
  );
  assert.equal(
    interactionSpeech({
      type: "gift",
      name: "An",
      giftName: "Galaxy",
      quantity: 2,
    }),
    "Cảm ơn An đã tặng 2 món quà Galaxy.",
  );
  assert.equal(
    interactionSpeech({ type: "gift", name: "An" }),
    "Cảm ơn An đã tặng quà.",
  );
});
