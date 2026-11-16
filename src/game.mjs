import fs from "node:fs";
import { advanceTraffic, aheadDistance, LANES } from "./traffic.mjs";
export const QUESTIONS = JSON.parse(
  fs.readFileSync(new URL("../data/questions.json", import.meta.url), "utf8"),
);
export const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const avatar = (s) => (/^https?:\/\//i.test(String(s || "")) ? String(s) : "");
export class Race {
  constructor({ now = Date.now, random = Math.random } = {}) {
    Object.assign(this, { now, random });
    this.config = {
      laps: 5,
      trackLength: 2400,
      baseSpeed: 44,
      quizSeconds: 20,
      revealSeconds: 8,
      capacity: 100,
      autoNext: true,
      camera: "chase",
      followGoal: 50,
      followBase: 0,
      shieldCoins: 10,
      attackCoins: 50,
      spinCoins: 100,
    };
    this.round = 1;
    this.phase = "lobby";
    this.users = new Map();
    this.events = [];
    this.chat = [];
    this.serial = 0;
    this.sequence = 0;
    this.lastTick = now();
    this.raceStartedAt = null;
    this.phaseDeadline = null;
    this.firstFinisherAt = null;
    this.quizIndex = 0;
    this.quizPhase = "question";
    this.quizDeadline = null;
    this.submissions = new Map();
    this.seen = new Set();
    this.combos = new Map();
    this.followers = new Set();
    this.pausedAt = null;
    this.winner = null;
  }
  emit(type, p, text, extra = {}) {
    const event = {
      id: ++this.sequence,
      type,
      userId: p?.id || "",
      name: p?.name || "Đường đua",
      avatar: p?.avatar || "",
      text,
      at: this.now(),
      demo: !!p?.demo,
      ...extra,
    };
    this.events.push(event);
    if (this.events.length > 50) this.events.shift();
    return event;
  }
  once(id) {
    if (!id) return true;
    id = String(id);
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > 10000)
      this.seen.delete(this.seen.values().next().value);
    return true;
  }
  join(data) {
    if (data?.id === undefined || data.id === null || !String(data.id).trim())
      return null;
    const id = String(data.id);
    let p = this.users.get(id);
    if (p) {
      p.name = String(data.name || p.name).slice(0, 42);
      if (data.avatar) p.avatar = avatar(data.avatar);
      return p;
    }
    if (this.users.size >= this.config.capacity) return null;
    const pack = [...this.users.values()].filter((p) => !p.finishedAt);
    let progress =
      this.phase === "racing" && pack.length
        ? Math.max(0, Math.min(...pack.map((p) => p.progress)) - 30)
        : 0;
    const spawnLane = LANES[this.users.size % LANES.length];
    if (this.phase === "racing") {
      // Join behind the pack, moving back until this physical lane has room.
      for (let attempt = 0; attempt < 300; attempt++) {
        const occupied = pack.some(
          (q) =>
            Math.min(
              Math.abs(q.lane - spawnLane),
              Math.abs(q.targetLane - spawnLane),
            ) < 3.88 &&
            Math.min(
              aheadDistance(progress, q.progress, this.config.trackLength),
              aheadDistance(q.progress, progress, this.config.trackLength),
            ) < 9,
        );
        if (!occupied) break;
        progress -= 9;
      }
    }
    const n = ++this.serial;
    p = {
      id,
      name: String(data.name || id).slice(0, 42),
      avatar: avatar(data.avatar),
      demo: !!data.demo,
      joined: n,
      hue: (n * 137.508) % 360,
      progress:
        this.phase === "racing"
          ? progress
          : -Math.floor(this.users.size / 4) * 9,
      speed: 0,
      lane: LANES[this.users.size % LANES.length],
      targetLane: LANES[this.users.size % LANES.length],
      steering: 0,
      laneChangeUntil: 0,
      requestedLane: null,
      manualUntil: 0,
      xp: 0,
      charge: 0,
      boostUntil: 0,
      shieldUntil: 0,
      spinUntil: 0,
      slowUntil: 0,
      lastResult: "",
      finishedAt: null,
      wins: 0,
      correct: 0,
      likes: 0,
      likeRemainder: 0,
      followed: false,
    };
    this.users.set(id, p);
    this.emit("join", p, `${p.name} lên xe · sẵn sàng bứt tốc!`);
    return p;
  }
  boost(p, seconds = 3) {
    p.boostUntil = Math.min(
      this.now() + 12000,
      Math.max(this.now(), p.boostUntil) + seconds * 1000,
    );
  }
  comment(data, text, eventId) {
    if (
      this.phase === "paused" ||
      !this.once(eventId) ||
      !String(text || "").trim()
    )
      return;
    const p = this.join(data);
    if (!p) return { ok: false, reason: "full" };
    this.chat.push({
      id: ++this.sequence,
      name: p.name,
      avatar: p.avatar,
      text: String(text).slice(0, 200),
      demo: p.demo,
    });
    if (this.chat.length > 30) this.chat.shift();
    const input = normalize(text);
    if (["trai", "left"].includes(input)) {
      const lane = LANES.reduce(
        (a, b) =>
          Math.abs(b - p.targetLane) < Math.abs(a - p.targetLane) ? b : a,
        LANES[0],
      );
      p.requestedLane = LANES[Math.max(0, LANES.indexOf(lane) - 1)];
      p.manualUntil = this.now() + 3000;
      return { ok: true };
    }
    if (["phai", "right"].includes(input)) {
      const lane = LANES.reduce(
        (a, b) =>
          Math.abs(b - p.targetLane) < Math.abs(a - p.targetLane) ? b : a,
        LANES[0],
      );
      p.requestedLane = LANES[Math.min(3, LANES.indexOf(lane) + 1)];
      p.manualUntil = this.now() + 3000;
      return { ok: true };
    }
    if (
      ["nitro", "boost"].includes(input) &&
      p.charge >= 30 &&
      this.phase === "racing" &&
      !p.finishedAt
    ) {
      p.charge -= 30;
      this.boost(p, 4);
      this.emit("boost", p, `${p.name} kích hoạt NITRO!`);
      return { ok: true };
    }
    if (!/^[abcd]$/.test(input)) return { ok: true };
    this.tickQuiz();
    if (
      this.phase !== "racing" ||
      this.quizPhase !== "question" ||
      this.now() >= this.quizDeadline
    )
      return { ok: false, reason: "closed" };
    if (this.submissions.has(p.id)) return { ok: false, reason: "locked" };
    const option = input.charCodeAt(0) - 97,
      q = QUESTIONS[this.quizIndex % QUESTIONS.length],
      correct = option === q.answer;
    this.submissions.set(p.id, option);
    p.lastResult = correct ? "correct" : "wrong";
    if (correct) {
      p.correct++;
      p.xp += 20;
      p.charge = Math.min(100, p.charge + 12);
      this.boost(p, 5);
      this.emit("correct", p, `${p.name} trả lời đúng · NITRO +5 giây`);
    }
    return { ok: true };
  }
  like(data, count, eventId) {
    if (this.phase === "paused" || !this.once(eventId)) return;
    const p = this.join(data);
    if (!p) return;
    count = Math.max(0, Math.min(100000, Math.floor(Number(count) || 0)));
    p.likes += count;
    const sum = p.likeRemainder + count,
      units = Math.floor(sum / 10);
    p.likeRemainder = sum % 10;
    p.charge = Math.min(100, p.charge + units * 3);
    p.xp += Math.min(10, units);
    if (p.charge >= 100 && this.phase === "racing" && !p.finishedAt) {
      p.charge -= 100;
      this.boost(p, 5);
      this.emit("boost", p, `${p.name} đầy năng lượng tim · NITRO tự động!`);
    }
  }
  follow(data, eventId) {
    if (this.phase === "paused" || !this.once(eventId)) return;
    const p = this.join(data);
    if (!p) return;
    if (!p.demo) this.followers.add(p.id);
    if (p.followed) return;
    p.followed = true;
    p.xp += 10;
    p.charge = Math.min(100, p.charge + 20);
    if (this.phase === "racing") this.boost(p, 2);
    this.emit("follow", p, `Cảm ơn ${p.name} theo dõi · tiếp sức cho xe!`);
  }
  gift(
    data,
    {
      name = "Quà tặng",
      giftId = "gift",
      coins = 1,
      count = 1,
      streakId = "",
      repeatEnd = true,
      eventId,
    } = {},
  ) {
    if (this.phase === "paused" || !this.once(eventId)) return;
    const p = this.join(data);
    if (!p) return;
    count = Math.max(1, Math.min(100000, Math.floor(Number(count) || 1)));
    coins = Math.max(1, Math.min(100000, Math.floor(Number(coins) || 1)));
    const key = p.id + ":" + giftId + ":" + streakId,
      old = this.combos.get(key),
      fresh =
        !old ||
        this.now() - old.at > 30000 ||
        (old.end && !repeatEnd && count === 1),
      delta = fresh ? count : Math.max(0, count - old.count);
    this.combos.set(key, {
      count: Math.max(fresh ? 0 : old.count, count),
      at: this.now(),
      end: !!repeatEnd,
    });
    if (this.combos.size > 5000)
      this.combos.delete(this.combos.keys().next().value);
    if (!delta) return;
    const value = Math.min(1000000, delta * coins);
    p.xp += Math.min(200, value);
    p.charge = Math.min(100, p.charge + Math.min(50, value * 2));
    let action = "nitro",
      target = null,
      blocked = false;
    if (this.phase === "racing" && !p.finishedAt) {
      if (coins >= this.config.spinCoins) {
        action = "spin";
        target = this.ranking().find((x) => x.id !== p.id && !x.finishedAt);
      } else if (coins >= this.config.attackCoins) {
        action = "attack";
        target = this.ranking().find((x) => x.id !== p.id && !x.finishedAt);
      } else if (coins >= this.config.shieldCoins) {
        action = "shield";
        p.shieldUntil = Math.min(
          this.now() + 20000,
          Math.max(this.now(), p.shieldUntil) + 8000,
        );
      } else this.boost(p, Math.min(6, 2 + delta * 0.5));
      if (target) {
        blocked = target.shieldUntil > this.now();
        if (!blocked) {
          target.slowUntil = this.now() + 3000;
          if (action === "spin") target.spinUntil = this.now() + 2200;
        }
      }
    }
    const words = {
      nitro: "tăng tốc",
      shield: "khiên bảo vệ",
      attack: "tên lửa",
      spin: "vòng xoáy",
    };
    this.emit(
      "gift",
      p,
      `${p.name} nhận ${name} ×${delta} · ${this.phase === "racing" ? words[action] : "nạp năng lượng cho ván tới"}${blocked ? " · khiên đối thủ đã chặn!" : ""}`,
      {
        action,
        target: target?.id || null,
        blocked,
        quantity: delta,
        giftName: name,
      },
    );
  }
  member(data, eventId) {
    if (this.phase === "paused" || !this.once(eventId) || !data?.id) return;
    if (this.users.has(String(data.id))) return;
    const last = this.memberAt;
    if (last !== undefined && this.now() - last < 8000) return;
    this.memberAt = this.now();
    this.emit(
      "welcome",
      { ...data, avatar: avatar(data.avatar) },
      `Chào ${String(data.name || "bạn").slice(0, 42)}! Thả tim hoặc bình luận để lên xe nhé.`,
    );
  }
  ranking() {
    return [...this.users.values()].sort((a, b) => {
      if (a.finishedAt && b.finishedAt)
        return a.finishedAt - b.finishedAt || a.joined - b.joined;
      if (a.finishedAt) return -1;
      if (b.finishedAt) return 1;
      return b.progress - a.progress || a.joined - b.joined;
    });
  }
  start() {
    if (this.phase === "finished") this.reset();
    if (!["lobby", "finished"].includes(this.phase))
      throw Error("Ván đang chạy");
    if (!this.users.size)
      throw Error("Cần ít nhất một tay đua; có thể bật người thử");
    let grid = 0;
    for (const p of this.users.values()) {
      const lane = ((grid % 4) - 1.5) * 4;
      Object.assign(p, {
        progress: grid < 4 ? 0 : -Math.floor(grid / 4) * 9,
        lane,
        targetLane: lane,
        speed: 0,
        boostUntil: 0,
        shieldUntil: 0,
        slowUntil: 0,
        spinUntil: 0,
        lastResult: "",
        finishedAt: null,
        correct: 0,
        likeRemainder: 0,
        followed: false,
        steering: 0,
        laneChangeUntil: 0,
        requestedLane: null,
        manualUntil: 0,
      });
      grid++;
    }
    this.phase = "countdown";
    this.phaseDeadline = this.now() + 5000;
    this.raceStartedAt = null;
    this.firstFinisherAt = null;
    this.winner = null;
    this.submissions.clear();
    this.quizPhase = "question";
    this.quizDeadline = null;
    this.lastTick = this.now();
    this.emit("system", null, "Tất cả vào vị trí · xuất phát sau 5 giây!");
  }
  reset({ keepPlayers = true } = {}) {
    this.round++;
    this.phase = "lobby";
    this.phaseDeadline = null;
    this.quizDeadline = null;
    this.raceStartedAt = null;
    this.firstFinisherAt = null;
    this.winner = null;
    this.submissions.clear();
    this.events = [];
    this.chat = [];
    this.combos.clear();
    this.quizIndex++;
    if (!keepPlayers) this.users.clear();
    let grid = 0;
    for (const p of this.users.values()) {
      const lane = LANES[grid % 4];
      Object.assign(p, {
        progress: -Math.floor(grid++ / 4) * 9,
        lane,
        targetLane: lane,
        steering: 0,
        laneChangeUntil: 0,
        requestedLane: null,
        manualUntil: 0,
        speed: 0,
        xp: 0,
        charge: 0,
        finishedAt: null,
        boostUntil: 0,
        shieldUntil: 0,
        slowUntil: 0,
        spinUntil: 0,
      });
    }
    this.lastTick = this.now();
  }
  finishQuiz() {
    if (this.quizPhase !== "question") return;
    this.quizPhase = "reveal";
    this.quizDeadline += this.config.revealSeconds * 1000;
  }
  nextQuiz() {
    this.quizIndex++;
    this.quizPhase = "question";
    this.quizDeadline = this.now() + this.config.quizSeconds * 1000;
    this.submissions.clear();
    for (const p of this.users.values()) p.lastResult = "";
  }
  tickQuiz() {
    if (
      this.phase !== "racing" ||
      !this.quizDeadline ||
      this.now() < this.quizDeadline
    )
      return;
    if (this.quizPhase === "question") this.finishQuiz();
    if (this.quizPhase === "reveal" && this.now() >= this.quizDeadline)
      this.nextQuiz();
  }
  pause() {
    if (this.phase === "paused") {
      const shift = this.now() - this.pausedAt;
      this.phase = this.pausedPhase;
      if (this.phaseDeadline) this.phaseDeadline += shift;
      if (this.quizDeadline) this.quizDeadline += shift;
      if (this.raceStartedAt !== null) this.raceStartedAt += shift;
      if (this.firstFinisherAt !== null) this.firstFinisherAt += shift;
      for (const p of this.users.values()) {
        for (const k of [
          "boostUntil",
          "shieldUntil",
          "spinUntil",
          "slowUntil",
          "laneChangeUntil",
          "manualUntil",
        ])
          if (p[k] > this.pausedAt) p[k] += shift;
        if (p.finishedAt) p.finishedAt += shift;
      }
      this.lastTick = this.now();
    } else {
      if (this.phase === "lobby") return;
      this.pausedPhase = this.phase;
      this.phase = "paused";
      this.pausedAt = this.now();
    }
  }
  configure(c) {
    if (c.camera !== undefined && !["chase", "overview"].includes(c.camera))
      throw Error("Góc máy không hợp lệ");
    for (const [key, min, max] of [
      ["laps", 1, 10],
      ["quizSeconds", 10, 60],
      ["followGoal", 1, 1000000],
      ["followBase", 0, 100000000],
      ["shieldCoins", 2, 10000],
      ["attackCoins", 3, 100000],
      ["spinCoins", 4, 1000000],
    ])
      if (c[key] !== undefined) {
        const n = Number(c[key]);
        if (!Number.isInteger(n) || n < min || n > max)
          throw Error(`Giá trị ${key} không hợp lệ`);
        if (
          !["lobby", "finished"].includes(this.phase) &&
          !["followGoal", "followBase"].includes(key)
        )
          throw Error("Chỉnh luật khi đang ở sảnh hoặc sau ván");
      }
    const next = {
      ...this.config,
      ...Object.fromEntries(
        Object.entries(c)
          .filter(([k]) =>
            [
              "laps",
              "quizSeconds",
              "followGoal",
              "followBase",
              "shieldCoins",
              "attackCoins",
              "spinCoins",
              "camera",
              "autoNext",
            ].includes(k),
          )
          .map(([k, v]) => [
            k,
            k === "camera" ? v : k === "autoNext" ? !!v : Number(v),
          ]),
      ),
    };
    if (
      !(
        next.shieldCoins < next.attackCoins && next.attackCoins < next.spinCoins
      )
    )
      throw Error("Ngưỡng quà: khiên < tên lửa < vòng xoáy");
    this.config = next;
  }
  clearDemo() {
    for (const [id, p] of this.users) if (p.demo) this.users.delete(id);
    this.events = this.events.filter((e) => !e.demo);
    this.chat = this.chat.filter((e) => !e.demo);
    this.submissions = new Map(
      [...this.submissions].filter(([id]) => this.users.has(id)),
    );
  }
  tick() {
    const now = this.now();
    let dt = Math.max(0, Math.min(0.25, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (this.phase === "paused") return;
    if (this.phase === "countdown" && now >= this.phaseDeadline) {
      this.phase = "racing";
      dt = 0;
      this.raceStartedAt = now;
      this.phaseDeadline = null;
      this.quizDeadline = now + this.config.quizSeconds * 1000;
      this.emit("system", null, "XUẤT PHÁT · đường đua đã mở!");
    }
    if (this.phase === "finished") {
      if (
        this.config.autoNext &&
        now >= this.phaseDeadline &&
        this.users.size
      ) {
        this.reset();
        this.start();
      }
      return;
    }
    if (this.phase !== "racing") return;
    this.tickQuiz();
    advanceTraffic(
      this.users.values(),
      dt,
      now,
      this.config.trackLength,
      (p) => {
        const tier = Math.min(4, Math.floor(p.xp / 60)),
          boost = p.boostUntil > now ? 23 : 0,
          slow = p.spinUntil > now ? 0.12 : p.slowUntil > now ? 0.5 : 1;
        return (this.config.baseSpeed + tier * 1.4 + boost) * slow;
      },
    );
    for (const p of this.users.values()) {
      if (p.finishedAt) continue;
      if (p.progress >= this.config.laps * this.config.trackLength) {
        p.progress = this.config.laps * this.config.trackLength;
        p.finishedAt = now;
        p.speed = 0;
        if (this.firstFinisherAt === null) {
          this.firstFinisherAt = now;
          p.wins++;
          this.emit("winner", p, `${p.name} cán đích đầu tiên!`);
        }
      }
    }
    const running = [...this.users.values()].filter((p) => !p.finishedAt);
    if (
      this.firstFinisherAt !== null &&
      (!running.length || now - this.firstFinisherAt >= 15000)
    ) {
      this.phase = "finished";
      this.phaseDeadline = now + 12000;
      this.winner = this.ranking()[0]?.id || null;
    }
  }
  snapshot() {
    const now = this.now(),
      effective = this.phase === "paused" ? this.pausedAt : now,
      q = QUESTIONS[this.quizIndex % QUESTIONS.length],
      revealed =
        this.quizPhase === "reveal" &&
        ["racing", "paused"].includes(this.phase);
    const ranked = this.ranking().map((p, i) => ({
      ...p,
      rank: i + 1,
      lap: Math.min(
        this.config.laps,
        Math.max(1, Math.floor(p.progress / this.config.trackLength) + 1),
      ),
      tier: Math.min(4, Math.floor(p.xp / 60)),
      boosted: p.boostUntil > effective,
      shielded: p.shieldUntil > effective,
      spinning: p.spinUntil > effective,
      slowed: p.slowUntil > effective,
    }));
    return {
      round: this.round,
      phase: this.phase,
      pausedPhase: this.pausedPhase,
      serverTime: now,
      effectiveTime: effective,
      config: this.config,
      racers: ranked,
      phaseDeadline: this.phaseDeadline,
      elapsed:
        this.raceStartedAt === null
          ? 0
          : Math.max(0, (effective - this.raceStartedAt) / 1000),
      winner: this.winner,
      followCount: this.config.followBase + this.followers.size,
      events: this.events.filter((e) => now - e.at < 7000),
      chat: this.chat,
      quiz:
        this.phase === "racing" ||
        (this.phase === "paused" && this.pausedPhase === "racing")
          ? {
              id: this.quizIndex + 1,
              prompt: q.prompt,
              options: q.options,
              deadline: this.quizDeadline,
              phase: this.quizPhase,
              answered: this.submissions.size,
              ...(revealed
                ? { answer: q.answer, explanation: q.explanation }
                : {}),
            }
          : null,
    };
  }
}
