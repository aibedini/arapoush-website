import * as THREE from "three";

/**
 * Parametric parts of the effervescent tube (1 unit = 1 cm), modelled after Arapoush's own product
 * renders: ribbed cap with ARAPOUSH on top, a spiral or straight-bar cage, the perforated silica-gel
 * cartridge with its beads, two flat rings (grey and orange) and the tube with a threaded neck.
 * Only the outside diameter and height are published per size; every other proportion is scaled from
 * the diameter and is illustrative, not a production drawing.
 */

export type CapVariant = "spiral" | "plain";

export type Assembly = {
  root: THREE.Group;
  /** Parts from top to bottom; each has its closed and exploded y (local to the tube). */
  parts: { obj: THREE.Object3D; closed: number; open: number }[];
};

const plastic = (color = 0xf2f3f1) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, clearcoat: 0.35, clearcoatRoughness: 0.4 });

export function lathe(points: [number, number][], segments = 96) {
  const g = new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
  g.computeVertexNormals();
  return g;
}

/** Flat ring with a rectangular section (inner radius, outer radius, height). */
function ring(ri: number, ro: number, hgt: number, segments = 96) {
  return lathe(
    [
      [ri, 0],
      [ro, 0],
      [ro, hgt],
      [ri, hgt],
      [ri, 0],
    ],
    segments,
  );
}

export function tubeBody(d: number, h: number, logo: THREE.Texture | null) {
  const r = d / 2;
  const wall = 0.06;
  const neck = d * 0.2;
  const g = new THREE.Group();
  const body = plastic();
  body.side = THREE.DoubleSide;
  const bend = Math.min(0.18, r * 0.2);
  const pts: [number, number][] = [[0, 0]];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push([r - bend + Math.sin(a) * bend, bend - Math.cos(a) * bend]);
  }
  // Body, a small shoulder bead, then the narrower threaded neck.
  pts.push([r, h - neck - 0.06], [r + 0.02, h - neck - 0.03], [r + 0.02, h - neck], [r * 0.95, h - neck], [r * 0.95, h], [r * 0.95 - wall, h], [r * 0.95 - wall, h - 0.3]);
  g.add(new THREE.Mesh(lathe(pts), body));
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.95 - wall, r - wall, h - 0.32, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xdde2e6, roughness: 0.6, side: THREE.BackSide }),
  );
  inner.position.y = (h - 0.32) / 2 + 0.02;
  g.add(inner);
  // Thread: one and a half turns of a rounded rib around the neck.
  const thread = new THREE.Mesh(new THREE.TubeGeometry(new Helix(r * 0.95, h - neck * 0.85, h - neck * 0.2, 1.5), 140, 0.028, 8), body);
  g.add(thread);
  // Short vertical notches on the neck, as in the renders.
  const notch = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, neck * 0.35, 0.03), body, 8);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    m.makeRotationY(-a).setPosition(Math.cos(a) * (r * 0.95 + 0.012), h - neck * 0.12, Math.sin(a) * (r * 0.95 + 0.012));
    notch.setMatrixAt(i, m);
  }
  g.add(notch);
  if (logo) {
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(r + 0.004, r + 0.004, d * 0.62, 64, 1, true, Math.PI * 0.2, Math.PI * 0.6),
      new THREE.MeshPhysicalMaterial({ color: 0xf2f3f1, roughness: 0.34, clearcoat: 0.35, map: labelTexture(logo), transparent: true }),
    );
    label.position.y = h * 0.62;
    label.rotation.y = -Math.PI / 2;
    g.add(label);
  }
  return { group: g, neck, innerR: r * 0.95 - wall };
}

