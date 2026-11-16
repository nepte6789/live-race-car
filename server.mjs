import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { WebSocketServer } from "ws";
import { Race, QUESTIONS } from "./src/game.mjs";
import { Bots } from "./src/bots.mjs";
import { resolveLiveUser } from "./src/live-user.mjs";
import {
  buildTikTokConnectionOptions,
  explainTikTokConnectionError,
} from "./src/tiktok-config.mjs";
import { AutoConnect, channelName } from "./src/auto-connect.mjs";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
if (fs.existsSync(path.join(ROOT, ".env")) && process.loadEnvFile)
  process.loadEnvFile(path.join(ROOT, ".env"));
const PORT = Number(process.env.PORT) || 3000,
  HOST = "127.0.0.1",
  PUBLIC = path.join(ROOT, "public");
const game = new Race(),
  bots = new Bots(game);
let connection = null,
  generation = 0,
  updateTimer = null,
  sequence = 0;
let live = {
  status: "idle",
  channel: "",
  roomId: "",
  error: "",
  comments: 0,
  likes: 0,
  gifts: 0,
  joins: 0,
};
const aliases = new Map(),
  logs = [];
function log(text) {
  const line =
    new Date().toLocaleTimeString("vi-VN") +
    " · " +
    String(text).slice(0, 1000);
  logs.push(line);
  if (logs.length > 50) logs.shift();
  console.log(line);
  changed();
}
function envelope() {
  return {
    t: "state",
    game: game.snapshot(),
    live: { ...live },
    bots: {
      enabled: bots.enabled,
      count: bots.target,
      active: [...game.users.values()].filter(
        (p) => p.demo && p.id.startsWith("bot-"),
      ).length,
    },
    auto: auto.state,
    hasApiKey: !!process.env.EULERSTREAM_API_KEY,
    logs,
  };
}
function changed() {
  if (updateTimer) return;
  updateTimer = setTimeout(() => {
    updateTimer = null;
    const state = JSON.stringify(envelope());
    for (const c of wss.clients)
      if (c.readyState === 1 && c.bufferedAmount < 1024 * 1024) c.send(state);
  }, 100);
}
function valid(req) {
  if (![`localhost:${PORT}`, `127.0.0.1:${PORT}`].includes(req.headers.host))
    return false;
  if (!req.headers.origin) return true;
  try {
    return [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`].includes(
      new URL(req.headers.origin).origin,
    );
  } catch {
    return false;
  }
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};
const server = http.createServer((req, res) => {
  if (!valid(req)) {
    res.writeHead(403).end();
    return;
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/questions") {
    res
      .writeHead(200, {
        "Content-Type": mime[".json"],
        "Cache-Control": "no-store",
      })
      .end(JSON.stringify(QUESTIONS));
    return;
  }
  if (url.pathname === "/vendor/three.module.js") {
    res.writeHead(200, {
      "Content-Type": mime[".js"],
      "Cache-Control": "public,max-age=86400",
    });
    fs.createReadStream(
      path.join(ROOT, "node_modules/three/build/three.module.js"),
    ).pipe(res);
    return;
  }
  let relative;
  try {
    relative = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = path.resolve(
    PUBLIC,
    "." + (relative === "/" ? "/control.html" : relative),
  );
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
  });
});
const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 8192,
  verifyClient: ({ req }) => valid(req),
});
async function disconnect() {
  generation++;
  const old = connection;
  connection = null;
  live.status = "idle";
  live.error = "";
  changed();
  try {
    await old?.disconnect();
  } catch {}
}
async function connect(value) {
  const channel = channelName(value);
  await disconnect();
  const token = ++generation;
  live = { ...live, status: "connecting", channel, error: "" };
  changed();
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import(
    "tiktok-live-connector"
  );
  if (token !== generation) return;
  const c = (connection = new TikTokLiveConnection(
    channel,
    buildTikTokConnectionOptions(),
  ));
  const on = (event, fn) => {
    if (event)
      c.on(event, (data) => {
        if (token !== generation) return;
        try {
          fn(data);
          changed();
        } catch (error) {
          log("Sự kiện LIVE: " + error.message);
        }
      });
  };
  const user = (data) => resolveLiveUser(data, aliases),
    id = (d, type) =>
      d.msgId || d.common?.msgId
        ? type + ":" + String(d.msgId || d.common.msgId)
        : undefined;
  on(WebcastEvent.MEMBER, (d) => {
    live.joins++;
    const p = user(d);
    if (p) game.member(p, id(d, "member"));
  });
  on(WebcastEvent.CHAT, (d) => {
    live.comments++;
    const p = user(d);
    if (p)
      game.comment(
        p,
        [d.comment, d.text, d.content, d.comment?.text].find(
          (x) => typeof x === "string",
        ) || "",
        id(d, "chat"),
      );
  });
  on(WebcastEvent.LIKE, (d) => {
    const count = Number(d.likeCount || d.count || 1);
    live.likes += count;
    const p = user(d);
    if (p) game.like(p, count, id(d, "like"));
  });
  on(WebcastEvent.GIFT, (d) => {
    const p = user(d);
    if (!p) return;
    const gift = d.giftDetails || d.gift || {},
      streak = Number(d.giftType ?? gift.giftType) === 1;
    game.gift(p, {
      giftId: d.giftId || gift.id,
      name: d.giftName || gift.giftName || gift.name || "Quà tặng",
      coins: d.diamondCount || gift.diamondCount || 1,
      count: d.repeatCount || 1,
      streakId: streak
        ? String(d.groupId || d.repeatId || "combo")
        : String(d.msgId || d.common?.msgId || ++sequence),
      repeatEnd: streak ? !!d.repeatEnd : true,
      eventId: id(d, "gift"),
    });
    live.gifts++;
  });
  on(WebcastEvent.FOLLOW, (d) => {
    const p = user(d);
    if (p) game.follow(p, id(d, "follow"));
  });
  on(ControlEvent.DISCONNECTED, () => {
    live.status = "disconnected";
    auto.disconnected();
  });
  on(ControlEvent.ERROR, (e) => {
    log(
      "TikTok: " +
        String(e?.info || e?.message || e).replaceAll(
          process.env.EULERSTREAM_API_KEY || "__NO_KEY__",
          "[key]",
        ),
    );
  });
  try {
    const result = await c.connect();
    if (token !== generation) {
      await c.disconnect();
      return;
    }
    live.status = "connected";
    live.roomId = String(result.roomId || "");
    log("Đã kết nối @" + channel);
  } catch (error) {
    if (token !== generation) return;
    try {
      await c.disconnect();
    } catch {}
    connection = null;
    live.status = "error";
    live.error = explainTikTokConnectionError(error).replaceAll(
      process.env.EULERSTREAM_API_KEY || "__NO_KEY__",
      "[key]",
    );
    log(live.error);
  }
  changed();
}
const auto = new AutoConnect({
  connect,
  getStatus: () => ({
    status:
      connection?.isConnected === false && live.status === "connected"
        ? "disconnected"
        : live.status,
    uniqueId: live.channel,
    error: live.error,
  }),
  onState: changed,
});
async function command(m) {
  switch (m.cmd) {
    case "connect":
      auto.setTarget(m.channel, { immediate: true });
      break;
    case "disconnect":
      auto.stop();
      await disconnect();
      break;
    case "configure":
      game.configure(m.config || {});
      break;
    case "start":
      if (game.phase === "finished") game.reset();
      game.start();
      break;
    case "nextQuiz":
      if (game.phase === "racing") game.nextQuiz();
      break;
    case "pause":
      game.pause();
      break;
    case "reset":
      game.reset({ keepPlayers: !m.clearPlayers });
      break;
    case "bots":
      bots.configure(!!m.on, Number(m.count) || 12);
      break;
    case "clearDemo":
      bots.clear();
      break;
    case "simulate": {
      const p = {
        id: "trial-" + String(m.name || "Người thử").slice(0, 60),
        name: String(m.name || "Người thử"),
        demo: true,
      };
      if (m.kind === "member") game.member(p);
      else if (m.kind === "like") game.like(p, Number(m.count) || 10);
      else if (m.kind === "gift")
        game.gift(p, {
          giftId: "trial",
          name:
            Number(m.coins) >= 100
              ? "Vòng xoáy thử"
              : Number(m.coins) >= 50
                ? "Tên lửa thử"
                : Number(m.coins) >= 10
                  ? "Khiên thử"
                  : "Hoa hồng thử",
          coins: Number(m.coins) || 1,
          count: Number(m.count) || 1,
          streakId: String(++sequence),
        });
      else if (m.kind === "follow") game.follow(p);
      else game.comment(p, String(m.text || ""));
      break;
    }
    default:
      throw Error("Lệnh không hợp lệ");
  }
  changed();
}
wss.on("connection", (c, req) => {
  c.role =
    new URL(req.url, "http://localhost").searchParams.get("role") === "control"
      ? "control"
      : "overlay";
  c.alive = true;
  c.on("pong", () => (c.alive = true));
  c.on("error", () => {});
  c.send(JSON.stringify(envelope()));
  c.on("message", async (raw) => {
    try {
      const m = JSON.parse(raw);
      if (m.t === "ping") {
        c.send(JSON.stringify({ t: "pong" }));
        return;
      }
      if (m.t === "control" && c.role === "control") await command(m);
    } catch (error) {
      c.send(JSON.stringify({ t: "error", message: error.message }));
    }
  });
});
const tick = setInterval(() => {
    game.tick();
    bots.tick();
    changed();
  }, 50),
  heartbeat = setInterval(() => {
    for (const c of wss.clients) {
      if (!c.alive) c.terminate();
      else {
        c.alive = false;
        c.ping();
      }
    }
  }, 20000);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Cổng ${PORT} đang được ứng dụng khác dùng. Dừng ứng dụng đó hoặc đặt PORT=3001 trong .env.`
      : error.message,
  );
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  log(
    `ĐƯỜNG ĐUA LIVE · Điều khiển http://localhost:${PORT}/ · Overlay http://localhost:${PORT}/overlay.html`,
  );
  if (process.env.TIKTOK_CHANNEL)
    auto.setTarget(process.env.TIKTOK_CHANNEL, { immediate: true });
  else if (process.stdin.isTTY) {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    prompt.question(
      "Link TikTok / @username (Enter để chạy thử): ",
      (answer) => {
        prompt.close();
        if (answer.trim())
          try {
            auto.setTarget(answer, { immediate: true });
          } catch (e) {
            log(e.message);
          }
      },
    );
  }
});
async function stop() {
  clearInterval(tick);
  clearInterval(heartbeat);
  clearTimeout(updateTimer);
  auto.stop();
  await disconnect();
  for (const c of wss.clients) c.terminate();
  server.close(() => process.exit());
  setTimeout(() => process.exit(), 1000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
