import * as THREE from "/vendor/three.module.js";
import { TRACK_POINTS } from "./track.js";
const $ = (id) => document.getElementById(id),
  stage = $("stage");
function fit() {
  stage.style.transform = `translate(-50%,-50%) scale(${Math.min(innerWidth / 1080, innerHeight / 1920)})`;
}
addEventListener("resize", fit);
fit();
const curve = new THREE.CatmullRomCurve3(
    TRACK_POINTS.map((p) => new THREE.Vector3(...p)),
    true,
    "catmullrom",
    0.32,
  ),
  UP = new THREE.Vector3(0, 1, 0),
  RIGHT = new THREE.Vector3();
let renderer,
  scene,
  camera,
  webgl = true;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(720, 1280, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  $("scene").append(renderer.domElement);
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x261137, 0.0036);
  camera = new THREE.PerspectiveCamera(57, 1080 / 1920, 0.2, 1500);
  scene.add(new THREE.HemisphereLight(0x8fdcff, 0x410854, 2.0));
  const sun = new THREE.DirectionalLight(0xffd8f6, 2.3);
  sun.position.set(80, 180, -60);
  scene.add(sun);
} catch (e) {
  webgl = false;
  $("renderWarning").hidden = false;
  $("renderWarning").textContent =
    "Trình duyệt chưa bật đồ họa 3D. Hãy bật tăng tốc phần cứng trong Chrome hoặc OBS, rồi tải lại. Luật đua và bảng điều khiển vẫn chạy.";
}
function seeded(seed) {
  let n = seed;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
const rand = seeded(6819);
function frameAt(t) {
  const pos = curve.getPointAt(((t % 1) + 1) % 1),
    tangent = curve.getTangentAt(((t % 1) + 1) % 1).normalize(),
    right = new THREE.Vector3().crossVectors(UP, tangent).normalize();
  return { pos, tangent, right, yaw: Math.atan2(tangent.x, tangent.z) };
}
function roadStrip(offset, width, material, lift = 0) {
  const vertices = [],
    uvs = [],
    indices = [],
    n = 700;
  for (let i = 0; i <= n; i++) {
    const { pos, right } = frameAt(i / n);
    for (const edge of [-0.5, 0.5]) {
      const p = pos.clone().addScaledVector(right, offset + edge * width);
      vertices.push(p.x, p.y + lift, p.z);
      uvs.push(edge + 0.5, i / 8);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  scene.add(m);
  return m;
}
const cityRand = seeded(1945);
function windowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#090a19";
  x.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 32; row++)
    for (let col = 0; col < 10; col++) {
      const lit = cityRand() > 0.31;
      x.fillStyle = lit
        ? cityRand() > 0.5
          ? "#d6f5ff"
          : "#ffe4ad"
        : "#111026";
      x.fillRect(col * 12 + 3, row * 8 + 2, 5, 4);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
function buildCity() {
  const road = new THREE.MeshStandardMaterial({
    color: 0x28304b,
    roughness: 0.55,
    metalness: 0.32,
    side: THREE.DoubleSide,
  });
  roadStrip(0, 19, road);
  roadStrip(-10, 0.34, new THREE.MeshBasicMaterial({ color: 0x21d8ff }), 0.08);
  roadStrip(10, 0.34, new THREE.MeshBasicMaterial({ color: 0xff35ba }), 0.08);
  roadStrip(
    -10.7,
    0.7,
    new THREE.MeshStandardMaterial({ color: 0x344a64 }),
    -0.4,
  );
  roadStrip(
    10.7,
    0.7,
    new THREE.MeshStandardMaterial({ color: 0x344a64 }),
    -0.4,
  );
  const dashCount = 300,
    dashes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.12, 0.04, 2.3),
      new THREE.MeshBasicMaterial({ color: 0xc4cee9 }),
      dashCount * 3,
    ),
    dummy = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < dashCount; i++)
    for (const lane of [-4, 0, 4]) {
      const f = frameAt(i / dashCount);
      dummy.position.copy(f.pos).addScaledVector(f.right, lane);
      dummy.position.y += 0.04;
      dummy.rotation.set(0, f.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dashes.setMatrixAt(k++, dummy.matrix);
    }
  scene.add(dashes);
  const poles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x1b2541 }),
    100,
  );
  for (let i = 0; i < 100; i++) {
    const f = frameAt(i / 100);
    dummy.position.set(f.pos.x, f.pos.y / 2 - 2, f.pos.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(2, f.pos.y + 4, 2);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
  }
  scene.add(poles);
  const texture = windowTexture(),
    buildings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x24223b,
        map: texture,
        emissive: 0xc0d2ff,
        emissiveMap: texture,
        emissiveIntensity: 1.35,
        roughness: 0.8,
      }),
      450,
    ),
    samples = Array.from({ length: 170 }, (_, i) => curve.getPointAt(i / 170));
  let added = 0,
    attempts = 0;
  while (added < 450 && attempts++ < 20000) {
    const x = (rand() - 0.5) * 1350,
      z = (rand() - 0.5) * 1350;
    if (samples.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 38 ** 2))
      continue;
    const h = 15 + rand() ** 1.4 * 135;
    dummy.position.set(x, h / 2 - 5, z);
    dummy.rotation.set(0, (Math.round(rand() * 3) * Math.PI) / 2, 0);
    dummy.scale.set(10 + rand() * 22, h, 10 + rand() * 22);
    dummy.updateMatrix();
    buildings.setMatrixAt(added, dummy.matrix);
    buildings.setColorAt(
      added,
      new THREE.Color().setHSL(
        0.62 + rand() * 0.15,
        0.16,
        0.35 + rand() * 0.25,
      ),
    );
    added++;
  }
  buildings.count = added;
  scene.add(buildings);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2200, 2200),
    new THREE.MeshStandardMaterial({ color: 0x171127, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -5;
  scene.add(ground);
  const grid = new THREE.GridHelper(1800, 60, 0x2c2753, 0x211932);
  grid.position.y = -4.9;
  scene.add(grid);
  const start = frameAt(0),
    finishTex = document.createElement("canvas");
  finishTex.width = 128;
  finishTex.height = 32;
  const fx = finishTex.getContext("2d");
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 16; x++) {
      fx.fillStyle = (x + y) % 2 ? "#111329" : "#ffffff";
      fx.fillRect(x * 8, y * 16, 8, 16);
    }
  const ft = new THREE.CanvasTexture(finishTex);
  const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(19, 4),
    new THREE.MeshBasicMaterial({ map: ft, side: THREE.DoubleSide }),
  );
  finish.rotation.set(-Math.PI / 2, 0, -start.yaw);
  finish.position.copy(start.pos);
  finish.position.y += 0.09;
  scene.add(finish);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 12, 0.55),
      new THREE.MeshStandardMaterial({
        color: 0x75b7e9,
        emissive: 0x183e74,
        emissiveIntensity: 0.8,
      }),
    );
    post.position.copy(start.pos).addScaledVector(start.right, side * 11);
    post.position.y += 6;
    scene.add(post);
  }
  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(22, 0.7, 0.7),
    new THREE.MeshBasicMaterial({ color: 0x52f1ff }),
  );
  gate.position.copy(start.pos);
  gate.position.y += 12;
  gate.rotation.y = start.yaw;
  scene.add(gate);
  for (let i = 0; i < 14; i++) {
    const f = frameAt(i / 14 + 0.02),
      sign = new THREE.Mesh(
        new THREE.BoxGeometry(11, 4, 0.3),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xd330c7 : 0x0d9ed5 }),
      );
    sign.position.copy(f.pos).addScaledVector(f.right, i % 2 ? 15 : -15);
    sign.position.y += 6;
    sign.rotation.y = f.yaw;
    scene.add(sign);
  }
}
const MAX = 100,
  instances = {};