/** Cap with all its inner parts, positioned for a tube of diameter d and height h. */
export function capAssembly(d: number, h: number, variant: CapVariant): Assembly {
  const r = d / 2;
  const root = new THREE.Group();
  const white = plastic();
  const shade = new THREE.MeshStandardMaterial({ color: 0xd9dee3, roughness: 0.55, side: THREE.DoubleSide });
  const capH = d * 0.42;
  const neck = d * 0.2;

  // ── Cap: smooth crown over a wider ribbed band, hollow underneath ──
  const cap = new THREE.Group();
  const Rb = r * 1.1;
  const Rt = r * 1.06;
  const band = capH * 0.42;
  cap.add(
    new THREE.Mesh(
      lathe([
        [r * 0.97, 0],
        [Rb, 0],
        [Rb, band],
        [Rt, band + 0.02],
        [Rt, capH - 0.06],
        [Rt - 0.06, capH],
        [0, capH],
      ]),
      white,
    ),
  );
  const inside = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, capH - 0.08, 64, 1, true), shade);
  inside.position.y = (capH - 0.08) / 2;
  cap.add(inside);
  const under = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 64), shade);
  under.rotation.x = Math.PI / 2;
  under.position.y = capH - 0.08;
  cap.add(under);
  const ribCount = Math.round(d * 34);
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, band * 0.92, 0.035), white, ribCount);
  const m = new THREE.Matrix4();
  for (let i = 0; i < ribCount; i++) {
    const a = (i / ribCount) * Math.PI * 2;
    m.makeRotationY(-a).setPosition(Math.cos(a) * (Rb + 0.01), band / 2, Math.sin(a) * (Rb + 0.01));
    ribs.setMatrixAt(i, m);
  }
  cap.add(ribs);
  // ARAPOUSH on the crown (the spiral renders) or the embossed mark (the plain renders).
  const top = new THREE.Mesh(new THREE.CircleGeometry(Rt - 0.07, 64), new THREE.MeshPhysicalMaterial({ color: 0xf2f3f1, roughness: 0.34, clearcoat: 0.35, map: crownTexture(variant), transparent: true }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = capH + 0.002;
  cap.add(top);

  // ── Cage that hangs from the cap into the tube ──
  const cage = new THREE.Group();
  const Rc = r * 0.8;
  const cageH = d * 0.62;
  const rim = d * 0.05;
  cage.add(new THREE.Mesh(ring(Rc - 0.07, Rc + 0.02, rim), white));
  const bottom = new THREE.Mesh(ring(Rc - 0.07, Rc, rim * 0.8), white);
  bottom.position.y = -cageH;
  cage.add(bottom);
  const bars = variant === "spiral" ? 4 : 6;
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2 + 0.3;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(variant === "spiral" ? 0.07 : 0.11, cageH, 0.05), white);
    bar.position.set(Math.cos(a) * (Rc - 0.03), -cageH / 2, Math.sin(a) * (Rc - 0.03));
    bar.rotation.y = -a + Math.PI / 2;
    cage.add(bar);
  }
  if (variant === "spiral") {
    const helix = new THREE.Mesh(ribbon(Rc - 0.02, -cageH * 0.92, -cageH * 0.1, 1.35, d * 0.085), white);
    cage.add(helix);
  } else {
    // Notches on the top ring.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.08, rim * 1.6, 0.05), white);
      tab.position.set(Math.cos(a) * (Rc - 0.01), rim * 1.2, Math.sin(a) * (Rc - 0.01));
      tab.rotation.y = -a + Math.PI / 2;
      cage.add(tab);
    }
  }

  // ── Silica-gel cartridge: perforated lid over a clear cup of beads ──
  const cart = new THREE.Group();
  const Rk = r * 0.7;
  const kH = d * 0.28;
  cart.add(new THREE.Mesh(ring(Rk - 0.05, Rk, kH * 0.12), white));
  const base = new THREE.Mesh(new THREE.CircleGeometry(Rk, 48), white);
  base.rotation.x = Math.PI / 2;
  cart.add(base);
  const wallTop = new THREE.Mesh(ring(Rk - 0.05, Rk, kH * 0.14), white);
  wallTop.position.y = kH * 0.86;
  cart.add(wallTop);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(Rk - 0.01, Rk - 0.01, kH * 0.74, 48, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
  );
  glass.position.y = kH * 0.49;
  cart.add(glass);
  const lid = new THREE.Mesh(new THREE.CircleGeometry(Rk, 48), new THREE.MeshStandardMaterial({ color: 0xf0f1ef, roughness: 0.5, map: perforation() }));
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = kH;
  cart.add(lid);
  // Four clips round the lid.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.12, kH * 0.5, 0.04), white);
    clip.position.set(Math.cos(a) * (Rk + 0.015), kH * 0.78, Math.sin(a) * (Rk + 0.015));
    clip.rotation.y = -a + Math.PI / 2;
    cart.add(clip);
  }
  cart.add(beads(Rk - 0.06, kH, variant === "plain"));

  const grey = new THREE.Mesh(ring(r * 0.8, r * 0.92, d * 0.035), new THREE.MeshStandardMaterial({ color: 0xa9adb1, roughness: 0.6 }));
  const orange = new THREE.Mesh(ring(r * 0.84, r * 0.95, d * 0.035), new THREE.MeshStandardMaterial({ color: 0xe8641c, roughness: 0.5 }));

  root.add(cap, cage, cart, grey, orange);
  // Closed: the cap covers the neck; cage and cartridge hang inside; the rings sit on the mouth.
  // Open: the same order, spread upwards like the exploded renders.
  const gap = d * 0.2;
  const parts = [
    { obj: cap, closed: h - neck, open: h + d * 0.42 + kH + cageH + gap * 3.2 },
    { obj: cage, closed: h - 0.08, open: h + d * 0.3 + kH + cageH + gap * 2 },
    { obj: cart, closed: h - cageH * 0.95, open: h + d * 0.2 + gap },
    { obj: grey, closed: h + 0.002, open: h + d * 0.12 + gap * 0.4 },
    { obj: orange, closed: h - 0.03, open: h + d * 0.06 },
  ];
  for (const p of parts) p.obj.position.y = p.closed;
  return { root, parts };
}

