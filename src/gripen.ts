import * as THREE from 'three';

// A Saab JAS 39 Gripen built from code: delta wing, canards on the intakes,
// a single swept fin, one engine and Swedish Air Force grey with the
// three-crown roundels. Everything is laid out in metres from the tip of
// the nose (`d` runs back along the aircraft, x to starboard, y up) and the
// whole model is scaled down to game size at the end.

const LENGTH = 14.1;
/** Game units per metre. */
export const GRIPEN_SCALE = 0.25;

// The paint texture is a top view of the aircraft, 9 m wide and 16 m long,
// starting a metre ahead of the nose; painted parts are projected onto it
// from above.
const TEX_W = 9;
const TEX_L = 16;
const PX = 128; // pixels per metre

const GREY = '#8c939a';
const GREY_DARK = '#71787f';
const BLUE = '#006aa7';
const YELLOW = '#fecc02';

/** Turns a position along the aircraft into the model's z (nose towards -z). */
const z = (d: number) => d - LENGTH / 2;

export interface GripenModel {
  group: THREE.Group;
  /** Painted materials, so the hull can flash when hit. */
  paint: THREE.MeshStandardMaterial[];
  /** Engine nozzle exit, in the ship's own (scaled) coordinates. */
  nozzle: THREE.Vector3;
  /** Where the bolts leave from, left and right, in ship coordinates. */
  muzzles: THREE.Vector3[];
}

export function buildGripen(): GripenModel {
  const paintTex = paintTexture();
  const paint = new THREE.MeshStandardMaterial({ map: paintTex, roughness: 0.62, metalness: 0.18 });
  const finPaint = new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.62, metalness: 0.18 });
  finPaint.color.convertSRGBToLinear();
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8, metalness: 0.2 });
  const titanium = new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.38, metalness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x3a3320,
    metalness: 0.55,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.6,
  });
  const missileMat = new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.45, metalness: 0.25 });

  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, painted = false) => {
    if (painted) topUV(geo);
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    return m;
  };

  // Fuselage: a pointed radome, the cockpit, the intakes swelling out
  // either side, then a long taper to the engine.
  //    d     half width  top   bottom  centre
  add(
    loft([
      [0.0, 0.02, 0.02, 0.02, 0.0],
      [0.6, 0.2, 0.19, 0.19, 0.0],
      [1.5, 0.36, 0.32, 0.32, 0.02],
      [2.6, 0.5, 0.44, 0.44, 0.05],
      [3.6, 0.56, 0.52, 0.48, 0.08],
      [4.5, 0.72, 0.56, 0.54, 0.08],
      [5.3, 1.0, 0.58, 0.58, 0.04],
      [6.6, 1.08, 0.62, 0.6, 0.04],
      [8.6, 1.0, 0.62, 0.58, 0.04],
      [10.6, 0.86, 0.6, 0.55, 0.05],
      [12.3, 0.68, 0.54, 0.5, 0.05],
      [13.6, 0.52, 0.47, 0.46, 0.05],
      [14.0, 0.48, 0.45, 0.45, 0.05],
    ]),
    paint,
    true,
  );

  // Intake mouths, just behind the cockpit on each side.
  for (const s of [-1, 1]) {
    const mouth = add(new THREE.CircleGeometry(0.3, 16).rotateY(Math.PI), dark);
    mouth.scale.set(0.9, 1.4, 1);
    mouth.position.set(s * 0.8, -0.02, z(4.85));
  }

  // Delta wings with clipped tips, low on the fuselage.
  for (const s of [-1, 1]) {
    add(
      plate([[0.6, 6.0], [4.1, 10.1], [4.1, 11.7], [0.6, 13.1]].map(([x, d]) => [x * s, d]), 0.14, -0.02),
      paint,
      true,
    );
    // Canards on the intake shoulders.
    add(plate([[0.8, 4.4], [2.45, 6.0], [2.45, 6.45], [0.8, 6.75]].map(([x, d]) => [x * s, d]), 0.08, 0.36), paint, true);
    // An IRIS-T on each wingtip rail.
    const missile = add(new THREE.CylinderGeometry(0.08, 0.08, 2.9, 10).rotateX(Math.PI / 2), missileMat);
    missile.position.set(s * 4.22, -0.05, z(10.5));
    const seeker = add(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), glass);
    seeker.position.set(s * 4.22, -0.05, z(9.05));
    for (const a of [0, Math.PI / 2]) {
      const fins = add(new THREE.BoxGeometry(0.42, 0.015, 0.3), missileMat);
      fins.position.set(s * 4.22, -0.05, z(11.75));
      fins.rotation.z = a;
    }
  }

  // The single tall fin, swept back over the engine.
  const fin = add(fin3d([[8.9, 0.55], [12.0, 3.5], [13.15, 3.5], [13.9, 0.55]], 0.13), finPaint);
  fin.castShadow = true;

  // Bubble canopy with its gold-tinted glazing.
  const canopy = add(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.42, 0.5, 1.35);
  canopy.position.set(0, 0.5, z(3.95));

  // Engine: a titanium nozzle with a dark throat.
  const nozzle = add(new THREE.CylinderGeometry(0.4, 0.47, 0.75, 24, 1, true).rotateX(Math.PI / 2), titanium);
  nozzle.position.set(0, 0.05, z(14.3));
  const throat = add(new THREE.CircleGeometry(0.4, 24), dark);
  throat.position.set(0, 0.05, z(14.05));

  // Pitot probe sticking out of the nose.
  const pitot = add(new THREE.CylinderGeometry(0.018, 0.03, 1.1, 6).rotateX(Math.PI / 2), titanium);
  pitot.position.set(0, 0, z(-0.45));

  g.scale.setScalar(GRIPEN_SCALE);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });

  const S = GRIPEN_SCALE;
  return {
    group: g,
    paint: [paint, finPaint],
    nozzle: new THREE.Vector3(0, 0.05 * S, z(14.7) * S),
    muzzles: [-1, 1].map((s) => new THREE.Vector3(s * 0.9 * S, -0.3 * S, z(5) * S)),
  };
}

