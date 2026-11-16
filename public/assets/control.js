const $ = (id) => document.getElementById(id);
let state = null,
  bank = [],
  noticeTimer;
const send = (cmd, data = {}) =>
  socket.send(JSON.stringify({ t: "control", cmd, ...data }));
function notice(text) {
  $("notice").textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("notice").textContent = ""), 9000);
}
const names = {
  lobby: "Sảnh chờ",
  countdown: "Đếm ngược",
  racing: "Đang đua",
  paused: "Tạm dừng",
  finished: "Về đích",
};
function render(m) {
  state = m;
  const g = m.game;
  $("phaseStatus").textContent = names[g.phase];
  $("population").textContent = g.racers.length + " tay đua";
  $("roundTitle").textContent = `Ván ${g.round} · ${g.config.laps} vòng`;
  $("liveStatus").textContent =
    m.live.status === "connected"
      ? `TikTok @${m.live.channel} ✓`
      : "TikTok: " +
        ({
          idle: "chưa kết nối",
          connecting: "đang kết nối",
          error: "lỗi",
          disconnected: "mất kết nối",
        }[m.live.status] || m.live.status);
  $("liveStatus").className = m.live.status === "connected" ? "ok" : "";
  $("keyStatus").textContent = m.hasApiKey
    ? "Đã nạp API key EulerStream trên server"
    : "Chưa có API key EulerStream; chỉ cần nếu dịch vụ ký yêu cầu.";
  if (m.live.channel && !$("channel").value)
    $("channel").value = "@" + m.live.channel;
  $("start").disabled = !["lobby", "finished"].includes(g.phase);
  $("pause").disabled = g.phase === "lobby";
  $("pause").textContent = g.phase === "paused" ? "▶ Tiếp tục" : "Ⅱ Tạm dừng";
  $("bots").textContent = m.bots.enabled ? "Tắt người thử" : "Bật người thử";
  $("leader").textContent = g.racers[0]?.name || "Chưa có";
  const configKeys = [
    "laps",
    "quizSeconds",
    "shieldCoins",
    "attackCoins",
    "spinCoins",
    "followBase",
    "followGoal",
  ];
  for (const key of configKeys)
    if (!$("settings").contains(document.activeElement))
      $(key).value = g.config[key];
  $("autoNext").checked = g.config.autoNext;
  if (document.activeElement !== $("camera"))
    $("camera").value = g.config.camera;
  for (const key of [
    "laps",
    "quizSeconds",
    "shieldCoins",
    "attackCoins",
    "spinCoins",
  ])
    $(key).disabled = !["lobby", "finished"].includes(g.phase);
  $("currentQuestion").textContent = g.quiz?.prompt || "Đang chờ ván";
  const q = bank.find((q) => q.prompt === g.quiz?.prompt);
  $("currentAnswer").textContent = q
    ? `Đáp án: ${"ABCD"[q.answer]}. ${q.options[q.answer]}`
    : "";
  $("nextQuiz").disabled = g.phase !== "racing" || !g.quiz;
  $("rankings").replaceChildren();
  for (const p of g.racers) {
    const row = document.createElement("div");
    row.className = "race-row";
    for (const text of [
      "#" + p.rank,
      p.name,
      `V${p.lap}/${g.config.laps}`,
      Math.round(p.speed * 3.6) + " km/h",
      `${p.xp} XP · Cấp ${p.level}`,
      p.finishedAt
        ? "Đã về đích"
        : p.spinning
          ? "Xoay vòng"
          : p.shielded
            ? "Khiên"
            : p.boosted
              ? "Nitro"
              : "Đang đua",
    ]) {
      const cell = document.createElement("span");
      cell.textContent = text;
      row.append(cell);
    }
    $("rankings").append(row);
  }
  $("feed").replaceChildren();
  for (const e of [...g.events].reverse()) {
    const p = document.createElement("p");
    p.textContent = e.text;
    $("feed").append(p);
  }
  $("logs").textContent = m.logs.join("\n");
}
const socket = new LiveSocket(
  "control",
  (m) => {
    if (m.t === "state") render(m);
    if (m.t === "error") notice(m.message);
  },
  (status) => {
    $("serverStatus").textContent =
      status === "connected" ? "Server: đang chạy" : "Server: đang nối lại";
    $("serverStatus").className = status === "connected" ? "ok" : "";
    if (status !== "connected")
      $("liveStatus").textContent = "TikTok: chờ server xác nhận";
  },
);
$("connect").onclick = () => send("connect", { channel: $("channel").value });
$("disconnect").onclick = () => send("disconnect");
$("start").onclick = () => send("start");
$("pause").onclick = () => send("pause");
$("reset").onclick = () => send("reset");
$("clearAll").onclick = () => {
  if (confirm("Xóa toàn bộ người và tiến độ ván hiện tại?"))
    send("reset", { clearPlayers: true });
};
$("camera").onchange = () =>
  send("configure", { config: { camera: $("camera").value } });
