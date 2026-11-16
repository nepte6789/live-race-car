// Deterministic broadcast cuts: everyone in the pack can get screen time.
export function selectShot(
  racers,
  elapsed,
  mode = "auto",
  giftId = null,
  giftActive = false,
) {
  if (!racers.length) return { id: null, kind: "overview", label: "TOÀN CẢNH" };
  if (giftActive && racers.some((p) => p.id === giftId))
    return { id: giftId, kind: "side", label: "TIẾP SỨC ĐƯỜNG ĐUA" };
  if (mode === "overview")
    return {
      id: racers[Math.floor(racers.length / 2)].id,
      kind: "overview",
      label: "TOÀN CẢNH",
    };
  if (mode === "chase")
    return { id: racers[0].id, kind: "chase", label: "BÁM ĐUÔI" };
  const cut = Math.floor(Math.max(0, elapsed) / 8),
    turn = Math.floor(cut / 6),
    shot = cut % 6;
  const thirds = Math.max(1, Math.ceil(racers.length / 3));
  const groups = [
    racers.slice(0, thirds),
    racers.slice(thirds, thirds * 2),
    racers.slice(thirds * 2),
  ];
  const pool = groups[shot === 0 ? 0 : shot === 1 || shot === 4 ? 1 : 2];
  const driver = (pool.length ? pool : racers)[
    turn % (pool.length || racers.length)
  ];
  const boosted = racers.filter((p) => p.boosted);
  const kinds = ["chase", "side", "front", "chase", "overview", "side"];
  return {
    id:
      shot === 3 && boosted.length
        ? boosted[turn % boosted.length].id
        : driver.id,
    kind: kinds[shot],
    label: [
      "ĐẦU ĐOÀN",
      "TÂM ĐIỂM GIỮA ĐOÀN",
      "BỨT PHÁ CUỐI ĐOÀN",
      "TĂNG TỐC",
      "TOÀN CẢNH",
      "GÓC ĐUA CẬN CẢNH",
    ][shot],
  };
}
