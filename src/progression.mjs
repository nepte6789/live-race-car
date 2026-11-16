export const levelOf = (xp) => 1 + Math.floor(Math.max(0, xp || 0) / 50);
export const modelOf = (level) =>
  level >= 10 ? "formula" : level >= 5 ? "gt" : "sport";
export function honorsFor(users) {
  const list = [...users],
    honors = new Map(list.map((p) => [p.id, []]));
  const hearts = [...list]
    .filter((p) => p.likes > 0)
    .sort((a, b) => b.likes - a.likes || a.joined - b.joined)[0];
  if (hearts) honors.get(hearts.id).push("Chuyên gia thả tim");
  for (const p of list) {
    if (p.giftCount >= 10) honors.get(p.id).push("Đại hiệp tặng quà");
    if (p.maxGiftCoins >= 100) honors.get(p.id).push("Đại gia bá khí");
  }
  const quick = list
    .filter((p) => p.timedCorrect > 0)
    .sort(
      (a, b) =>
        a.responseTotalMs - b.responseTotalMs ||
        b.timedCorrect - a.timedCorrect ||
        a.joined - b.joined,
    )[0];
  if (quick) honors.get(quick.id).push("Nhanh tay lẹ mắt");
  return honors;
}