$("settings").onsubmit = (e) => {
  e.preventDefault();
  const config = Object.fromEntries(
    [
      "laps",
      "quizSeconds",
      "shieldCoins",
      "attackCoins",
      "spinCoins",
      "followBase",
      "followGoal",
    ]
      .filter((k) => !$(k).disabled)
      .map((k) => [k, Number($(k).value)]),
  );
  config.autoNext = $("autoNext").checked;
  send("configure", { config });
};
$("comment").onclick = () =>
  send("simulate", {
    kind: "comment",
    name: $("simName").value,
    text: $("simText").value,
  });
$("simText").onkeydown = (e) => {
  if (e.key === "Enter") $("comment").click();
};
$("correct").onclick = () => {
  const q = bank.find((q) => q.prompt === state?.game.quiz?.prompt);
  if (q)
    send("simulate", {
      kind: "comment",
      name: $("simName").value,
      text: "ABCD"[q.answer],
    });
};
for (const kind of ["like", "follow"])
  $(kind).onclick = () =>
    send("simulate", { kind, name: $("simName").value, count: 100 });
for (const button of document.querySelectorAll("[data-gift]"))
  button.onclick = () =>
    send("simulate", {
      kind: "gift",
      name: $("simName").value,
      coins: Number(button.dataset.gift),
      count: 1,
    });
$("bots").onclick = () =>
  send("bots", {
    on: !state?.bots.enabled,
    count: Number($("botCount").value),
  });
$("clearDemo").onclick = () => send("clearDemo");
$("nextQuiz").onclick = () => send("nextQuiz");
setInterval(() => {
  if (!state) return;
  const g = state.game,
    a = state.auto;
  const seconds = Math.floor(g.elapsed);
  $("elapsed").textContent =
    String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0");
  $("quizStatus").textContent = g.quiz
    ? `${g.quiz.phase === "question" ? "Trả lời" : "Đáp án"} · ${Math.max(0, Math.ceil((g.quiz.deadline - (g.phase === "paused" ? g.effectiveTime : Date.now())) / 1000))} giây · ${g.quiz.answered} đã chốt`
    : "";
  $("autoStatus").textContent = a.enabled
    ? a.phase === "connected"
      ? "Kết nối ổn định · kiểm tra mỗi 2 phút"
      : `@${a.target} · ${a.phase === "connecting" ? "đang kết nối" : `thử lại sau ${Math.max(0, Math.ceil(((a.nextAttemptAt || Date.now()) - Date.now()) / 1000))} giây`}` +
        (a.error ? " · " + a.error : "")
    : "Tự thử lại sau 2 phút khi mất kết nối.";
}, 250);
fetch("/api/questions")
  .then((r) => r.json())
  .then((list) => {
    bank = list;
    for (const q of list) {
      const el = document.createElement("div");
      el.className = "bank-item";
      const title = document.createElement("b"),
        answers = document.createElement("span");
      title.textContent = q.prompt;
      answers.textContent =
        q.options.map((o, i) => `${"ABCD"[i]}. ${o}`).join(" · ") +
        ` → Đúng ${"ABCD"[q.answer]}`;
      el.append(title, answers);
      $("bank").append(el);
    }
  })
  .catch(() => notice("Không tải được bộ câu hỏi"));
