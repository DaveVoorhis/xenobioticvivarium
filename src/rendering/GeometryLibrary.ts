import * as THREE from 'three';

function applyVertexShading(
  geo: THREE.BufferGeometry,
  colorFn: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => [number, number, number]
): THREE.BufferGeometry {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [r, g, b] = colorFn(
      pos.getX(i),
      pos.getY(i),
      pos.getZ(i),
      norm ? norm.getX(i) : 0,
      norm ? norm.getY(i) : 1,
      norm ? norm.getZ(i) : 0
    );
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Sculpted alien glider torso: streamlined thorax + tapered tail cone oriented along +Z */
function buildFlyerTorso(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = tail, 1 = snout
    const z = (t - 0.5) * 1.15;
    const r = Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.22 + 0.015;
    pts.push(new THREE.Vector2(Math.max(0.008, r), z));
  }
  const geo = new THREE.LatheGeometry(pts, 18);
  geo.rotateX(Math.PI * 0.5);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Subtle dorsal ridge & sleek ventral belly
    const yScaled = y > 0 ? y * 0.88 + 0.02 : y * 0.72;
    pos.setXYZ(i, x * 0.92, yScaled, z);
  }
  return applyVertexShading(geo, (_x, y, z) => {
    const dorsal = y > 0 ? 1.0 : 0.78;
    const tip = z > 0.3 ? 1.08 : 0.94;
    return [dorsal * tip, dorsal * tip, dorsal * tip];
  });
}

/** Sculpted membranous alien wing extending along +X from root pivot (0,0,0) */
function buildMembranousWing(span: number, chord: number, camber: number): THREE.BufferGeometry {
  const segX = 12;
  const segZ = 8;
  const geo = new THREE.PlaneGeometry(span, chord, segX, segZ);
  geo.rotateX(-Math.PI * 0.5);
  geo.translate(span * 0.5, 0, 0);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = THREE.MathUtils.clamp(x / span, 0, 1);
    const v = z / (chord * 0.5); // -1..1
    // Taper chord gracefully toward wingtip + swept trailing edge scallops
    const chordEnvelope = Math.sin(Math.pow(u, 0.55) * Math.PI * 0.92) * 0.85 + 0.18 * (1 - u);
    const sweep = -Math.pow(u, 1.4) * chord * 0.35;
    const scallop = v < -0.5 ? Math.sin(u * Math.PI * 5.0) * 0.04 * chord : 0;
    const newZ = z * chordEnvelope + sweep + scallop;
    const arch = Math.sin(u * Math.PI) * camber * (1.0 - Math.abs(v) * 0.5) + Math.sin(u * Math.PI * 6) * 0.012;
    pos.setXYZ(i, x, arch, newZ);
  }
  return applyVertexShading(geo, (x) => {
    const u = THREE.MathUtils.clamp(x / span, 0, 1);
    const v = 0.84 + u * 0.26;
    return [v, v, v];
  });
}

/** Sculpted hexapod walker thorax & abdomen */
function buildWalkerThorax(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.28, 18, 14);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ridge = Math.cos(z * 11.0) * 0.02;
    pos.setXYZ(i, x * 0.88, y * 0.78 + (y > 0 ? ridge : 0), z * 1.42);
  }
  return applyVertexShading(geo, (_x, y) => {
    const s = y > 0 ? 1.04 : 0.74;
    return [s, s, s];
  });
}

function buildWalkerAbdomen(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const z = -t * 0.78;
    const r = Math.sin(Math.pow(t, 0.68) * Math.PI) * 0.28 + 0.02;
    const ring = 1.0 + Math.sin(t * Math.PI * 7.0) * 0.06;
    pts.push(new THREE.Vector2(Math.max(0.01, r * ring), z));
  }
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.rotateX(Math.PI * 0.5);
  return applyVertexShading(geo, (_x, y, z) => {
    const d = y > 0 ? 1.02 : 0.75;
    const rear = 0.88 + Math.abs(z) * 0.2;
    return [d * rear, d * rear, d * rear];
  });
}

