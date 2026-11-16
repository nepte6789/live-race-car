// Server-authoritative arcade traffic: occupied lanes, safe passing and bounded travel.
export const LANES = [-6, -2, 2, 6];
export const CAR_WIDTH = 3.8;
export const MIN_GAP = 9;
const overlap = (a, b) => Math.abs(a - b) < CAR_WIDTH + 0.08;
const nearest = (lane) =>
  LANES.reduce(
    (best, x) => (Math.abs(x - lane) < Math.abs(best - lane) ? x : best),
    LANES[0],
  );
export const aheadDistance = (from, to, length) =>
  (((to - from) % length) + length) % length;
const claims = (p, lane) =>
  overlap(p.lane, lane) || overlap(p.targetLane, lane);
const intersects = (p, q) => {
  const amin = Math.min(p.lane, p.nextLane),
    amax = Math.max(p.lane, p.nextLane),
    bmin = Math.min(q.lane, q.nextLane),
    bmax = Math.max(q.lane, q.nextLane);
  return amin < bmax + CAR_WIDTH + 0.08 && amax > bmin - CAR_WIDTH - 0.08;
};
function frontAt(p, lane, list, length) {
  let best = null;
  for (const q of list) {
    if (q.id === p.id || !claims(q, lane)) continue;
    const gap = aheadDistance(p.progress, q.progress, length);
    if (!best || gap < best.gap) best = { car: q, gap };
  }
  return best;
}
function safeLane(p, lane, list, length) {
  for (const q of list) {
    if (q.id === p.id || !claims(q, lane)) continue;
    const front = aheadDistance(p.progress, q.progress, length),
      rear = aheadDistance(q.progress, p.progress, length),
      needFront = MIN_GAP + 4 + Math.max(0, p.desired - q.desired) * 1.6,
      needRear = MIN_GAP + 4 + Math.max(0, q.desired - p.desired) * 1.6;
    if (front < needFront || rear < needRear) return false;
  }
  return true;
}
export function advanceTraffic(users, dt, now, length, desiredSpeed) {
  const list = [...users]
    .filter((p) => !p.finishedAt || now - p.finishedAt < 1200)
    .map((p) => ({
      id: p.id,
      joined: p.joined || 0,
      progress: p.progress,
      lane: p.lane,
      targetLane: nearest(p.targetLane),
      desired: p.finishedAt ? 0 : desiredSpeed(p),
      finished: !!p.finishedAt,
      source: p,
    }));
  // Faster drivers reserve a safe adjacent lane first. Reservations block simultaneous swaps.
  const plans = [...list].sort(
    (a, b) => b.desired - a.desired || a.joined - b.joined,
  );
  for (const p of plans) {
    const source = p.source;
    if (
      p.finished ||
      Math.abs(p.lane - p.targetLane) > 0.08 ||
      now < (source.laneChangeUntil || 0)
    )
      continue;
    const lane = nearest(p.lane),
      index = LANES.indexOf(lane),
      front = frontAt(p, lane, list, length),
      blocked =
        front &&
        front.gap < Math.max(20, p.desired * 1.35) &&
        p.desired > front.car.desired + 0.5;
    const manual =
      source.requestedLane !== null &&
      source.requestedLane !== undefined &&
      now < (source.manualUntil || 0);
    const candidates = manual
      ? [nearest(source.requestedLane)]
      : blocked
        ? [LANES[index - 1], LANES[index + 1]].filter((x) => x !== undefined)
        : [];
    let chosen = null,
      best = -Infinity;
    for (const next of candidates) {
      if (
        next === lane ||
        Math.abs(next - lane) > 4.01 ||
        !safeLane(p, next, list, length)
      )
        continue;
      const head = frontAt(p, next, list, length),
        space = head ? head.gap : length,
        score = Math.min(space, 160) + (next < lane ? 3 : 0);
      if (score > best) {
        best = score;
        chosen = next;
      }
    }
    if (chosen !== null) {
      p.targetLane = chosen;
      source.targetLane = chosen;
      source.laneChangeUntil = now + 2100;
      if (manual) {
        source.requestedLane = null;
        source.manualUntil = 0;
      }
    }
  }
  const travel = new Map();
  for (const p of list) {
    const delta = Math.max(
      -2.8 * dt,
      Math.min(2.8 * dt, p.targetLane - p.lane),
    );
    p.nextLane = p.finished ? p.lane : p.lane + delta;
    travel.set(p.id, Math.max(0, p.desired * dt));
  }
  const constraints = [];
  for (const p of list) {
    if (p.finished) continue;
    for (const q of list) {
      if (p.id === q.id || !intersects(p, q)) continue;
      const gap = aheadDistance(p.progress, q.progress, length);
      if (gap < MIN_GAP + travel.get(p.id) + 0.01)
        constraints.push({
          from: p.id,
          to: q.id,
          room: Math.max(0, gap - MIN_GAP),
        });
    }
  }
  // Propagate braking through a queue, including queues that straddle the finish line.
  for (let pass = 0; pass < list.length; pass++) {
    let changed = false;
    for (const c of constraints) {
      const allowed = c.room + travel.get(c.to),
        current = travel.get(c.from);
      if (current > allowed + 1e-8) {
        travel.set(c.from, allowed);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const p of list) {
    if (p.finished) continue;
    const source = p.source,
      moved = travel.get(p.id),
      lateral = p.nextLane - p.lane;
    source.progress += moved;
    source.lane = p.nextLane;
    source.targetLane = p.targetLane;
    source.speed = dt > 0 ? moved / dt : 0;
    source.steering =
      dt > 0
        ? Math.max(
            -0.14,
            Math.min(0.14, Math.atan2(lateral / dt, Math.max(source.speed, 8))),
          )
        : 0;
  }
}
