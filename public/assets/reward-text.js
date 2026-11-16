const clean = (text) =>
  String(text || "")
    .replace(/[^\p{L}\p{N}\s.,'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const plain = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
export function interactionSpeech(event) {
  const name = clean(event.name) || "bạn";
  if (event.type === "like") return `Cảm ơn ${name} đã thả tim cho đường đua.`;
  if (event.type !== "gift") return clean(event.text);
  const quantity = Math.max(
    1,
    Math.min(100000, Math.floor(Number(event.quantity) || 1)),
  );
  let gift = clean(event.giftName) || "quà";
  const normalized = plain(gift);
  if (/rose|hoa hong/.test(normalized))
    return `Cảm ơn ${name} đã tặng ${quantity} bông hoa hồng.`;
  if (/^hoa(?:\s|$)|flower/.test(normalized))
    return `Cảm ơn ${name} đã tặng ${quantity} bông ${/^hoa(?:\s|$)/.test(normalized) ? gift.toLowerCase() : "hoa"}.`;
  if (/^qua(?: tang)?$/.test(normalized)) gift = "quà";
  return `Cảm ơn ${name} đã tặng ${quantity > 1 ? `${quantity} món quà${gift === "quà" ? "" : " " + gift}` : gift}.`;
}