/** Sculpted tapered articulated leg segment extending downward along -Y from joint */
function buildLegSegment(length: number, topR: number, botR: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(topR, botR, length, 8, 4);
  geo.translate(0, -length * 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = -y / length;
    const bow = Math.sin(t * Math.PI) * topR * 0.8;
    pos.setX(i, pos.getX(i) + bow);
  }
  return applyVertexShading(geo, (_x, y) => {
    const t = THREE.MathUtils.clamp(-y / length, 0, 1);
    const s = 0.95 - t * 0.2;
    return [s, s, s];
  });
}

/** Sculpted armored crawler dorsal plate segment */
function buildCrawlerSegment(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.28, 16, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const domeY = y > 0 ? y * 0.65 + 0.03 * Math.cos(x * 8.0) : y * 0.22;
    const flareX = x * (1.28 + (y < 0.04 ? 0.14 : 0));
    pos.setXYZ(i, flareX, domeY, z * 0.86);
  }
  return applyVertexShading(geo, (x, y) => {
    const edge = 0.82 + Math.abs(x) * 0.45;
    const top = y > 0 ? 1.04 : 0.7;
    return [top * edge, top * edge, top * edge];
  });
}

/** Sculpted serpentine head with brow ridges & snout */
function buildSlitherHead(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const z = (t - 0.35) * 0.62;
    const r = Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.21 + 0.018;
    pts.push(new THREE.Vector2(Math.max(0.01, r), z));
  }
  const geo = new THREE.LatheGeometry(pts, 14);
  geo.rotateX(Math.PI * 0.5);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(i, x * (1.12 - Math.max(0, z) * 0.35), y * 0.68, z);
  }
  return applyVertexShading(geo, (_x, y) => {
    const s = y > 0 ? 1.05 : 0.76;
    return [s, s, s];
  });
}

function buildSlitherSegment(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.2, 14, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const keel = y > 0.08 ? 0.035 * Math.cos(x * 12) : 0;
    pos.setXYZ(i, x * 0.96, y * 0.82 + keel, z * 1.38);
  }
  return applyVertexShading(geo, (_x, y) => {
    const s = y > 0 ? 1.04 : 0.72;
    return [s, s, s];
  });
}

/** Sculpted elastic bouncer pear/pneumatic hopper body */
function buildBouncerBody(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16; // 0 = base, 1 = crown
    const y = (t - 0.42) * 0.86;
    const bulge = Math.sin(t * Math.PI) * (1.16 - t * 0.28) * 0.34;
    pts.push(new THREE.Vector2(Math.max(0.01, bulge), y));
  }
  const geo = new THREE.LatheGeometry(pts, 20);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Slight forward lean & bulbous vocal belly
    pos.setXYZ(i, x * 0.96, y, z * 1.18 + Math.max(0, y) * 0.14);
  }
  return applyVertexShading(geo, (_x, y, z) => {
    const belly = z > 0.15 && y < 0.05 ? 1.12 : 0.94;
    const top = y > 0 ? 1.04 : 0.82;
    return [belly * top, belly * top, belly * top];
  });
}

/** Curved horn / mandible / claw primitive */
function buildCurvedBlade(length: number, radius: number, curveAmt: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(curveAmt * 0.4, 0.02, length * 0.45),
    new THREE.Vector3(curveAmt, 0.01, length),
  ]);
  const geo = new THREE.TubeGeometry(curve, 10, radius, 8, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = THREE.MathUtils.clamp(z / Math.max(0.01, length), 0, 1);
    const taper = 1.0 - t * 0.82;
    const center = curve.getPoint(t);
    pos.setXYZ(
      i,
      center.x + (pos.getX(i) - center.x) * taper,
      center.y + (pos.getY(i) - center.y) * taper,
      center.z + (pos.getZ(i) - center.z) * taper
    );
  }
  return applyVertexShading(geo, (_x, _y, z) => {
    const t = THREE.MathUtils.clamp(z / Math.max(0.01, length), 0, 1);
    const s = 0.85 + t * 0.25;
    return [s, s, s];
  });
}

