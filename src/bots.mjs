import { QUESTIONS } from "./game.mjs";
const names = [
  "Minh Anh",
  "Ngọc Hà",
  "Bảo Trâm",
  "Tuấn Anh",
  "Thanh Mai",
  "Gia Hân",
  "Phúc An",
  "Đức Huy",
  "Thu Hương",
  "Khánh Vy",
  "Quốc Bảo",
  "Thùy Linh",
];
export class Bots {
  constructor(race, { now = Date.now, random = Math.random } = {}) {
    Object.assign(this, { race, now, random });
    this.enabled = false;
    this.target = 12;
    this.serial = 0;
    this.plans = new Map();
    this.next = 0;
  }
  configure(on, count = 12) {
    count = Number(count);
    if (!Number.isInteger(count) || count < 1 || count > 60)
      throw Error("Số người thử từ 1–60");
    this.enabled = !!on;
    this.target = count;
    if (on) this.fill();
  }
  fill() {
    const r = this.race,
      list = [...r.users.values()].filter(
        (p) => p.demo && p.id.startsWith("bot-"),
      );
    for (const p of list.slice(this.target)) r.users.delete(p.id);
    let active = Math.min(list.length, this.target);
    while (active < this.target && r.users.size < r.config.capacity) {
      const n = ++this.serial;
      r.join({
        id: "bot-" + n,
        name:
          names[(n - 1) % names.length] +
          (n > 12 ? " " + Math.ceil(n / 12) : ""),
        demo: true,
      });
      active++;
    }
  }
  tick() {
    if (!this.enabled || this.race.phase === "paused") return;
    this.fill();
    const r = this.race;
    if (r.phase !== "racing") return;
    const list = [...r.users.values()].filter(
      (p) => p.demo && p.id.startsWith("bot-") && !p.finishedAt,
    );
    for (const p of list) {
      const key = r.round + ":" + r.quizIndex,
        old = this.plans.get(p.id);
      if (old?.key !== key) {
        this.plans.set(p.id, {
          key,
          at: this.now() + 2500 + this.random() * 12000,
          answer:
            this.random() < 0.65
              ? QUESTIONS[r.quizIndex % QUESTIONS.length].answer
              : Math.floor(this.random() * 4),
        });
      }
      const plan = this.plans.get(p.id);
      if (
        r.quizPhase === "question" &&
        !r.submissions.has(p.id) &&
        this.now() >= plan.at
      )
        r.comment(p, "ABCD"[plan.answer]);
    }
    if (this.now() < this.next || !list.length) return;
    this.next = this.now() + 2500 + this.random() * 4500;
    const p = list[Math.floor(this.random() * list.length)];
    if (this.random() < 0.08)
      r.gift(p, {
        giftId: "demo",
        name: "Hoa hồng thử",
        coins: 1,
        streakId: String(this.now()),
      });
    else r.like(p, 10 + Math.floor(this.random() * 30));
  }
  clear() {
    this.enabled = false;
    this.plans.clear();
    this.race.clearDemo();
  }
}