let shadows;
if (webgl) {
  buildCity();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.65,
    roughness: 0.25,
  });
  function inst(name, geometry, mat, count = MAX) {
    const m = new THREE.InstancedMesh(geometry, mat, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    scene.add(m);
    instances[name] = m;
    return m;
  }
  // Beveled sports-car silhouette, shared by every instanced driver.
  const outline = new THREE.Shape();
  outline.moveTo(-1.35, -3);
  outline.lineTo(1.35, -3);
  outline.lineTo(1.65, -2.2);
  outline.lineTo(1.55, 2.25);
  outline.lineTo(1.15, 3);
  outline.lineTo(-1.15, 3);
  outline.lineTo(-1.55, 2.25);
  outline.lineTo(-1.65, -2.2);
  outline.closePath();
  const shell = new THREE.ExtrudeGeometry(outline, {
    depth: 0.65,
    bevelEnabled: true,
    bevelSize: 0.13,
    bevelThickness: 0.12,
    bevelSegments: 3,
    steps: 1,
  });
  shell.rotateX(Math.PI / 2);
  shell.translate(0, 0.32, 0);
  inst("body", shell, material);
  // A tapered cabin with sloped windscreens instead of a rectangular box.
  const cabin = new THREE.BufferGeometry();
  cabin.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -1.2, -0.45, -1.5, 1.2, -0.45, -1.5, 1.2, -0.45, 1.4, -1.2, -0.45, 1.4,
        -0.92, 0.45, -0.9, 0.92, 0.45, -0.9, 0.92, 0.45, 0.55, -0.92, 0.45,
        0.55,
      ],
      3,
    ),
  );
  cabin.setIndex([
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4,
    5, 6, 4, 6, 7, 3, 2, 1, 3, 1, 0,
  ]);
  const faces = cabin.index.array;
  for (let face = 0; face < faces.length; face += 3) {
    const first = faces[face];
    faces[face] = faces[face + 2];
    faces[face + 2] = first;
  }
  cabin.computeVertexNormals();
  inst("roof", new THREE.BoxGeometry(1.88, 0.08, 1.5), material);
  inst(
    "stripes",
    new THREE.BoxGeometry(0.22, 0.035, 1.65),
    new THREE.MeshStandardMaterial({ color: 0xf1f6ff }),
    MAX * 2,
  );
  inst(
    "grille",
    new THREE.BoxGeometry(1.6, 0.24, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x07101b }),
  );
  inst(
    "hubs",
    new THREE.CylinderGeometry(0.4, 0.4, 0.54, 8),
    new THREE.MeshStandardMaterial({
      color: 0xbac9dd,
      metalness: 0.9,
      roughness: 0.22,
    }),
    MAX * 4,
  );
  inst(
    "wingPosts",
    new THREE.BoxGeometry(0.13, 0.45, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x101725 }),
    MAX * 2,
  );
  inst("hood", new THREE.BoxGeometry(3, 0.18, 2), material);
  inst(
    "cabin",
    cabin,
    new THREE.MeshStandardMaterial({
      color: 0x091a30,
      metalness: 0.85,
      roughness: 0.1,
    }),
  );
  inst("spoiler", new THREE.BoxGeometry(3.7, 0.12, 0.65), material);
  inst(
    "wheels",
    new THREE.CylinderGeometry(0.65, 0.65, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0x06080e, roughness: 0.8 }),
    MAX * 4,
  );
  inst(
    "lights",
    new THREE.BoxGeometry(0.65, 0.2, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xd9fbff }),
    MAX * 2,
  );
  inst(
    "rearLights",
    new THREE.BoxGeometry(0.7, 0.18, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xff2966 }),
    MAX * 2,
  );
  inst(
    "trail",
    new THREE.BoxGeometry(1.8, 0.25, 4),
    new THREE.MeshBasicMaterial({
      color: 0x65c8ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  inst(
    "shield",
    new THREE.SphereGeometry(4.3, 16, 10),
    new THREE.MeshBasicMaterial({
      color: 0x45e8ff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  inst(
    "shieldWire",
    new THREE.SphereGeometry(4.4, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0x69f7ff,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
      depthWrite: false,
    }),
  );
}
let state = null,
  offset = 0,
  lastStateAt = 0,
  round = 0,
  lastEvent = 0,
  focusId = null,
  focusUntil = 0,
  toastUntil = 0,
  effectUntil = 0,
  focusRacer = null,
  spokenQuiz = "",
  soundOn = false,
  music = null,
  audio = null;
const projectiles = [];
const labels = new Map(),
  positions = new Map(),
  color = new THREE.Color(),
  dummy = new THREE.Object3D(),
  rootMatrix = new THREE.Matrix4(),
  local = new THREE.Matrix4(),
  quat = new THREE.Quaternion(),
  world = new THREE.Vector3();
function avatar(p) {
  const el = document.createElement("span");
  el.className = "avatar";
  el.textContent = (p.name || "?")
    .split(/\s+/)
    .slice(-2)
    .map((s) => s[0])
    .join("");
  if (p.avatar) {
    const im = new Image();
    im.src = p.avatar;
    im.referrerPolicy = "no-referrer";
    im.alt = p.name;
    im.onerror = () => im.remove();
    el.replaceChildren(im);
  }
  return el;
}
const voice = new RewardVoice({
  onSpeaking: (yes) => music?.duck(yes),
  onWarning: (s) => ($("sound").textContent = s),
});
function showEvent(e) {
  if (webgl && e.type === "gift" && e.target) {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 2, 8),
      new THREE.MeshBasicMaterial({
        color: e.action === "spin" ? 0xd991ff : 0x75efff,
      }),
    );
    scene.add(mesh);
    projectiles.push({
      mesh,
      from: e.userId,
      to: e.target,
      at: performance.now(),
      blocked: e.blocked,
    });
  }

  $("ticker").textContent = e.text;
  if (["gift", "correct", "boost", "winner", "welcome"].includes(e.type)) {
    if (e.type === "gift") {
      focusId = e.userId;
      focusUntil = Date.now() + 5000;
    }
    $("giftToast").replaceChildren(avatar(e));
    const text = document.createElement("span");
    text.textContent = e.text;
    $("giftToast").append(text);
    $("giftToast").hidden = false;
    toastUntil = Date.now() + 4500;
    if (soundOn && ["gift", "winner", "welcome"].includes(e.type))
      voice.enqueue(
        e.type === "gift"
          ? `Cảm ơn ${e.name} đã tiếp sức cho đường đua.`
          : e.text,
        1,
      );
  }
}
function render(m) {
  state = m;
  offset = m.game.serverTime - Date.now();
  lastStateAt = performance.now();
  const g = m.game;
  if (g.round !== round) {
    round = g.round;
    positions.clear();
    for (const projectile of projectiles) {
      scene.remove(projectile.mesh);
      projectile.mesh.geometry.dispose();
      projectile.mesh.material.dispose();
    }
    projectiles.length = 0;
    voice.clear();
    spokenQuiz = "";
    lastEvent = 0;
    for (const el of labels.values()) el.remove();
    labels.clear();
  }
  for (const e of g.events.filter((e) => e.id > lastEvent)) showEvent(e);
  if (g.events.length)
    lastEvent = Math.max(lastEvent, ...g.events.map((e) => e.id));
  $("connection").textContent =
    m.live.status === "connected" ? "● @" + m.live.channel : "● LOCAL";
  $("population").textContent = g.racers.length + " TAY ĐUA";
  $("followCount").textContent = `${g.followCount} / ${g.config.followGoal}`;
  $("followBar").style.width =
    Math.min(100, (g.followCount / g.config.followGoal) * 100) + "%";
  $("lap").textContent = `VÒNG ${g.racers[0]?.lap || 1} / ${g.config.laps}`;
  $("modeStatus").textContent =
    m.live.status === "connected"
      ? `TIKTOK LIVE · ${m.live.comments} BÌNH LUẬN`
      : g.racers.some((p) => p.demo)
        ? "MÔ PHỎNG · KHÔNG PHẢI NGƯỜI XEM TIKTOK"
        : "CHƯA KẾT NỐI TIKTOK LIVE";
  $("ranking").replaceChildren();
  for (const p of g.racers.slice(0, 10)) {
    const li = document.createElement("li"),
      rank = document.createElement("small"),
      name = document.createElement("span"),
      lap = document.createElement("b");
    rank.textContent = String(p.rank).padStart(2, "0");
    name.className = "rank-name";
    name.textContent = p.name;
    lap.textContent = p.finishedAt ? "🏁" : `V${p.lap}`;
    li.append(rank, avatar(p), name, lap);
    $("ranking").append(li);
  }
  $("chat").replaceChildren();
  for (const p of g.chat.slice(-3)) {
    const row = document.createElement("div");
    row.className = "chat-row";
    const body = document.createElement("div"),
      name = document.createElement("b"),
      text = document.createElement("span");
    body.className = "text";
    name.textContent = p.name;
    text.textContent = p.text;
    body.append(name, text);
    row.append(avatar(p), body);
    $("chat").append(row);
  }
  const q = g.quiz;
  $("answers").replaceChildren();
  if (q) {
    $("prompt").textContent = q.prompt;
    for (let i = 0; i < 4; i++) {
      const answer = document.createElement("div"),
        letter = document.createElement("b"),
        text = document.createElement("span");
      answer.className =
        "answer" + (q.phase === "reveal" && q.answer === i ? " correct" : "");
      letter.textContent = "ABCD"[i];
      text.textContent = q.options[i];
      answer.append(letter, text);
      $("answers").append(answer);
    }
    $("answered").textContent = q.answered + " ĐÃ CHỐT";
    $("explanation").hidden = q.phase !== "reveal";
    $("explanation").textContent = q.explanation || "";
    if (soundOn && g.phase === "racing") {
      const key = g.round + ":" + q.id + ":" + q.phase;
      if (key !== spokenQuiz) {
        spokenQuiz = key;
        voice.enqueue(
          q.phase === "question"
            ? `Câu hỏi. ${q.prompt} Bình luận A, B, C hoặc D để trả lời.`
            : `Đáp án ${"ABCD"[q.answer]}, ${q.options[q.answer]}. ${q.explanation}`,
          2,
          { key, expiresAt: q.deadline - offset, interrupt: true },
        );
      }
    }
  } else {
    $("prompt").textContent =
      "Thả tim hoặc bình luận để lên xe. Sẵn sàng bứt tốc?";
    $("answered").textContent = "";
    $("explanation").hidden = true;
  }
}
function carTransform(p, now, dt) {
  const predicted =
    p.progress +
    (state.game.phase === "racing" && !p.finishedAt
      ? p.speed * Math.min(0.3, (performance.now() - lastStateAt) / 1000)
      : 0);
  let progress = positions.get(p.id);
  if (progress === undefined || Math.abs(progress - predicted) > 400)
    progress = predicted;
  else progress += (predicted - progress) * (1 - Math.exp(-dt * 12));
  positions.set(p.id, progress);
  const f = frameAt(progress / state.game.config.trackLength);
  const effective =
    state.game.phase === "paused" ? state.game.effectiveTime : now + offset;
  const parked = p.finishedAt
    ? Math.min(1, Math.max(0, (effective - p.finishedAt) / 1200))
    : 0;
  f.pos.addScaledVector(f.right, p.lane + (p.lane < 0 ? -1 : 1) * parked * 14);
  f.pos.y += 0.68;
  return { ...f, progress };
}
function setPart(
  mesh,
  index,
  f,
  x,
  y,
  z,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(rx, ry, rz);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  local.multiplyMatrices(rootMatrix, dummy.matrix);
  mesh.setMatrixAt(index, local);
}
let clock = new THREE.Clock(),
  frame = 0,
  lastUI = 0;
const carFrames = new Map();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.5, clock.getDelta()),
    now = Date.now();
  frame++;
  if (!state) {
    if (webgl) {
      const f = frameAt(now / 160000);
      camera.position
        .copy(f.pos)
        .addScaledVector(f.tangent, -34)
        .add(new THREE.Vector3(0, 15, 0));
      camera.lookAt(f.pos.clone().addScaledVector(f.tangent, 22));
      renderer.render(scene, camera);
    }
    return;
  }
  const g = state.game,
    active = g.racers;
  carFrames.clear();
  for (const p of active) carFrames.set(p.id, carTransform(p, now, dt));
  focusRacer =
    (now < focusUntil ? active.find((p) => p.id === focusId) : null) ||
    active[0] ||
    null;
  if (webgl) {
    let i = 0;
    for (const p of active) {
      const f = carFrames.get(p.id),
        spin = p.spinning
          ? ((g.phase === "paused" ? g.effectiveTime : Date.now() + offset) /
              1000) *
            9
          : 0;
      dummy.position.copy(f.pos);
      dummy.rotation.set(
        -Math.asin(f.tangent.y),
        f.yaw + spin + (p.steering || 0),
        -(p.steering || 0) * 0.3,
        "YXZ",
      );
      const close =
        p.id !== focusRacer?.id && camera.position.distanceTo(f.pos) < 10;
      dummy.scale.setScalar(close ? 0 : 1);
      dummy.updateMatrix();
      rootMatrix.copy(dummy.matrix);
      setPart(instances.body, i, f, 0, 0.55, 0, 1, 1, 1);
      setPart(instances.hood, i, f, 0, 1, 1.8);
      setPart(instances.cabin, i, f, 0, 1.35, -0.25);
      setPart(
        instances.spoiler,
        i,
        f,
        0,
        1.55,
        -2.5,
        p.tier > 0 ? 1 : 0.75,
        1,
        1,
      );
      color.setHSL(p.hue / 360, 0.72, p.tier > 2 ? 0.58 : 0.45);
      instances.body.setColorAt(i, color);
      instances.hood.setColorAt(i, color);
      instances.spoiler.setColorAt(i, color);
      instances.roof.setColorAt(i, color);
      setPart(instances.roof, i, f, 0, 1.83, -0.42);
      setPart(instances.grille, i, f, 0, 0.46, 3.18);
      for (let side = 0; side < 2; side++) {
        setPart(
          instances.stripes,
          i * 2 + side,
          f,
          side ? 0.42 : -0.42,
          1.115,
          1.88,
        );
        setPart(
          instances.wingPosts,
          i * 2 + side,
          f,
          side ? 1.1 : -1.1,
          1.25,
          -2.5,
        );
      }
      for (let wheel = 0; wheel < 4; wheel++)
        setPart(
          instances.hubs,
          i * 4 + wheel,
          f,
          wheel % 2 ? 1.68 : -1.68,
          0.05,
          wheel < 2 ? 1.9 : -1.9,
          1,
          1,
          1,
          f.progress / 0.65,
          wheel < 2 ? (p.steering || 0) * 2 : 0,
          Math.PI / 2,
        );
      for (let wheel = 0; wheel < 4; wheel++)
        setPart(
          instances.wheels,
          i * 4 + wheel,
          f,
          wheel % 2 ? 1.65 : -1.65,
          0.05,
          wheel < 2 ? 1.9 : -1.9,
          1,
          1,
          1,
          0,
          0,
          Math.PI / 2,
        );
      for (let l = 0; l < 2; l++)
        setPart(instances.lights, i * 2 + l, f, l ? 1 : -1, 0.67, 3.18);
      for (let rear = 0; rear < 2; rear++)
        setPart(
          instances.rearLights,
          i * 2 + rear,
          f,
          rear ? 1 : -1,
          0.67,
          -3.18,
        );
      const boost = p.boosted && g.phase !== "paused";
      setPart(
        instances.trail,
        i,
        f,
        0,
        0.25,
        -4.8,
        boost ? 1 : 0,
        boost ? 1 : 0,
        boost ? 1.5 : 0,
      );
      setPart(
        instances.shield,
        i,
        f,
        0,
        1,
        0,
        p.shielded ? 1 : 0,
        p.shielded ? 0.7 : 0,
        p.shielded ? 1 : 0,
      );
      setPart(
        instances.shieldWire,
        i,
        f,
        0,
        1,
        0,
        p.shielded ? 1 : 0,
        p.shielded ? 0.7 : 0,
        p.shielded ? 1 : 0,
      );
      i++;
    }
    for (const [name, mesh] of Object.entries(instances)) {
      mesh.count =
        active.length *
        (["wheels", "hubs"].includes(name)
          ? 4
          : ["lights", "rearLights", "stripes", "wingPosts"].includes(name)
            ? 2
            : 1);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    let f = focusRacer ? carFrames.get(focusRacer.id) : frameAt(now / 160000);
    const behind = g.config.camera === "overview" ? 75 : 22,
      height = g.config.camera === "overview" ? 55 : 9,
      target = f.pos
        .clone()
        .addScaledVector(f.tangent, -behind)
        .addScaledVector(f.right, 4)
        .add(new THREE.Vector3(0, height, 0));
    if (!camera.userData.ready) {
      camera.position.copy(target);
      camera.userData.ready = true;
    }
    camera.position.lerp(target, 1 - Math.exp(-dt * 7));
    const look = f.pos
      .clone()
      .addScaledVector(f.tangent, g.config.camera === "overview" ? 30 : 12)
      .add(new THREE.Vector3(0, 2, 0));
    camera.lookAt(look);
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const e = projectiles[i],
        from = carFrames.get(e.from),
        to = carFrames.get(e.to),
        t = (performance.now() - e.at) / 1400;
      if (t >= 1 || !from || !to) {
        scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        projectiles.splice(i, 1);
        continue;
      }
      const target = to.pos.clone().add(new THREE.Vector3(0, 2, 0)),
        start = from.pos.clone().add(new THREE.Vector3(0, 2, 0));
      e.mesh.position.lerpVectors(start, target, t);
      e.mesh.position.y += Math.sin(t * Math.PI) * 12;
      e.mesh.quaternion.setFromUnitVectors(
        UP,
        target.clone().sub(e.mesh.position).normalize(),
      );
    }
    renderer.render(scene, camera);
    if (frame % 2 === 0) {
      const alive = new Set(active.map((p) => p.id));
      for (const [id, el] of labels)
        if (!alive.has(id)) {
          el.remove();
          labels.delete(id);
        }
      let shown = 0;
      const occupied = [];
      const labelOrder = focusRacer
        ? [focusRacer, ...active.filter((p) => p.id !== focusRacer.id)]
        : active;
      for (const p of labelOrder) {
        const cf = carFrames.get(p.id);
        world.copy(cf.pos);
        world.y += 4;
        world.project(camera);
        let el = labels.get(p.id);
        const visible =
          world.z > 0 &&
          world.z < 1 &&
          Math.abs(world.x) < 1.05 &&
          world.y < 0.35 &&
          world.y > -0.85 &&
          shown < 26;
        if (!visible) {
          if (el) el.hidden = true;
          continue;
        }
        const px = (world.x * 0.5 + 0.5) * 1080,
          py = (-world.y * 0.5 + 0.5) * 1920,
          width = Math.min(230, 75 + p.name.length * 8),
          rect = {
            l: px - width / 2,
            r: px + width / 2,
            t: py - 48,
            b: py + 4,
          };
        if (
          occupied.some(
            (o) => rect.l < o.r && rect.r > o.l && rect.t < o.b && rect.b > o.t,
          )
        ) {
          if (el) el.hidden = true;
          continue;
        }
        occupied.push(rect);
        shown++;
        if (!el) {
          el = document.createElement("div");
          el.className = "racer-label";
          const rank = document.createElement("span");
          rank.className = "rank";
          const name = document.createElement("span");
          name.className = "name";
          const badge = document.createElement("span");
          badge.className = "badge";
          el.append(avatar(p), rank, name, badge);
          $("labels").append(el);
          labels.set(p.id, el);
        }
        el.hidden = false;
        el.style.left = (world.x * 0.5 + 0.5) * 1080 + "px";
        el.style.top = (-world.y * 0.5 + 0.5) * 1920 + "px";
        el.querySelector(".rank").textContent = p.rank;
        el.querySelector(".name").textContent = p.name;
        el.querySelector(".badge").textContent = p.spinning
          ? "🌀 XOAY VÒNG"
          : p.shielded
            ? "🛡 KHIÊN"
            : p.boosted
              ? "⚡ NITRO"
              : ["Tân binh", "Tay đua", "Siêu tốc", "Cao thủ", "Huyền thoại"][
                  p.tier
                ];
        el.classList.toggle("boosted", p.boosted);
        el.classList.toggle("shielded", p.shielded);
      }
    }
  }
  if (now - lastUI > 100) {
    lastUI = now;
    uiTimer();
    drawMap();
  }
}
function uiTimer() {
  if (!state) return;
  const g = state.game,
    now = g.phase === "paused" ? g.effectiveTime : Date.now() + offset,
    elapsed =
      g.elapsed +
      (g.phase === "racing"
        ? Math.max(0, (Date.now() + offset - g.serverTime) / 1000)
        : 0);
  $("raceTime").textContent =
    String(Math.floor(elapsed / 60)).padStart(2, "0") +
    ":" +
    String(Math.floor(elapsed) % 60).padStart(2, "0");
  $("quizClock").textContent = g.quiz
    ? `${Math.max(0, Math.ceil((g.quiz.deadline - now) / 1000))} ${g.quiz.phase === "reveal" ? "NGHỈ" : "GIÂY"}`
    : "CHỜ XUẤT PHÁT";
  const phase = g.phase;
  $("centerState").hidden = phase === "racing";
  $("centerState").className =
    phase === "countdown" ? "counting" : phase === "finished" ? "podium" : "";
  if (phase === "countdown") {
    $("stateEyebrow").textContent = "TẤT CẢ VÀO VỊ TRÍ";
    $("countdown").textContent = Math.max(
      1,
      Math.ceil((g.phaseDeadline - now) / 1000),
    );
    $("stateHint").textContent = "Đúng A/B/C/D để nhận nitro";
  } else if (phase === "paused") {
    $("stateEyebrow").textContent = "ĐƯỜNG ĐUA TẠM NGHỈ";
    $("countdown").textContent = "TẠM DỪNG";
    $("stateHint").textContent = "Chờ người điều khiển tiếp tục ván";
  } else if (phase === "finished") {
    const winner = g.racers.find((p) => p.id === g.winner) || g.racers[0];
    $("stateEyebrow").textContent = "CỜ CA RÔ ĐÃ HẠ";
    $("countdown").textContent = winner ? "🏆 " + winner.name : "VỀ ĐÍCH";
    $("stateHint").textContent = g.config.autoNext
      ? `Ván mới sau ${Math.max(0, Math.ceil((g.phaseDeadline - now) / 1000))} giây`
      : "Chờ người điều khiển mở ván mới";
  } else if (phase === "lobby") {
    $("stateEyebrow").textContent = "THÀNH PHỐ ĐÃ LÊN ĐÈN";
    $("countdown").textContent = "CHỜ XUẤT PHÁT";
    $("stateHint").textContent =
      "Thả tim hoặc bình luận để lên xe · Bắt đầu trong bảng điều khiển";
  }
  if (focusRacer) {
    $("focusName").textContent = `#${focusRacer.rank} · ${focusRacer.name}`;
    $("speed").replaceChildren(
      document.createTextNode(
        String(Math.round(focusRacer.speed * 3.6)).padStart(3, "0"),
      ),
    );
    const unit = document.createElement("span");
    unit.textContent = "KM/H";
    $("speed").append(unit);
    $("charge").textContent = focusRacer.charge + "%";
    $("chargeBar").style.width = focusRacer.charge + "%";
    $("effectLabel").hidden = !(
      focusRacer.spinning ||
      focusRacer.shielded ||
      focusRacer.boosted
    );
    $("effectLabel").textContent = focusRacer.spinning
      ? "🌀 XOAY VÒNG"
      : focusRacer.shielded
        ? "🛡 KHIÊN BẢO VỆ"
        : "⚡ NITRO";
  }
  if (Date.now() > toastUntil) $("giftToast").hidden = true;
}
const map = $("minimap").getContext("2d"),
  mapPoints = Array.from({ length: 160 }, (_, i) => curve.getPointAt(i / 159));
