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
    this.retired = 0;
    this.lastRetireAt = -Infinity;
  }
  configure(on, count = 12) {
    count = Number(count);
    if (!Number.isInteger(count) || count < 1 || count > 60)
      throw Error("Số người thử từ 1–60");
    this.enabled = !!on;
    this.target = count;
    if (on) {
      this.retired = 0;
      this.lastRetireAt = -Infinity;
      this.race.realComments = [];
      this.fill();
    }
  }
  get effectiveTarget() {
    return Math.max(0, this.target - this.retired);
  }
  retireForActivity() {
    const r = this.race,
      now = this.now();
    r.realComments = r.realComments.filter(
      (x) =>
        now - x.at <= 30000 && r.users.has(x.id) && !r.users.get(x.id).demo,
    );
    if (
      r.phase !== "racing" ||
      r.firstFinisherAt !== null ||
      now - this.lastRetireAt < 10000 ||
      r.realComments.length < 6 ||
      new Set(r.realComments.map((x) => x.id)).size < 2
    )
      return;
    const bot = r
      .ranking()
      .reverse()
      .find((p) => p.demo && p.id.startsWith("bot-") && !p.finishedAt);
    if (!bot) return;
    r.users.delete(bot.id);
    r.submissions.delete(bot.id);
    this.plans.delete(bot.id);
    const remaining = [...r.users.values()].filter(
      (p) => p.demo && p.id.startsWith("bot-"),
    ).length;
    this.retired = Math.max(this.retired + 1, this.target - remaining);
    this.lastRetireAt = now;
    r.realComments.splice(0, 6);
  }
  fill() {
    const r = this.race,
      list = [...r.users.values()].filter(
        (p) => p.demo && p.id.startsWith("bot-"),
      );
    for (const p of list.slice(this.effectiveTarget)) r.users.delete(p.id);
    let active = Math.min(list.length, this.effectiveTarget);
    while (active < this.effectiveTarget && r.users.size < r.config.capacity) {
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
    this.retireForActivity();
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
