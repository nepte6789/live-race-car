import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildCarGeometry } from "../public/assets/car-model.js";
import { CAR_WIDTH, MIN_GAP } from "../src/traffic.mjs";
const meshes = buildCarGeometry(THREE);
test("curved vehicle meshes have finite vertices and outward canopy normals", () => {
  for (const [name, g] of Object.entries(meshes)) {
    for (const value of g.attributes.position.array)
      assert.ok(Number.isFinite(value), name);
    for (const value of g.attributes.normal.array)
      assert.ok(Number.isFinite(value), name);
  }
  const glass = meshes.glass,
    n = glass.attributes.normal,
    p = glass.attributes.position;
  let roofVertices = 0;
  for (let i = 0; i < p.count; i++)
    if (p.getY(i) > 1.3) {
      roofVertices++;
      assert.ok(n.getY(i) > 0, "roof-facing glass must not be inside-out");
    }
  assert.ok(roofVertices > 0);
});
test("curved body, mirrors and wheels fit the existing traffic clearance", () => {
  for (const name of ["body", "mirrors", "trim", "formula"]) {
    const g = meshes[name];
    g.computeBoundingBox();
    assert.ok(g.boundingBox.max.x - g.boundingBox.min.x <= CAR_WIDTH, name);
    assert.ok(g.boundingBox.max.z - g.boundingBox.min.z < MIN_GAP, name);
  }
  meshes.tyre.computeBoundingBox();
  assert.ok(1.6 + meshes.tyre.boundingBox.max.x < CAR_WIDTH / 2);
  assert.ok(meshes.tyre.boundingBox.max.y <= 0.651);
});
test("car geometry budget stays bounded for a full 100-car field", () => {
  const triangles = (g) => (g.index?.count || g.attributes.position.count) / 3;
  const total = Object.entries(meshes).reduce(
    (n, [name, g]) =>
      n +
      triangles(g) *
        (["tyre", "rims", "brakeDisc"].includes(name)
          ? 4
          : ["headlight", "taillight", "sidePod"].includes(name)
            ? 2
            : 1),
    0,
  );
  assert.ok(
    total < 18000,
    `${Math.round(total)} triangles per complete mesh set`,
  );
});
