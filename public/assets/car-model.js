// Original, locally generated vehicle meshes. All surfaces are shared by instanced cars.
export function buildCarGeometry(T) {
  const clamp = T.MathUtils.clamp;
  function merge(parts) {
    const positions = [],
      normals = [];
    for (const source of parts) {
      const g = source.index ? source.toNonIndexed() : source;
      positions.push(...g.attributes.position.array);
      normals.push(...g.attributes.normal.array);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
    return g;
  }
  function tube(points, r = 0.025) {
    return new T.TubeGeometry(
      new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
      16,
      r,
      5,
      false,
    );
  }
  function ellipsoid(x, y, z, sx, sy, sz) {
    return new T.SphereGeometry(1, 12, 8).scale(sx, sy, sz).translate(x, y, z);
  }
  // Smooth lofts use monotonic z sampling, avoiding caps that bulge beyond the car footprint.
  function interpolate(profiles, z, column) {
    let i = 0;
    while (i < profiles.length - 2 && z > profiles[i + 1][0]) i++;
    const a = profiles[i],
      b = profiles[i + 1],
      t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1),
      smooth = t * t * (3 - 2 * t);
    return a[column] + (b[column] - a[column]) * smooth;
  }
  function surface(rows, columns, point, wrap = false, flip = false) {
    const positions = [],
      indices = [];
    for (let row = 0; row <= rows; row++)
      for (let col = 0; col <= columns; col++)
        positions.push(...point(row / rows, col / columns));
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++) {
        const a = row * (columns + 1) + col,
          b = a + columns + 1;
        indices.push(
          ...(flip
            ? [a, b + 1, b, a, a + 1, b + 1]
            : [a, b, b + 1, a, b + 1, a + 1]),
        );
      }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    // Average both sides of the periodic seam so metallic reflections do not show a hard line.
    if (wrap) {
      const n = geometry.attributes.normal;
      for (let row = 0; row <= rows; row++) {
        const a = row * (columns + 1),
          b = a + columns,
          v = new T.Vector3(
            n.getX(a) + n.getX(b),
            n.getY(a) + n.getY(b),
            n.getZ(a) + n.getZ(b),
          ).normalize();
        n.setXYZ(a, v.x, v.y, v.z);
        n.setXYZ(b, v.x, v.y, v.z);
      }
    }
    return geometry;
  }
  const profile = [
    [-3.22, 1.08, 0.34],
    [-2.92, 1.46, 0.64],
    [-1.92, 1.65, 0.88],
    [-1.1, 1.56, 0.8],
    [0, 1.52, 0.76],
    [1.9, 1.64, 0.64],
    [2.65, 1.44, 0.56],
    [3.22, 1.06, 0.29],
  ];
  function bodyPoint(u, v) {
    const z = -3.22 + u * 6.44,
      w = interpolate(profile, z, 1),
      h = interpolate(profile, z, 2);
    // Rounded shoulders and a flatter central bonnet; wheel openings are cut into the outer skirt.
    const angle = v * Math.PI * 2,
      x = Math.sin(angle) * w,
      top = Math.cos(angle);
    let y =
      top >= 0 ? 0.12 + (h - 0.12) * Math.pow(top, 0.43) : 0.12 + 0.3 * top;
    const fender = Math.max(
      Math.exp(-Math.pow((z - 1.9) / 0.75, 2)),
      Math.exp(-Math.pow((z + 1.9) / 0.75, 2)),
    );
    y += top > 0 ? fender * 0.4 * Math.pow(Math.abs(Math.sin(angle)), 2) : 0;
    const dz = Math.min(Math.abs(z - 1.9), Math.abs(z + 1.9));
    if (dz < 0.77) {
      const arch = 0.02 + Math.sqrt(0.77 * 0.77 - dz * dz),
        edge = clamp((Math.abs(x) - 1.12) / 0.26, 0, 1);
      y = Math.max(y, y + (arch - y) * edge);
    }
    return [x, y, z];
  }
  const body = surface(60, 32, bodyPoint, true);
  // Close the nose and tail; curved body is thin here, with a recessed dark grille in front.
  const caps = [];
  for (const [z, u, flip] of [
    [-3.22, 0, true],
    [3.22, 1, false],
  ]) {
    const ring = [];
    for (let i = 0; i <= 32; i++) ring.push(bodyPoint(u, i / 32));
    const positions = [],
      indices = [];
    positions.push(0, 0.1, z);
    ring.forEach((p) => positions.push(...p));
    for (let i = 1; i <= 32; i++)
      indices.push(...(flip ? [0, i, i + 1] : [0, i + 1, i]));
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    caps.push(g);
  }
  const cabinProfile = [
    [-1.55, 1.12, 0.83, 0.87],
    [-1.02, 1.12, 0.83, 1.3],
    [-0.55, 1.04, 0.82, 1.42],
    [0.3, 1.01, 0.78, 1.4],
    [1.26, 1.1, 0.77, 0.8],
  ];
  function canopyPoint(z, v, lift = 0) {
    const w = interpolate(cabinProfile, z, 1),
      base = interpolate(cabinProfile, z, 2),
      roof = interpolate(cabinProfile, z, 3),
      angle = (v - 0.5) * Math.PI;
    return [
      w * Math.sin(angle),
      base + (roof - base) * Math.pow(Math.max(0, Math.cos(angle)), 0.6) + lift,
      z,
    ];
  }
  const glass = surface(
    32,
    20,
    (u, v) => canopyPoint(-1.55 + u * 2.81, v),
    false,
    false,
  );
  const roof = surface(
    14,
    14,
    (u, v) => canopyPoint(-0.69 + u * 0.88, 0.23 + v * 0.54, 0.024),
    false,
    false,
  );
  const frames = [];
  for (const z of [-0.72, 0.25]) {
    const points = [];
    for (let i = 0; i <= 20; i++) points.push(canopyPoint(z, i / 20, 0.025));
    frames.push(tube(points, 0.033));
  }
  for (const side of [0, 1]) {
    const points = [];
    for (let i = 0; i <= 30; i++)
      points.push(canopyPoint(-1.55 + (2.81 * i) / 30, side, 0.02));
    frames.push(tube(points, 0.032));
  }
  // Doors, carbon intakes, underbody splitter and mirror stems add detail without textures.
  const trim = [];
  for (const side of [-1, 1]) {
    const seam = [
      [0.98, 1.2],
      [0.75, 1.48],
      [-0.72, 1.48],
      [-0.98, 1.2],
    ].map(([z, angle]) => {
      const point = bodyPoint((z + 3.22) / 6.44, angle / (Math.PI * 2));
      point[0] = (point[0] + 0.008) * side;
      return point;
    });
    trim.push(tube(seam, 0.012));
    trim.push(ellipsoid(side * 1.53, 0.46, -0.65, 0.065, 0.17, 0.36));
    trim.push(
      tube(
        [
          [side * 1.1, 0.88, 0.45],
          [side * 1.49, 0.92, 0.55],
          [side * 1.71, 0.91, 0.54],
        ],
        0.035,
      ),
    );
    trim.push(ellipsoid(side * 1.83, 0.93, 0.51, 0.055, 0.075, 0.15));
  }
  trim.push(ellipsoid(0, 0.02, 3.05, 1.28, 0.06, 0.27));
  trim.push(ellipsoid(0, -0.05, -2.96, 1.27, 0.07, 0.3));
  const mirrors = merge(
    [-1, 1].map((side) => ellipsoid(side * 1.68, 0.95, 0.55, 0.19, 0.12, 0.27)),
  );
  // Soft toroidal tyres and recessed ten-spoke alloys. Geometry is oriented on the X axle.
  const tyre = new T.TorusGeometry(0.49, 0.16, 8, 28)
    .scale(1, 1, 1.5)
    .rotateY(Math.PI / 2);
  const rimParts = [];
  for (const side of [-1, 1]) {
    rimParts.push(
      new T.TorusGeometry(0.445, 0.035, 6, 20).translate(0, 0, side * 0.255),
    );
    for (let i = 0; i < 5; i++)
      rimParts.push(
        new T.BoxGeometry(0.055, 0.82, 0.04)
          .rotateZ((i * Math.PI) / 5)
          .translate(0, 0, side * 0.265),
      );
  }
  rimParts.push(
    new T.CylinderGeometry(0.13, 0.13, 0.55, 16).rotateX(Math.PI / 2),
  );
  const rims = merge(rimParts).rotateY(Math.PI / 2);
  const brakeDisc = new T.CylinderGeometry(0.38, 0.38, 0.36, 24).rotateZ(
    Math.PI / 2,
  );
  const formulaProfile = [
    [-3.1, 0.4, 0.65],
    [-2.45, 0.65, 0.9],
    [-1.1, 0.73, 0.85],
    [0.4, 0.55, 0.6],
    [2.5, 0.28, 0.46],
    [3.3, 0.2, 0.28],
  ];
  const formula = surface(
    48,
    20,
    (u, v) => {
      const z = -3.1 + u * 6.4,
        w = interpolate(formulaProfile, z, 1),
        h = interpolate(formulaProfile, z, 2),
        a = v * Math.PI * 2;
      return [w * Math.sin(a), 0.36 + (h - 0.36) * Math.cos(a), z];
    },
    true,
  );
  const sidePod = ellipsoid(0, 0, 0, 0.48, 0.29, 1.45);
  return {
    body: merge([body, ...caps]),
    glass,
    roof,
    frames: merge(frames),
    trim: merge(trim),
    mirrors,
    tyre,
    rims,
    brakeDisc,
    formula: merge([
      formula,
      ellipsoid(0, 0.36, -3.1, 0.4, 0.29, 0.08),
      ellipsoid(0, 0.36, 3.3, 0.2, 0.08, 0.05),
    ]),
    sidePod,
    headlight: ellipsoid(0, 0, 0, 0.28, 0.075, 0.32),
    taillight: ellipsoid(0, 0, 0, 0.31, 0.065, 0.09),
    grille: ellipsoid(0, 0, 0, 0.8, 0.13, 0.08),
  };
}