/** Sculpted dorsal sail / crest fin */
function buildDorsalSail(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.35);
  shape.quadraticCurveTo(0.24, -0.15, 0.32, 0.1);
  shape.quadraticCurveTo(0.22, 0.34, 0.02, 0.42);
  shape.lineTo(0, -0.35);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.028, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
  geo.rotateY(Math.PI * 0.5);
  geo.rotateX(Math.PI * 0.5);
  geo.center();
  return applyVertexShading(geo, (_x, y) => {
    const s = 0.85 + Math.max(0, y) * 0.8;
    return [s, s, s];
  });
}

/** Sculpted unfurling alien fern frond (arches outward along +Z and +Y) */
function buildFernFrond(): THREE.BufferGeometry {
  const segW = 6;
  const segL = 14;
  const geo = new THREE.PlaneGeometry(0.46, 1.35, segW, segL);
  geo.translate(0, 0.675, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / 1.35, 0, 1);
    const widthEnv = Math.sin(Math.pow(t, 0.62) * Math.PI) * (1.0 + 0.18 * Math.sin(t * Math.PI * 10));
    const archZ = Math.pow(t, 1.55) * 0.72;
    const archY = y * (1.0 - t * 0.22);
    const cupZ = Math.abs(x) * 0.14;
    pos.setXYZ(i, x * widthEnv, archY, archZ + cupZ);
  }
  return applyVertexShading(geo, (_x, y) => {
    const t = THREE.MathUtils.clamp(y / 1.2, 0, 1);
    const s = 0.76 + t * 0.34;
    return [s, s, s];
  });
}

/** Sculpted cupped alien blossom petal */
function buildBlossomPetal(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(0.42, 0.72, 6, 10);
  geo.translate(0, 0.36, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / 0.72, 0, 1);
    const widthEnv = Math.sin(Math.pow(t, 0.65) * Math.PI) * 1.15;
    const curlZ = Math.pow(t, 1.7) * 0.34 - (x * x) * 1.2;
    pos.setXYZ(i, x * widthEnv, y * (1.0 - t * 0.15), curlZ);
  }
  return applyVertexShading(geo, (_x, y) => {
    const t = THREE.MathUtils.clamp(y / 0.65, 0, 1);
    const s = 0.78 + t * 0.32;
    return [s, s, s];
  });
}

/** Sculpted carnivorous alien pitcher trap cup */
function buildPitcherCup(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = t * 1.05;
    const belly = Math.sin(t * Math.PI * 0.88) * 0.24;
    const neck = t > 0.7 ? (t - 0.7) * 0.32 : 0;
    const lip = t > 0.92 ? (t - 0.92) * 0.95 : 0;
    pts.push(new THREE.Vector2(Math.max(0.03, 0.06 + belly - neck * 0.25 + lip), y));
  }
  const geo = new THREE.LatheGeometry(pts, 20);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const rib = 1.0 + Math.sin(ang * 8.0) * 0.05;
    pos.setXYZ(i, pos.getX(i) * rib, y, pos.getZ(i) * rib);
  }
  return applyVertexShading(geo, (_x, y) => {
    const t = THREE.MathUtils.clamp(y / 1.05, 0, 1);
    return [0.78 + t * 0.32, 0.72 + t * 0.25, 0.76 + t * 0.3];
  });
}

