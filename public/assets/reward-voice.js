// Serial rewards; timed questions may interrupt and resume the current reward.
window.RewardVoice = class {
  constructor({
    onWarning = () => {},
    onSpeaking = () => {},
    synth = window.speechSynthesis,
    makeUtterance = (text) => new SpeechSynthesisUtterance(text),
  } = {}) {
    Object.assign(this, { synth, makeUtterance, onWarning, onSpeaking });
    this.enabled = false;
    this.items = [];
    this.busy = false;
    this.current = null;
    this.generation = 0;
    this.timer = null;
    this.quiet = false;
    this.lastBotAt = -Infinity;
    this.synth?.addEventListener?.("voiceschanged", () => this.drain());
  }
  setEnabled(value) {
    this.enabled = !!value;
    if (!this.enabled) this.clear();
    else this.drain();
  }
  cancelCurrent() {
    this.generation++;
    clearTimeout(this.timer);
    this.busy = false;
    this.current = null;
    this.onSpeaking(false);
    this.synth?.cancel();
  }
  clear() {
    this.items = [];
    this.cancelCurrent();
  }
  rank(item) {
    return item.priority >= 2
      ? 100 + item.priority
      : (item.demo ? -10 : 0) + item.priority;
  }
  setQuiet(value) {
    const next = !!value;
    if (next === this.quiet) return;
    this.quiet = next;
    if (next) {
      this.items = this.items.filter(
        (item) => !item.demo || item.priority >= 2,
      );
      if (this.current && this.current.priority < 2) {
        if (!this.current.demo) this.items.unshift(this.current);
        this.cancelCurrent();
      }
    }
    this.drain();
  }
  dropQuestions() {
    this.items = this.items.filter((item) => item.priority !== 2);
    if (this.current?.priority === 2) {
      this.cancelCurrent();
      this.drain();
    }
  }
  drop(key) {
    this.items = this.items.filter((x) => x.key !== key);
    if (this.current?.key === key) {
      this.cancelCurrent();
      this.drain();
    }
  }
  enqueue(
    text,
    priority = 1,
    {
      key = "",
      expiresAt = null,
      interrupt = false,
      demo = false,
      kind = "",
    } = {},
  ) {
    if (
      !this.enabled ||
      !text ||
      (expiresAt !== null && Date.now() >= expiresAt)
    )
      return;
    if (
      key &&
      (this.current?.key === key || this.items.some((x) => x.key === key))
    )
      return;
    if (demo && priority < 2) {
      if (
        kind !== "gift" ||
        this.quiet ||
        this.busy ||
        this.items.length ||
        Date.now() - this.lastBotAt < 60000
      )
        return;
      this.lastBotAt = Date.now();
    }
    const message = {
      text,
      priority,
      at: Date.now(),
      key,
      expiresAt,
      demo,
      kind,
    };
    if (
      !demo &&
      priority < 2 &&
      this.current?.demo &&
      this.current.priority < 2
    )
      this.cancelCurrent();
    if (interrupt) {
      const resume = this.current;
      if (resume && resume.priority < 2 && !resume.demo)
        this.items.unshift(resume);
      this.cancelCurrent();
      this.items.unshift(message);
    } else this.items.push(message);
    if (this.items.length > 30) {
      let weakest = 0;
      for (let i = 1; i < this.items.length; i++)
        if (this.rank(this.items[i]) <= this.rank(this.items[weakest]))
          weakest = i;
      this.items.splice(weakest, 1);
    }
    this.drain();
  }
  drain() {
    if (!this.enabled || this.busy || !this.items.length) return;
    this.items = this.items.filter(
      (x) =>
        Date.now() - x.at <= 90000 &&
        (x.expiresAt === null || x.expiresAt > Date.now()),
    );
    if (!this.items.length) return;
    let index = -1;
    for (let i = 0; i < this.items.length; i++) {
      if (this.quiet && this.items[i].priority < 2) continue;
      if (index < 0 || this.rank(this.items[i]) > this.rank(this.items[index]))
        index = i;
    }
    if (index < 0) return;
    if (!this.synth) {
      this.onWarning("Trình duyệt chưa hỗ trợ giọng đọc");
      return;
    }
    const voices = this.synth
      .getVoices()
      .filter((v) => /^vi([-_]|$)/i.test(v.lang));
    const normalized = (v) =>
      v.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const score = (v) => {
      const name = normalized(v),
        compact = name.replace(/[^a-z]/g, "");
      if (compact.includes("namminh") || /\bmale\b/.test(name)) return -1;
      if (compact.includes("hoaimy")) return 100;
      if (/\bmicrosoft\s+an\b/.test(name)) return 90;
      if (/\bfemale\b/.test(name)) return 80;
      if (name.includes("google")) return 70;
      return -1;
    };
    const voice = voices
      .filter((v) => score(v) >= 0)
      .sort((a, b) => score(b) - score(a))[0];
    if (!voice) {
      this.onWarning("Thiếu giọng nữ VI · Cài An/Hoài My");
      return;
    }
    const message = this.items.splice(index, 1)[0],
      u = this.makeUtterance(message.text),
      generation = this.generation;
    this.current = message;
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1.04;
    u.pitch = 1;
    this.busy = true;
    this.onSpeaking(true);
    let done = false;
    const finish = (error) => {
      if (done || generation !== this.generation) return;
      done = true;
      clearTimeout(this.timer);
      this.busy = false;
      this.current = null;
      this.onSpeaking(false);
      if (
        error &&
        (message.expiresAt === null || Date.now() < message.expiresAt)
      )
        this.onWarning("Giọng đọc bị gián đoạn; đang đọc phần tiếp theo");
      this.drain();
    };
    u.onend = () => finish(false);
    u.onerror = () => finish(true);
    const timeout =
      message.expiresAt === null
        ? 45000
        : Math.max(1, Math.min(45000, message.expiresAt - Date.now()));
    this.timer = setTimeout(() => {
      this.synth.cancel();
      finish(true);
    }, timeout);
    try {
      this.synth.speak(u);
    } catch {
      finish(true);
    }
  }
};