function mapPoint(p) {
  return {
    x: 40 + ((p.x + 350) / 700) * 340,
    y: 35 + ((p.z + 340) / 700) * 240,
  };
}
function drawMap() {
  map.clearRect(0, 0, 420, 310);
  map.beginPath();
  mapPoints.forEach((p, i) => {
    const v = mapPoint(p);
    i ? map.lineTo(v.x, v.y) : map.moveTo(v.x, v.y);
  });
  map.closePath();
  map.lineWidth = 7;
  map.strokeStyle = "#19254b";
  map.stroke();
  map.lineWidth = 2;
  map.strokeStyle = "#9aabc9";
  map.stroke();
  if (!state) return;
  for (const p of state.game.racers) {
    const f = frameAt(p.progress / state.game.config.trackLength),
      v = mapPoint(f.pos);
    map.beginPath();
    map.arc(v.x, v.y, p.id === focusRacer?.id ? 7 : 3, 0, Math.PI * 2);
    map.fillStyle = `hsl(${p.hue} 80% 60%)`;
    map.fill();
    if (p.id === focusRacer?.id) {
      map.strokeStyle = "white";
      map.lineWidth = 2;
      map.stroke();
    }
  }
  map.font = "11px Arial";
  map.fillStyle = "#8da8c9";
  map.fillText("BẢN ĐỒ ĐƯỜNG ĐUA", 30, 295);
}
$("sound").onclick = async () => {
  try {
    if (!music) {
      audio = new AudioContext();
      await audio.resume();
      music = new HomeMusic(audio);
      music.setVolume(0.1);
      music.start();
    }
    soundOn = !soundOn;
    voice.setEnabled(soundOn);
    $("sound").textContent = soundOn ? "🔊 Âm thanh: BẬT" : "🔇 Âm thanh: TẮT";
    if (!soundOn) {
      music.enabled = false;
      music.level();
    } else {
      music.enabled = true;
      music.level();
      spokenQuiz = "";
      if (state) render(state);
    }
  } catch {
    $("sound").textContent = "Bấm lại để bật âm thanh";
  }
};
new LiveSocket(
  "overlay",
  (m) => {
    if (m.t === "state") render(m);
  },
  (status) => {
    if (status !== "connected")
      $("connection").textContent = "● ĐANG NỐI LẠI SERVER";
  },
);
window.raceDebug = () => ({
  webgl,
  renderedCars: instances.body?.count || 0,
  drawCalls: renderer?.info.render.calls || 0,
  phase: state?.game.phase,
  positions: carFrames.size,
});
animate();