/** Sculpted ribbed alien parasol mushroom cap with ruffled overhang */
function buildMushroomCapParasol(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16; // 0 = apex, 1 = outer rim tucked slightly under
    const r = Math.sin(t * Math.PI * 0.56) * 0.72;
    const y = Math.cos(t * Math.PI * 0.56) * 0.34 - (t > 0.85 ? (t - 0.85) * 0.16 : 0);
    pts.push(new THREE.Vector2(Math.max(0.005, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 28);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const ruffle = Math.sin(ang * 7.0) * 0.045 * r + Math.cos(ang * 13.0) * 0.02 * r;
    pos.setXYZ(i, x * (1.0 + Math.sin(ang * 5) * 0.05), y + ruffle, z * (1.0 + Math.cos(ang * 5) * 0.05));
  }
  return applyVertexShading(geo, (x, y, z) => {
    const r = Math.hypot(x, z);
    const rim = 0.82 + r * 0.38;
    const top = 0.85 + Math.max(0, y) * 0.55;
    return [rim * top, rim * top, rim * top];
  });
}

/** Sculpted mushroom underside glowing gill cone */
function buildMushroomGills(): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(0.65, 0.16, 28, 3, true);
  geo.rotateX(Math.PI);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    pos.setY(i, pos.getY(i) + Math.sin(ang * 24.0) * 0.018);
  }
  return applyVertexShading(geo, (x, _y, z) => {
    const r = Math.hypot(x, z);
    const s = 1.05 - r * 0.35;
    return [s, s, s];
  });
}

/** Sculpted curved mushroom stipe / stem */
function buildOrganicStipe(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.05, 0.35, 0.02),
    new THREE.Vector3(-0.03, 0.72, -0.02),
    new THREE.Vector3(0.02, 1.05, 0),
  ]);
  const geo = new THREE.TubeGeometry(curve, 14, 0.1, 10, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / 1.05, 0, 1);
    const bulb = 1.0 + Math.exp(-t * 4.5) * 0.55 - t * 0.25;
    const center = curve.getPoint(t);
    pos.setXYZ(
      i,
      center.x + (pos.getX(i) - center.x) * bulb,
      y,
      center.z + (pos.getZ(i) - center.z) * bulb
    );
  }
  return applyVertexShading(geo, (_x, y) => {
    const t = THREE.MathUtils.clamp(y / 1.05, 0, 1);
    const s = 0.78 + t * 0.28;
    return [s, s, s];
  });
}

/** Sculpted terraced shelf bracket fungus fan */
function buildShelfBracket(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.48, 0.32, 0.09, 16, 2, false, -Math.PI * 0.45, Math.PI * 0.9);
  geo.translate(0, 0, 0.22);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const ang = Math.atan2(x, z);
    pos.setY(i, pos.getY(i) + Math.sin(ang * 7.0) * 0.03 * r + Math.sin(r * 10) * 0.015);
  }
  return applyVertexShading(geo, (x, _y, z) => {
    const r = Math.hypot(x, z);
    const s = 0.75 + r * 0.55;
    return [s, s, s];
  });
}

/** Sculpted puffball spore sac with apical pore */
function buildPuffballSac(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = t * 0.78;
    const r = Math.sin(Math.pow(t, 0.65) * Math.PI) * 0.38 + (t < 0.2 ? 0.14 : 0.03);
    pts.push(new THREE.Vector2(Math.max(0.02, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 20);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const wart = 1.0 + Math.sin(ang * 9 + y * 14) * 0.045;
    pos.setXYZ(i, x * wart, y, z * wart);
  }
  return applyVertexShading(geo, (_x, y) => {
    const t = THREE.MathUtils.clamp(y / 0.78, 0, 1);
    return [0.76 + t * 0.34, 0.76 + t * 0.34, 0.78 + t * 0.32];
  });
}

/** Sculpted crystalline succulent leaf */
function buildCrystalLeaf(): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(0.18, 0.85, 5, 3);
  geo.translate(0, 0.425, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / 0.85, 0, 1);
    pos.setZ(i, pos.getZ(i) * 0.55 + Math.pow(t, 1.5) * 0.16);
  }
  return applyVertexShading(geo, (_x, y) => {
    const t = THREE.MathUtils.clamp(y / 0.85, 0, 1);
    return [0.75 + t * 0.38, 0.8 + t * 0.32, 0.84 + t * 0.3];
  });
}

