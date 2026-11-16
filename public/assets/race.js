import * as THREE from "/vendor/three.module.js";
import { TRACK_POINTS } from "./track.js";
import { interactionSpeech } from "./reward-text.js";
import { buildCarGeometry } from "./car-model.js";
import { selectShot } from "./camera-director.js";
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
let shadows, carGroup, awardScene, awardCamera, confetti;
if (webgl) {
  buildCity();
  carGroup = new THREE.Group();
  scene.add(carGroup);
  awardScene = new THREE.Scene();
  awardScene.background = new THREE.Color(0x080d23);
  awardScene.add(new THREE.HemisphereLight(0xcdfaff, 0x443011, 3));
  const awardLight = new THREE.DirectionalLight(0xffe8ad, 4);
  awardLight.position.set(8, 18, 20);
  awardScene.add(awardLight);
  awardCamera = new THREE.PerspectiveCamera(48, 1080 / 1920, 0.1, 200);
  awardCamera.position.set(9, 17, 49);
  awardCamera.lookAt(0, 4, 0);
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(22, 24, 1, 64),
    new THREE.MeshStandardMaterial({
      color: 0x182948,
      metalness: 0.6,
      roughness: 0.3,
    }),
  );
  deck.position.y = -0.6;
  awardScene.add(deck);
  for (const [rank, x, h, tint] of [
    [1, 0, 3.6, 0xffc84a],
    [2, -9, 2, 0xaac6df],
    [3, 9, 1.4, 0xc9864c],
  ]) {
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, h, 8),
      new THREE.MeshStandardMaterial({
        color: tint,
        metalness: 0.75,
        roughness: 0.25,
      }),
    );
    stand.position.set(x, h / 2, 0);
    awardScene.add(stand);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.7, 0.07, 8, 48),
      new THREE.MeshBasicMaterial({ color: tint }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.1, 0);
    awardScene.add(ring);
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a1428";
    ctx.font = "900 88px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(rank), 64, 96);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
      }),
    );
    plaque.position.set(x, Math.max(0.8, h / 2), 4.02);
    awardScene.add(plaque);
  }
  confetti = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.15, 0.35, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    100,
  );
  const confettiDummy = new THREE.Object3D();
  for (let i = 0; i < 100; i++) {
    confettiDummy.position.set(
      (rand() - 0.5) * 36,
      5 + rand() * 19,
      (rand() - 0.5) * 20,
    );
    confettiDummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    confettiDummy.updateMatrix();
    confetti.setMatrixAt(i, confettiDummy.matrix);
    confetti.setColorAt(i, new THREE.Color().setHSL(rand(), 0.85, 0.65));
  }
  awardScene.add(confetti);
  const envFaces = Array.from({ length: 6 }, (_, i) => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d"),
      gradient = ctx.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, i === 3 ? "#1b2947" : "#d9eaff");
    gradient.addColorStop(0.45, "#91b4df");
    gradient.addColorStop(0.55, "#263b62");
    gradient.addColorStop(1, "#11243e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return canvas;
  });
  const environment = new THREE.CubeTexture(envFaces);
  environment.needsUpdate = true;
  environment.colorSpace = THREE.SRGBColorSpace;
  scene.environment = environment;
  awardScene.environment = environment;
  const vehicle = buildCarGeometry(THREE);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
  function inst(name, geometry, mat, count = MAX) {
    const m = new THREE.InstancedMesh(geometry, mat, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    carGroup.add(m);
    instances[name] = m;
    return m;
  }
  inst("body", vehicle.body, material);
  inst("roof", vehicle.roof, material);
  inst("frames", vehicle.frames, material);
  inst("mirrors", vehicle.mirrors, material);
  inst(
    "trim",
    vehicle.trim,
    new THREE.MeshStandardMaterial({
      color: 0x0b1521,
      metalness: 0.3,
      roughness: 0.4,
    }),
  );
  inst("formulaBody", vehicle.formula, material);
  inst("sidePods", vehicle.sidePod, material, MAX * 2);
  inst("frontWing", new THREE.BoxGeometry(3.65, 0.12, 0.6), material);
  inst(
    "cockpit",
    new THREE.SphereGeometry(0.58, 16, 8),
    new THREE.MeshStandardMaterial({
      color: 0x071426,
      metalness: 0.6,
      roughness: 0.2,
    }),
  );
  inst("halo", new THREE.TorusGeometry(0.72, 0.065, 8, 20), material);
  inst(
    "flames",
    new THREE.ConeGeometry(0.45, 5, 10),
    new THREE.MeshBasicMaterial({
      color: 0x09bfff,
      toneMapped: false,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    MAX * 2,
  );
  inst(
    "flameCore",
    new THREE.ConeGeometry(0.23, 3.6, 10),
    new THREE.MeshBasicMaterial({
      color: 0xf1faff,
      blending: THREE.AdditiveBlending,
    }),
    MAX * 2,
  );
  inst(
    "boostRings",
    new THREE.TorusGeometry(1.7, 0.07, 6, 24),
    new THREE.MeshBasicMaterial({
      color: 0x87f6ff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    MAX * 2,
  );
  inst(
    "goldHalo",
    new THREE.SphereGeometry(4, 20, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffcf54,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  inst(
    "goldRing",
    new THREE.TorusGeometry(3.8, 0.09, 8, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffd567,
      transparent: true,
      opacity: 0.8,
    }),
  );
  inst(
    "underglow",
    new THREE.CylinderGeometry(2.3, 2.3, 0.025, 24),
    new THREE.MeshBasicMaterial({
      color: 0x30e8ff,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  inst(
    "grille",
    vehicle.grille,
    new THREE.MeshStandardMaterial({ color: 0x07101b, roughness: 0.6 }),
  );
  inst(
    "hubs",
    vehicle.rims,
    new THREE.MeshStandardMaterial({
      color: 0xd3dce7,
      metalness: 0.9,
      roughness: 0.19,
    }),
    MAX * 4,
  );
  inst(
    "brakes",
    vehicle.brakeDisc,
    new THREE.MeshStandardMaterial({
      color: 0x343941,
      metalness: 0.65,
      roughness: 0.45,
    }),
    MAX * 4,
  );
  inst(
    "wingPosts",
    new THREE.BoxGeometry(0.13, 0.45, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x101725 }),
    MAX * 2,
  );
  inst(
    "cabin",
    vehicle.glass,
    new THREE.MeshPhysicalMaterial({
      color: 0x101f30,
      metalness: 0.15,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    }),
  );
  inst("spoiler", new THREE.BoxGeometry(3.5, 0.1, 0.55), material);
  inst(
    "wheels",
    vehicle.tyre,
    new THREE.MeshStandardMaterial({ color: 0x0c1017, roughness: 0.85 }),
    MAX * 4,
  );
  inst(
    "lights",
    vehicle.headlight,
    new THREE.MeshBasicMaterial({ color: 0xd6f6ff, toneMapped: false }),
    MAX * 2,
  );
  inst(
    "rearLights",
    vehicle.taillight,
    new THREE.MeshBasicMaterial({ color: 0xff3456, toneMapped: false }),
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
  effectUntil = 0,
  focusRacer = null,
  labelSafeTop = 650,
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
const emblemPaths = {
  crown: "M12 23 9 12 17 17 22 8 27 17 35 12 32 23Z M12 26H32V30H12Z",
  wealth: "M13 11H31L36 18 22 33 8 18Z M13 11 18 18 22 33 26 18 31 11 M8 18H36",
  gift: "M11 20H33V32H11Z M8 15H36V21H8Z M20 15V32 M22 15C8 14 13 4 20 10L22 15C36 14 31 4 24 10Z",
  heart: "M22 32C-2 18 12 4 22 15 32 4 46 18 22 32Z",
  quick: "M25 7 12 23H21L18 35 33 17H24Z",
  star: "M22 9 25 17 34 17 27 23 30 32 22 27 14 32 17 23 10 17 19 17Z",
};
function makeCrest() {
  const crest = document.createElement("span");
  crest.className = "crest";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 44 44");
  svg.setAttribute("aria-hidden", "true");
  for (const [className, d] of [
    ["crest-shield", "M22 3 36 8 34 27 22 39 10 27 8 8Z"],
    [
      "crest-laurel",
      "M10 35C0 27 1 15 5 10 M8 30 2 28 M6 24 1 22 M5 18 1 15 M34 35C44 27 43 15 39 10 M36 30 42 28 M38 24 43 22 M39 18 43 15",
    ],
    ["crest-icon", emblemPaths.star],
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", className);
    path.setAttribute("d", d);
    svg.append(path);
  }
  crest.append(svg);
  return crest;
}
function updateRacerBadge(el, p) {
  const signature = JSON.stringify([
    p.level,
    p.model,
    p.gold,
    p.spinning,
    p.shielded,
    p.boosted,
    p.honors,
  ]);
  if (el.dataset.signature === signature) return;
  el.dataset.signature = signature;
  const badge = el.querySelector(".badge");
  badge.replaceChildren();
  const level = document.createElement("span");
  level.className = "level";
  const tier =
    p.level >= 10 ? "HUYỀN THOẠI" : p.level >= 5 ? "CAO THỦ" : "TÂN BINH";
  level.textContent = `${tier} · CẤP ${p.level}`;
  badge.append(level);
  const categories = ["heart", "gift", "wealth", "quick"];
  const titles = [
    "Chuyên gia thả tim",
    "Đại hiệp tặng quà",
    "Đại gia bá khí",
    "Nhanh tay lẹ mắt",
  ];
  for (const title of p.honors || []) {
    const tag = document.createElement("span");
    tag.className = "honor " + (categories[titles.indexOf(title)] || "gift");
    tag.textContent = title;
    badge.append(tag);
  }
  const stateText = p.spinning
    ? "XOAY VÒNG"
    : p.shielded
      ? "KHIÊN BẢO VỆ"
      : p.boosted
        ? "NITRO TĂNG TỐC"
        : "";
  if (stateText) {
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = stateText;
    badge.append(status);
  }
  const emblem = p.gold
    ? "crown"
    : p.honors?.includes(titles[2])
      ? "wealth"
      : p.honors?.includes(titles[1])
        ? "gift"
        : p.honors?.includes(titles[0])
          ? "heart"
          : p.honors?.includes(titles[3])
            ? "quick"
            : "star";
  const crest = el.querySelector(".crest");
  crest.dataset.emblem = emblem;
  crest.setAttribute(
    "aria-label",
    p.gold ? "Huy hiệu dẫn đầu" : `Huy hiệu cấp ${p.level}`,
  );
  crest.querySelector(".crest-icon").setAttribute("d", emblemPaths[emblem]);
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
  if (
    ["like", "gift", "correct", "boost", "winner", "welcome"].includes(e.type)
  ) {
    if (e.type === "gift") {
      focusId = e.userId;
      focusUntil = Date.now() + 5000;
    }
    if (soundOn && ["like", "gift", "winner", "welcome"].includes(e.type))
      voice.enqueue(interactionSpeech(e), e.type === "like" ? 0 : 1, {
        key: e.type === "like" ? `thanks:like:${e.userId}` : "",
        interrupt: e.type === "winner",
      });
  }
}
function render(m) {
  state = m;
  offset = m.game.serverTime - Date.now();
  lastStateAt = performance.now();
  const g = m.game;
  if (!g.quiz) voice.dropQuestions();
  stage.classList.toggle("awaiting-awards", !!g.awaitingAwards);
  $("quizHeading").textContent = g.awaitingAwards
    ? "🏁 CHỜ TRAO GIẢI"
    : "✦ CÂU HỎI TĂNG TỐC";
  if (g.round !== round) {
    round = g.round;
    positions.clear();
    for (const projectile of projectiles) {
      scene.remove(projectile.mesh);
      projectile.mesh.geometry.dispose();
      projectile.mesh.material.dispose();
    }
    projectiles.length = 0;
    if (g.racers.length) voice.dropQuestions();
    else voice.clear();
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
    const info = document.createElement("div"),
      meta = document.createElement("span");
    info.className = "rank-info";
    meta.className = "rank-meta";
    meta.textContent = `Lv.${p.level}`;
    name.className = "rank-name";
    name.textContent = p.name;
    lap.textContent = p.finishedAt ? "✓" : `V${p.lap}`;
    li.className = p.finishedAt ? "finished" : "";
    info.append(name);
    li.append(rank, avatar(p), info, meta, lap);
    $("ranking").append(li);
  }
  const awardMode =
    g.phase === "finished" ||
    (g.phase === "paused" && g.pausedPhase === "finished");
  stage.classList.toggle("award-mode", awardMode);
  if (awardMode && g.racers[0])
    $("ticker").textContent =
      `🏆 VINH DANH ${g.racers[0].name} · HẠNG 1 · XE DÁT VÀNG`;
  $("podium").hidden = !awardMode;
  $("podium").replaceChildren();
  if (awardMode)
    for (const rank of [2, 1, 3]) {
      const p = g.racers[rank - 1];
      if (!p) continue;
      const card = document.createElement("article");
      card.className = "award-card" + (rank === 1 ? " first" : "");
      card.style.gridColumn = String(rank === 1 ? 2 : rank === 2 ? 1 : 3);
      const medal = document.createElement("div");
      medal.className = "award-medal";
      medal.textContent = ["", "🥇 HẠNG 1", "🥈 HẠNG 2", "🥉 HẠNG 3"][rank];
      const name = document.createElement("strong");
      name.textContent = p.name;
      const detail = document.createElement("small");
      detail.textContent = `Cấp ${p.level} · ${p.finishedAt ? "Đã về đích" : "Hết thời gian"}${rank === 1 ? " · XE DÁT VÀNG" : ""}`;
      card.append(medal, avatar(p), name, detail);
      $("podium").append(card);
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
        "answer" +
        (q.phase === "reveal" ? (q.answer === i ? " correct" : " dimmed") : "");
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
    $("prompt").textContent = g.awaitingAwards
      ? "CHUẨN BỊ TRAO GIẢI"
      : "Thả tim hoặc bình luận để lên xe. Sẵn sàng bứt tốc?";
    $("answered").textContent = "";
    $("explanation").hidden = !g.awaitingAwards;
    $("explanation").textContent = g.awaitingAwards
      ? "Các tay đua còn lại đang về đích. Chờ chốt kết quả để trao giải top 3."
      : "";
  }
  labelSafeTop = $("quiz").offsetTop + $("quiz").offsetHeight + 12;
  const sidebarTop = Math.max(690, labelSafeTop + 30);
  document.querySelector(".ranking").style.top = sidebarTop + "px";
  $("cameraCaption").style.top = sidebarTop - 20 + "px";
}
function carTransform(p, now, dt) {
  if (
    state.game.phase === "finished" ||
    (state.game.phase === "paused" && state.game.pausedPhase === "finished")
  ) {
    const x = p.rank === 1 ? 0 : p.rank === 2 ? -9 : 9,
      h = p.rank === 1 ? 3.6 : p.rank === 2 ? 2 : 1.4;
    return {
      pos: new THREE.Vector3(x, h + 0.68, 0),
      tangent: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0),
      yaw: 0,
      progress: p.progress,
    };
  }
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
  const effectiveNow = g.phase === "paused" ? g.effectiveTime : now + offset;
  const elapsed =
    g.elapsed +
    (g.phase === "racing"
      ? Math.max(0, (effectiveNow - g.serverTime) / 1000)
      : 0);
  const shot = selectShot(
    active,
    elapsed,
    g.config.camera,
    focusId,
    now < focusUntil,
  );
  focusRacer = active.find((p) => p.id === shot.id) || active[0] || null;
  const awardMode =
    g.phase === "finished" ||
    (g.phase === "paused" && g.pausedPhase === "finished");
  const viewCamera = awardMode ? awardCamera : camera;
  $("cameraCaption").textContent =
    shot.label + (focusRacer ? " · " + focusRacer.name : "");
  stage.classList.toggle(
    "nitro-active",
    !!focusRacer?.boosted && g.phase === "racing",
  );
  if (webgl) {
    const destination = awardMode ? awardScene : scene;
    if (carGroup.parent !== destination) destination.add(carGroup);
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
      dummy.scale.setScalar((awardMode ? p.rank > 3 : close) ? 0 : 1);
      dummy.updateMatrix();
      rootMatrix.copy(dummy.matrix);
      const formula = p.model === "formula",
        gt = p.model === "gt",
        normal = formula ? 0 : 1;
      const bodyHeight = gt ? 0.93 : 1;
      for (const name of ["body", "cabin", "roof", "frames", "mirrors", "trim"])
        setPart(
          instances[name],
          i,
          f,
          0,
          0,
          0,
          normal,
          normal *
            (name === "cabin" || name === "roof" || name === "frames"
              ? gt
                ? 0.93
                : 1
              : bodyHeight),
          normal,
        );
      setPart(instances.grille, i, f, 0, 0.13, 3.23, normal, normal, normal);
      const wing = gt || formula ? 1 : 0;
      setPart(
        instances.spoiler,
        i,
        f,
        0,
        formula ? 1.4 : 1.3,
        -2.55,
        wing,
        wing * (formula ? 2 : 1),
        wing * (formula ? 1.65 : 1),
      );
      if (p.gold) color.setHex(0xffb619);
      else if (p.joined % 5 === 0) color.setHex(0xe8eef7);
      else color.setHSL(p.hue / 360, 0.52, 0.56);
      for (const name of [
        "body",
        "roof",
        "frames",
        "mirrors",
        "spoiler",
        "formulaBody",
        "frontWing",
        "sidePods",
        "halo",
      ])
        instances[name].setColorAt(i * (name === "sidePods" ? 2 : 1), color);
      instances.sidePods.setColorAt(i * 2 + 1, color);
      setPart(
        instances.formulaBody,
        i,
        f,
        0,
        0,
        0,
        formula ? 1 : 0,
        formula ? 1 : 0,
        formula ? 1 : 0,
      );
      setPart(
        instances.frontWing,
        i,
        f,
        0,
        formula ? 0.22 : 0.34,
        formula ? 3.3 : 3.04,
        formula || gt ? 1 : 0,
        formula || gt ? 1 : 0,
        1,
      );
      setPart(
        instances.cockpit,
        i,
        f,
        0,
        1,
        -0.4,
        formula ? 1 : 0,
        formula ? 0.65 : 0,
        formula ? 1.55 : 0,
      );
      setPart(
        instances.halo,
        i,
        f,
        0,
        1.43,
        -0.4,
        formula ? 1 : 0,
        formula ? 1 : 0,
        formula ? 1.5 : 0,
        Math.PI / 2,
      );
      for (let side = 0; side < 2; side++) {
        setPart(
          instances.sidePods,
          i * 2 + side,
          f,
          side ? 1.04 : -1.04,
          0.52,
          -0.65,
          formula ? 1 : 0,
          formula ? 1 : 0,
          formula ? 1 : 0,
        );
        setPart(
          instances.wingPosts,
          i * 2 + side,
          f,
          side ? 1.1 : -1.1,
          formula ? 1.15 : 1.1,
          -2.55,
          wing,
          wing,
          wing,
        );
      }
      for (let wheel = 0; wheel < 4; wheel++) {
        const steer = wheel < 2 ? (p.steering || 0) * 2 : 0;
        for (const name of ["wheels", "hubs", "brakes"])
          setPart(
            instances[name],
            i * 4 + wheel,
            f,
            wheel % 2 ? 1.6 : -1.6,
            0.02,
            wheel < 2 ? 1.9 : -1.9,
            1,
            1,
            1,
            f.progress / 0.65,
            steer,
            0,
          );
      }
      for (let side = 0; side < 2; side++) {
        setPart(
          instances.lights,
          i * 2 + side,
          f,
          side ? 1.1 : -1.1,
          0.44,
          2.8,
          normal,
          normal,
          normal,
          0,
          side ? 0.2 : -0.2,
        );
        setPart(
          instances.rearLights,
          i * 2 + side,
          f,
          formula ? (side ? 0.3 : -0.3) : side ? 0.95 : -0.95,
          formula ? 0.6 : 0.42,
          formula ? -3.12 : -3.05,
          formula ? 0.65 : 1,
          1,
          1,
        );
      }
      const boost = p.boosted && g.phase === "racing" && !p.finishedAt;
      const pulse = 1 + Math.sin(effectiveNow / 65 + i) * 0.18,
        on = boost ? 1 : 0;
      setPart(
        instances.goldHalo,
        i,
        f,
        0,
        0.6,
        0,
        p.gold ? 1 : 0,
        p.gold ? 0.7 : 0,
        p.gold ? 1.2 : 0,
      );
      setPart(
        instances.goldRing,
        i,
        f,
        0,
        -0.5,
        0,
        p.gold ? 1 : 0,
        p.gold ? 1.2 : 0,
        p.gold ? 1 : 0,
        Math.PI / 2,
        0,
        effectiveNow / 900,
      );
      setPart(instances.underglow, i, f, 0, -0.55, 0, on, on, on * 1.45);
      for (let side = 0; side < 2; side++) {
        const x = side ? 0.65 : -0.65;
        setPart(
          instances.flames,
          i * 2 + side,
          f,
          x,
          0.28,
          -5.15,
          on,
          on * pulse,
          on,
          -Math.PI / 2,
        );
        setPart(
          instances.flameCore,
          i * 2 + side,
          f,
          x,
          0.28,
          -4.65,
          on,
          on * pulse,
          on,
          -Math.PI / 2,
        );
        const wave = (effectiveNow / 650 + side * 0.5) % 1;
        setPart(
          instances.boostRings,
          i * 2 + side,
          f,
          0,
          0.45,
          -5 - wave * 9,
          on * (0.6 + wave),
          on * (0.6 + wave),
          on,
        );
      }
      setPart(
        instances.trail,
        i,
        f,
        0,
        0.25,
        -9,
        boost ? 1 : 0,
        boost ? 1 : 0,
        boost ? 4 : 0,
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
        (["wheels", "hubs", "brakes"].includes(name)
          ? 4
          : [
                "lights",
                "rearLights",
                "wingPosts",
                "sidePods",
                "flames",
                "flameCore",
                "boostRings",
              ].includes(name)
            ? 2
            : 1);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    let f = focusRacer ? carFrames.get(focusRacer.id) : frameAt(now / 160000);
    const kind = shot.kind;
    const behind =
      kind === "overview"
        ? 65
        : kind === "front"
          ? -23
          : kind === "side"
            ? 7
            : 19;
    const height = kind === "overview" ? 48 : kind === "side" ? 6 : 7.5;
    const target = f.pos
      .clone()
      .addScaledVector(f.tangent, -behind)
      .addScaledVector(
        f.right,
        kind === "side" ? 18 : kind === "overview" ? 14 : 3,
      )
      .add(new THREE.Vector3(0, height, 0));
    if (!camera.userData.ready) {
      camera.position.copy(target);
      camera.userData.ready = true;
    }
    // Cut quickly between distant packs; smoothly follow within a shot.
    if (camera.userData.shot !== shot.id + kind) {
      camera.position.copy(target);
      camera.userData.shot = shot.id + kind;
    }
    camera.position.lerp(target, 1 - Math.exp(-dt * 9));
    camera.lookAt(
      f.pos
        .clone()
        .addScaledVector(f.tangent, kind === "front" ? 0 : 7)
        .add(new THREE.Vector3(0, 1, 0)),
    );
    const desiredFov = focusRacer?.boosted && g.phase === "racing" ? 65 : 57;
    camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
    if (awardMode) confetti.rotation.y = effectiveNow / 15000;
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
    renderer.render(awardMode ? awardScene : scene, viewCamera);
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
        world.y += 2.2;
        world.project(viewCamera);
        let el = labels.get(p.id);
        const visible =
          !awardMode &&
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
          py = Math.max(
            labelSafeTop + 100 + (p.honors?.length || 0) * 30,
            (-world.y * 0.5 + 0.5) * 1920,
          ),
          width = Math.min(310, Math.max(200, 120 + p.name.length * 8)),
          rect = {
            l: px - width / 2,
            r: px + width / 2,
            t: py - 100 - (p.honors?.length || 0) * 30,
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
          el.append(avatar(p), rank, name, makeCrest(), badge);
          $("labels").append(el);
          labels.set(p.id, el);
        }
        el.hidden = false;
        el.style.left = (world.x * 0.5 + 0.5) * 1080 + "px";
        el.style.top = py + "px";
        el.querySelector(".rank").textContent = p.rank;
        el.querySelector(".name").textContent = p.name;
        updateRacerBadge(el, p);
        el.classList.toggle("gold", p.gold);
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
    : g.awaitingAwards
      ? `${Math.max(0, Math.ceil((g.awardsDeadline - now) / 1000))} GIÂY VỀ ĐÍCH`
      : "CHỜ XUẤT PHÁT";
  const remaining = g.quiz ? Math.max(0, (g.quiz.deadline - now) / 1000) : 0;
  const fraction = g.quiz
    ? Math.min(
        1,
        remaining /
          (g.quiz.phase === "reveal"
            ? g.config.revealSeconds
            : g.config.quizSeconds),
      )
    : 0;
  $("quizProgress").style.transform = `scaleX(${fraction})`;
  $("quizProgress").parentElement.classList.toggle(
    "urgent",
    g.quiz?.phase === "question" && remaining <= 5,
  );
  $("quizProgress").parentElement.classList.toggle(
    "reveal",
    g.quiz?.phase === "reveal",
  );
  $("quizProgress").parentElement.setAttribute(
    "aria-valuenow",
    Math.round(fraction * 100),
  );
  const ceremony =
    g.phase === "finished" ||
    (g.phase === "paused" && g.pausedPhase === "finished");
  $("nextRoundClock").hidden = !ceremony || !g.config.autoNext;
  $("nextRoundSeconds").textContent = Math.max(
    0,
    Math.ceil((g.phaseDeadline - now) / 1000),
  );
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
      ? "Vinh danh top 3 · Màn mới bắt đầu khi đếm ngược kết thúc"
      : "Chờ người điều khiển mở ván mới";
  } else if (phase === "lobby") {
    $("stateEyebrow").textContent = "THÀNH PHỐ ĐÃ LÊN ĐÈN";
    $("countdown").textContent = "CHỜ XUẤT PHÁT";
    $("stateHint").textContent =
      "Thả tim hoặc bình luận để lên xe · Bắt đầu trong bảng điều khiển";
  }
  if (focusRacer) {
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
  focusId: focusRacer?.id,
  cameraKind: camera?.userData.shot,
  modelCounts: state?.game.racers.reduce(
    (a, p) => ((a[p.model] = (a[p.model] || 0) + 1), a),
    {},
  ),
  awardScene: !!awardScene && carGroup?.parent === awardScene,
});
animate();