// A tube along the aircraft through the given cross-sections. Each section
// is a rounded box (between an ellipse and a rectangle): half width, height
// above and below its centre line.
function loft(stations: number[][], sides = 32): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const e = 0.7; // under 1 squares the sections off a little
  for (const [d, w, top, bottom, c] of stations) {
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const x = w * Math.sign(cs) * Math.abs(cs) ** e;
      const y = c + (sn > 0 ? top : bottom) * Math.sign(sn) * Math.abs(sn) ** e;
      pos.push(x, y, z(d));
    }
  }
  const row = sides + 1;
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < sides; i++) {
      const a = s * row + i;
      const b = a + row;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// A flat surface from its outline in plan view ([x, d] points), given some
// thickness, its top at height `y`.
function plate(outline: number[][], thickness: number, y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, d]) => new THREE.Vector2(x, d)));
  const bevel = thickness * 0.35;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  // Shape y (d) becomes z, and the extrusion points down.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, y - bevel, -LENGTH / 2);
  geo.computeVertexNormals();
  return geo;
}

// The fin from its side outline ([d, y] points), centred on the spine.
function fin3d(outline: number[][], thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([d, y]) => new THREE.Vector2(d, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(thickness / 2, 0, -LENGTH / 2);
  return geo;
}

/** Projects the paint texture onto a part from straight above. */
function topUV(geo: THREE.BufferGeometry): void {
  const p = geo.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + TEX_W / 2) / TEX_W;
    uv[i * 2 + 1] = 1 - (p.getZ(i) + LENGTH / 2 + 1) / TEX_L;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// The paint as seen from above: Air Force grey with soft darker patches,
// panel lines, control surfaces, a little soot behind the engine and a
// roundel on each wing.
function paintTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W * PX;
  canvas.height = TEX_L * PX;
  const g = canvas.getContext('2d')!;
  // Work in metres: x across from the centre line, d back from the nose.
  g.setTransform(PX, 0, 0, PX, (TEX_W / 2) * PX, PX);
  g.fillStyle = GREY;
  g.fillRect(-TEX_W / 2, -1, TEX_W, TEX_L);

  // Soft two-tone patches, mirrored left and right like a real scheme.
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.filter = 'blur(6px)';
  g.fillStyle = GREY_DARK;
  for (let i = 0; i < 9; i++) {
    const x = rand() * 4;
    const d = 2 + rand() * 11;
    const rx = 0.6 + rand() * 1.2;
    const rd = 0.8 + rand() * 1.8;
    const a = rand() * Math.PI;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(x * s, d, rx, rd, a * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Soot fanning back from the nozzle, and wear along the leading edges.
  const soot = g.createLinearGradient(0, 11.5, 0, 14.2);
  soot.addColorStop(0, 'rgba(30, 28, 26, 0)');
  soot.addColorStop(1, 'rgba(30, 28, 26, 0.55)');
  g.fillStyle = soot;
  g.fillRect(-0.7, 11.5, 1.4, 2.7);
  g.filter = 'none';

  // Panel lines and control surfaces.
  g.strokeStyle = 'rgba(40, 44, 48, 0.55)';
  g.lineWidth = 0.022;
  const line = (pts: number[][]) => {
    g.beginPath();
    pts.forEach(([x, d], i) => (i ? g.lineTo(x, d) : g.moveTo(x, d)));
    g.stroke();
  };
  for (const s of [-1, 1]) {
    // Elevons, split in two along the trailing edge.
    line([[0.75 * s, 12.45], [4.0 * s, 11.15]]);
    line([[2.35 * s, 11.78], [2.35 * s, 12.45]]);
    // Leading-edge flaps.
    line([[1.6 * s, 7.15], [4.0 * s, 10.0]]);
    // Canard hinge line.
    line([[0.9 * s, 5.6], [2.4 * s, 6.25]]);
    // Fuselage panels and the intake lip.
    line([[0.55 * s, 2.5], [0.55 * s, 13.5]]);
    line([[0.95 * s, 4.9], [1.05 * s, 6.2]]);
  }
  for (const d of [1.6, 6.6, 8.6, 10.6, 12.3]) line([[-0.9, d], [0.9, d]]);
  // The radome joint and the canopy frame.
  g.lineWidth = 0.035;
  line([[-0.38, 1.6], [0.38, 1.6]]);
  g.beginPath();
  g.ellipse(0, 3.95, 0.44, 1.38, 0, 0, Math.PI * 2);
  g.stroke();
  // Walkway dots and stencils near the spine.
  g.fillStyle = 'rgba(40, 44, 48, 0.5)';
  for (let d = 6.8; d < 12; d += 0.35) g.fillRect(-0.04, d, 0.08, 0.04);

  for (const s of [-1, 1]) roundel(g, 2.75 * s, 10.75, 0.55);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// The Swedish roundel: three gold crowns on a blue disc, two over one.
function roundel(g: CanvasRenderingContext2D, x: number, d: number, r: number): void {
  g.fillStyle = YELLOW;
  g.beginPath();
  g.arc(x, d, r * 1.04, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = BLUE;
  g.beginPath();
  g.arc(x, d, r, 0, Math.PI * 2);
  g.fill();
  const c = r * 0.36;
  crown(g, x - r * 0.38, d - r * 0.3, c);
  crown(g, x + r * 0.38, d - r * 0.3, c);
  crown(g, x, d + r * 0.38, c);
}

// An open crown, `s` wide, centred on (x, d), pointing towards the nose.
function crown(g: CanvasRenderingContext2D, x: number, d: number, s: number): void {
  const h = s * 0.8;
  g.fillStyle = YELLOW;
  g.beginPath();
  g.moveTo(x - s / 2, d + h / 2);
  g.lineTo(x + s / 2, d + h / 2);
  g.lineTo(x + s / 2, d - h * 0.15);
  g.lineTo(x + s * 0.5, d - h * 0.5);
  g.lineTo(x + s * 0.25, d - h * 0.05);
  g.lineTo(x, d - h * 0.6);
  g.lineTo(x - s * 0.25, d - h * 0.05);
  g.lineTo(x - s * 0.5, d - h * 0.5);
  g.lineTo(x - s / 2, d - h * 0.15);
  g.closePath();
  g.fill();
  for (const k of [-0.5, 0, 0.5]) {
    g.beginPath();
    g.arc(x + s * k, d - h * (k ? 0.55 : 0.68), s * 0.09, 0, Math.PI * 2);
    g.fill();
  }
}