/** Sculpted organic bumpy morsel / berry */
function buildOrganicChunk(radius: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1.0 + Math.sin(x * 16 + y * 12) * 0.14 + Math.cos(z * 18 - x * 11) * 0.1;
    pos.setXYZ(i, x * n, y * n, z * n);
  }
  return applyVertexShading(geo, (_x, y) => {
    const s = 0.84 + (y > 0 ? 0.2 : 0);
    return [s, s, s];
  });
}

export interface GeometryCatalog {
  // Fauna body plans
  flyerTorso: THREE.BufferGeometry;
  flyerWingInner: THREE.BufferGeometry;
  flyerWingOuter: THREE.BufferGeometry;
  walkerThorax: THREE.BufferGeometry;
  walkerAbdomen: THREE.BufferGeometry;
  legFemur: THREE.BufferGeometry;
  legTibia: THREE.BufferGeometry;
  crawlerSegment: THREE.BufferGeometry;
  slitherHead: THREE.BufferGeometry;
  slitherSegment: THREE.BufferGeometry;
  bouncerBody: THREE.BufferGeometry;
  bouncerThigh: THREE.BufferGeometry;
  bouncerShin: THREE.BufferGeometry;
  // Shared composable fauna parts
  dorsalSail: THREE.BufferGeometry;
  whipAntenna: THREE.BufferGeometry;
  sporePlume: THREE.BufferGeometry;
  prehensionClaw: THREE.BufferGeometry;
  tailFrond: THREE.BufferGeometry;
  mandible: THREE.BufferGeometry;
  proboscis: THREE.BufferGeometry;
  venomStinger: THREE.BufferGeometry;
  vocalSac: THREE.BufferGeometry;
  armorPlate: THREE.BufferGeometry;
  pollenBasket: THREE.BufferGeometry;
  chitinSpine: THREE.BufferGeometry;
  biolumLure: THREE.BufferGeometry;
  eyeSocket: THREE.BufferGeometry;
  eyeGlobe: THREE.BufferGeometry;
  eyeCornea: THREE.BufferGeometry;
  eyeStalk: THREE.BufferGeometry;
  eggShell: THREE.BufferGeometry;
  eggEmbryo: THREE.BufferGeometry;
  // Flora & Fungi parts
  fernFrond: THREE.BufferGeometry;
  blossomPetal: THREE.BufferGeometry;
  blossomCore: THREE.BufferGeometry;
  pitcherCup: THREE.BufferGeometry;
  pitcherLid: THREE.BufferGeometry;
  organicStipe: THREE.BufferGeometry;
  crystalLeaf: THREE.BufferGeometry;
  mushroomCapParasol: THREE.BufferGeometry;
  mushroomGills: THREE.BufferGeometry;
  shelfBracket: THREE.BufferGeometry;
  puffballSac: THREE.BufferGeometry;
  coralAntler: THREE.BufferGeometry;
  rootTendril: THREE.BufferGeometry;
  thornSpike: THREE.BufferGeometry;
  // Morsels & FX
  fleshMorsel: THREE.BufferGeometry;
  floraShred: THREE.BufferGeometry;
  fungusChunk: THREE.BufferGeometry;
  sporeOrb: THREE.BufferGeometry;
  seedPod: THREE.BufferGeometry;
  shockwaveRing: THREE.BufferGeometry;
}

let cachedCatalog: GeometryCatalog | null = null;