/** Effervescent tablet: bevelled disc with a faint speckle, sized to slide in the tube. */
export function tabletGeometry(radius: number, thick: number) {
  const b = thick * 0.28;
  const pts: [number, number][] = [[0, -thick / 2]];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([radius - b + Math.sin(a) * b, -thick / 2 + b - Math.cos(a) * b]);
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([radius - b + Math.cos(a) * b, thick / 2 - b + Math.sin(a) * b]);
  }
  pts.push([0, thick / 2]);
  return lathe(pts, 48);
}

export function tabletMaterial() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f6f3ec";
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = Math.random() < 0.18 ? "rgba(232,137,58,0.45)" : "rgba(160,150,135,0.18)";
    x.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
}

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private radius: number,
    private y0: number,
    private y1: number,
    private turns: number,
  ) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, this.y0 + (this.y1 - this.y0) * t, Math.sin(a) * this.radius);
  }
}

/** A flat band that winds round the cage (the spiral), as a closed box section. */
function ribbon(radius: number, y0: number, y1: number, turns: number, width: number) {
  const steps = 180;
  const th = 0.05;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const y = y0 + (y1 - y0) * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [rr, dy] of [
      [radius, -width / 2],
      [radius, width / 2],
      [radius - th, width / 2],
      [radius - th, -width / 2],
    ] as const)
      pos.push(c * rr, y + dy, s * rr);
  }
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < 4; k++) {
      const a = i * 4 + k;
      const b = i * 4 + ((k + 1) % 4);
      const a2 = a + 4;
      const b2 = b + 4;
      idx.push(a, b, a2, b, b2, a2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function beads(R: number, H: number, blue: boolean) {
  const count = 200;
  const rad = Math.max(0.025, R * 0.065);
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(rad, 10, 8),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1 }),
    count,
  );
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * (R - rad);
    m.makeTranslation(Math.cos(a) * rr, H * 0.15 + Math.random() * H * 0.62, Math.sin(a) * rr);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.set(blue && Math.random() < 0.18 ? 0x4f8fe0 : 0xf4f7fa));
  }
  return mesh;
}

function perforation() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f2f3f1";
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = "#b9c0c6";
  for (let gy = 16; gy < 256; gy += 24)
    for (let gx = 16 + ((gy / 24) % 2) * 12; gx < 256; gx += 24) {
      if ((gx - 128) ** 2 + (gy - 128) ** 2 > 112 ** 2) continue;
      x.beginPath();
      x.arc(gx, gy, 5, 0, Math.PI * 2);
      x.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function crownTexture(variant: CapVariant) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d")!;
  x.fillStyle = "#9aa0a6";
  x.strokeStyle = "#a9afb5";
  x.textAlign = "center";
  x.textBaseline = "middle";
  if (variant === "spiral") {
    x.font = "400 50px Helvetica, Arial, sans-serif";
    // letter-spaced wordmark
    const word = "ARAPOUSH";
    const step = 50;
    word.split("").forEach((ch, i) => x.fillText(ch, 256 + (i - (word.length - 1) / 2) * step, 256));
  } else {
    // Embossed mark: an open ring with a pointer, drawn as an outline.
    x.lineWidth = 10;
    x.beginPath();
    x.arc(236, 266, 70, Math.PI * 0.05, Math.PI * 1.55);
    x.stroke();
    x.beginPath();
    x.moveTo(240, 196);
    x.lineTo(240, 266);
    x.lineTo(320, 236);
    x.closePath();
    x.stroke();
  }
  // Shift the drawing into the "up" direction of the disc after its -90° x rotation.
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.center.set(0.5, 0.5);
  return t;
}

function labelTexture(logo: THREE.Texture) {
  const img = logo.image as HTMLImageElement;
  const c = document.createElement("canvas");
  // Same aspect as the printed band (0.6π of the circumference × 0.62 d), so the logo is not stretched.
  c.width = 1024;
  c.height = 680;
  const x = c.getContext("2d")!;
  const w = 640;
  const hgt = (img.height / img.width) * w;
  x.drawImage(img, (c.width - w) / 2, (c.height - hgt) / 2, w, hgt);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
