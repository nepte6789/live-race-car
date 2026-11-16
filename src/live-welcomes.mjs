// Ignore connection history and keep only a tiny, fresh arrival batch.
export class LiveWelcomes {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.reset();
  }
  reset() {
    this.connectedAt = null;
    this.pending = [];
    this.seen = new Set();
    this.flushAt = null;
  }
  connected() {
    this.reset();
    this.connectedAt = this.now();
  }
  offer(user, event = {}, eventId) {
    const now = this.now();
    if (
      this.connectedAt === null ||
      now - this.connectedAt < 5000 ||
      !user?.id ||
      user.demo
    )
      return false;
    const raw = event.common?.createTime ?? event.createTime ?? event.timestamp;
    if (raw !== undefined && raw !== null) {
      let at = Number(raw);
      if (!Number.isFinite(at) || at <= 0) return false;
      if (at < 1e12) at *= 1000;
      if (at < this.connectedAt + 5000 || now - at > 5000 || at - now > 5000)
        return false;
    }
    if (this.seen.has(user.id)) return false;
    this.seen.add(user.id);
    if (this.seen.size > 5000)
      this.seen.delete(this.seen.values().next().value);
    this.pending.push({ user, eventId, at: now });
    this.pending = this.pending.slice(-3);
    if (this.flushAt === null) this.flushAt = now + 1500;
    return true;
  }
  take() {
    const now = this.now();
    if (this.flushAt === null || now < this.flushAt) return [];
    const batch = this.pending.filter((p) => now - p.at <= 5000);
    this.pending = [];
    this.flushAt = null;
    return batch;
  }
}