export function getGeometryLibrary(): GeometryCatalog {
  if (cachedCatalog) return cachedCatalog;

  const eggShell = new THREE.SphereGeometry(0.18, 16, 14);
  eggShell.scale(0.86, 1.18, 0.86);
  const eggEmbryo = new THREE.SphereGeometry(0.085, 10, 8);
  eggEmbryo.scale(0.8, 1.25, 0.9);

  const eyeSocket = new THREE.TorusGeometry(0.068, 0.02, 8, 14);
  const eyeGlobe = new THREE.SphereGeometry(0.065, 14, 12);
  const eyeCornea = new THREE.SphereGeometry(0.068, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  eyeCornea.rotateX(Math.PI * 0.5);

  const shockwaveRing = new THREE.RingGeometry(0.74, 1.0, 32);
  shockwaveRing.rotateX(-Math.PI * 0.5);

  cachedCatalog = {
    flyerTorso: buildFlyerTorso(),
    flyerWingInner: buildMembranousWing(0.62, 0.44, 0.07),
    flyerWingOuter: buildMembranousWing(0.54, 0.34, 0.05),
    walkerThorax: buildWalkerThorax(),
    walkerAbdomen: buildWalkerAbdomen(),
    legFemur: buildLegSegment(0.36, 0.045, 0.032),
    legTibia: buildLegSegment(0.42, 0.032, 0.016),
    crawlerSegment: buildCrawlerSegment(),
    slitherHead: buildSlitherHead(),
    slitherSegment: buildSlitherSegment(),
    bouncerBody: buildBouncerBody(),
    bouncerThigh: buildLegSegment(0.34, 0.075, 0.052),
    bouncerShin: buildLegSegment(0.42, 0.05, 0.025),
    dorsalSail: buildDorsalSail(),
    whipAntenna: buildCurvedBlade(0.56, 0.015, 0.16),
    sporePlume: buildFernFrond(),
    prehensionClaw: buildCurvedBlade(0.34, 0.032, -0.14),
    tailFrond: buildBlossomPetal(),
    mandible: buildCurvedBlade(0.24, 0.028, -0.11),
    proboscis: buildCurvedBlade(0.36, 0.018, 0.04),
    venomStinger: buildCurvedBlade(0.32, 0.026, -0.06),
    vocalSac: applyVertexShading(new THREE.SphereGeometry(0.14, 12, 10), () => [1.05, 1.0, 0.95]),
    armorPlate: buildCrawlerSegment(),
    pollenBasket: applyVertexShading(new THREE.SphereGeometry(0.09, 10, 8), () => [1.1, 1.02, 0.72]),
    chitinSpine: buildCurvedBlade(0.22, 0.022, 0.04),
    biolumLure: buildCurvedBlade(0.42, 0.014, 0.14),
    eyeSocket,
    eyeGlobe,
    eyeCornea,
    eyeStalk: buildLegSegment(0.22, 0.022, 0.018),
    eggShell,
    eggEmbryo,
    fernFrond: buildFernFrond(),
    blossomPetal: buildBlossomPetal(),
    blossomCore: applyVertexShading(new THREE.SphereGeometry(0.16, 12, 10), () => [1.1, 1.05, 0.85]),
    pitcherCup: buildPitcherCup(),
    pitcherLid: buildBlossomPetal(),
    organicStipe: buildOrganicStipe(),
    crystalLeaf: buildCrystalLeaf(),
    mushroomCapParasol: buildMushroomCapParasol(),
    mushroomGills: buildMushroomGills(),
    shelfBracket: buildShelfBracket(),
    puffballSac: buildPuffballSac(),
    coralAntler: buildCurvedBlade(0.75, 0.048, 0.22),
    rootTendril: buildCurvedBlade(0.52, 0.022, 0.24),
    thornSpike: buildCurvedBlade(0.18, 0.018, 0.04),
    fleshMorsel: buildOrganicChunk(0.11),
    floraShred: buildBlossomPetal(),
    fungusChunk: buildOrganicChunk(0.1),
    sporeOrb: new THREE.SphereGeometry(0.09, 10, 8),
    seedPod: buildOrganicChunk(0.12),
    shockwaveRing,
  };

  return cachedCatalog;
}
