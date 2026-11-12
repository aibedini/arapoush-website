import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ClosureModel, ClosureModel3d, ClosureShape, ShapeModel } from "@/lib/configurator/model";

/**
 * Parametric tube scene. 1 world unit = 10 mm, so a Ø30 × 110 tube is 3 × 11 units and
 * a Ø60 × 110 one is visibly twice as wide. The tube stands on its closure, crimp up.
 * Visual model only — not production CAD.
 */

const OVAL = { x: 1.12, z: 0.74 };
const AXES: Record<string, THREE.Vector3> = {
  "+Y": new THREE.Vector3(0, 1, 0),
  "-Y": new THREE.Vector3(0, -1, 0),
  "+X": new THREE.Vector3(1, 0, 0),
  "-X": new THREE.Vector3(-1, 0, 0),
  "+Z": new THREE.Vector3(0, 0, 1),
  "-Z": new THREE.Vector3(0, 0, -1),
};

/** What the mesh is built from: catalogue ids are mapped to geometry families before they get here. */
/** How the tube is finished: cap material, body colour, print style (T3). */
export type SceneLook = {
  cap?: { kind: "solid" | "clear" | "metallic"; hex: string };
  body?: string;
  print?: { effect: "flat" | "halftone" | "raised" | "foil" | "combo"; foil?: string; artwork?: string };
};
export type SceneSpec = { d: number; l: number; shape: ShapeModel; closure: ClosureModel; closureShape?: ClosureShape; closureModel?: ClosureModel3d; look?: SceneLook };
export type SceneLabels = {
  /** Wall layers of the selected structure, outside → inside. */
  layers: { name: string; color: string }[];
  closure: string;
  notToScale: string;
};
export type SceneOptions = {
  canvas: HTMLCanvasElement;
  overlay: SVGSVGElement;
  reducedMotion: boolean;
  labels: SceneLabels;
  font: string;
  onInteract?: () => void;
};

type Built = {
  root: THREE.Group;
  closure: THREE.Group;
  lid: THREE.Object3D | null;
  layers: THREE.Group;
  rx: number;
  rz: number;
  L: number;
  capDrop: number;
  floor: number;
};

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

export class TubeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  private controls: OrbitControls;
  private pivot = new THREE.Group();
  private built: Built | null = null;
  private cfg: SceneSpec | null = null;
  private layersKey = "";
  private env: THREE.Texture;
  private shadow: THREE.Mesh;
  private ring: THREE.Mesh;
  private raf = 0;
  private visible = true;
  private dims = true;
  private explode = 0;
  private explodeTarget = 0;
  private tween: { from: THREE.Vector3; start: number } | null = null;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private disposed = false;

  constructor(private o: SceneOptions) {
    const mobile = matchMedia("(max-width: 767px)").matches;
    this.renderer = new THREE.WebGLRenderer({
      canvas: o.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    // Studio light: neutral room reflections, warm key, cool rim. All generated locally — no HDR download.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.65;
    const key = new THREE.DirectionalLight(0xfff4ea, 2.4);
    key.position.set(-6, 10, 8);
    const rim = new THREE.DirectionalLight(0xcfe2ff, 1.4);
    rim.position.set(7, 4, -8);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0xc9d4de, 0.5));

    // Soft contact shadow + the 360° turntable ring from the concept.
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: blobTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 128),
      new THREE.MeshBasicMaterial({
        color: 0xe8893a,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.pivot, this.shadow, this.ring);

    this.controls = new OrbitControls(this.camera, o.canvas);
    this.controls.enableDamping = !o.reducedMotion;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.12;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.addEventListener("start", () => o.onInteract?.());
    this.controls.addEventListener("change", () => this.invalidate());
    // OrbitControls claims every touch; give vertical swipes back to the page so it never traps scrolling.
    o.canvas.style.touchAction = "pan-y";

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(o.canvas.parentElement!);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = !!e?.isIntersecting;
      this.invalidate();
    });
    this.io.observe(o.canvas);
    document.addEventListener("visibilitychange", this.invalidate);
    this.resize();
  }

  setConfig(cfg: SceneSpec) {
    const c = this.cfg;
    const layersKey = this.o.labels.layers.map((x) => x.color).join();
    if (c && JSON.stringify(c) === JSON.stringify(cfg) && layersKey === this.layersKey) return this.invalidate();
    this.layersKey = layersKey;
    const prev = this.built;
    this.cfg = cfg;
    if (prev) {
      this.pivot.remove(prev.root);
      disposeTree(prev.root);
    }
    const b = buildTube(cfg, this.o.font, this.o.labels.layers.map((x) => x.color));
    this.built = b;
    this.pivot.add(b.root);
    this.applyExplode();
    // Grow/shrink from the previous size instead of popping (skipped for reduced motion).
    if (prev && !this.o.reducedMotion) {
      this.tween = {
        from: new THREE.Vector3(prev.rx / b.rx, prev.L / b.L, prev.rz / b.rz),
        start: performance.now(),
      };
    }
    this.frameModel(!prev);
    this.invalidate();
    if (cfg.closureModel) void this.mountModel(b, cfg.closureModel);
  }

  /**
   * Swaps the parametric closure for the approved factory model once it has loaded: rotated so its
   * opening faces down onto the tube, its anchor on the neck top, millimetres to scene units. Never scaled
   * to fit; if loading fails the parametric closure simply stays.
   */
  private async mountModel(b: Built, m: ClosureModel3d) {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/libs/meshopt_decoder.module.js")]);
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(m.src);
      if (this.built !== b) return disposeTree(gltf.scene);
      const [ax, ay, az] = [m.anchorMm[0] ?? 0, m.anchorMm[1] ?? 0, m.anchorMm[2] ?? 0];
      gltf.scene.position.set(-ax, -ay, -az);
      const holder = new THREE.Group();
      holder.add(gltf.scene);
      // `axis` is the way the opening faces; the tube is below the neck top (−Y).
      holder.quaternion.setFromUnitVectors(AXES[m.axis] ?? AXES["-Y"], new THREE.Vector3(0, -1, 0));
      holder.scale.setScalar(0.1); // 1 unit = 10 mm
      holder.updateMatrixWorld(true);
      const chosen = capMaterial(this.cfg?.look?.cap);
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        // The visitor's cap colour wins over the CAD file's display colour.
        if (chosen) mesh.material = chosen;
      });
      const box = new THREE.Box3().setFromObject(holder);
      [...b.closure.children].forEach((ch) => {
        b.closure.remove(ch);
        disposeTree(ch);
      });
      b.closure.add(holder);
      b.lid = null;
      b.floor = Math.min(-0.2, box.min.y);
      b.capDrop = Math.abs(b.floor) + 1.4;
      this.applyExplode();
      this.frameModel(false);
      this.invalidate();
    } catch {
      /* keep the parametric closure */
    }
  }

  setLabels(labels: SceneLabels) {
    this.o.labels = labels;
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on && !this.o.reducedMotion;
    this.invalidate();
  }
  setDimensions(on: boolean) {
    this.dims = on;
    this.invalidate();
  }
  setExplode(on: boolean) {
    this.explodeTarget = on ? 1 : 0;
    if (this.o.reducedMotion) this.explode = this.explodeTarget;
    this.frameModel(false);
    this.invalidate();
  }

  /** Keyboard / button equivalents of the pointer gestures. */
  rotate(radians: number) {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
  }
  zoom(factor: number) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = THREE.MathUtils.clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(off.setLength(len));
    this.controls.update();
  }
  reset() {
    this.frameModel(true);
    this.invalidate();
  }

  /** PNG of the current view on a white backdrop, with the spec line printed underneath. */
  snapshot(caption: string): string {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const pad = Math.round(src.height * 0.08);
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height + pad;
    const x = c.getContext("2d")!;
    x.fillStyle = "#f6f8fa";
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0);
    x.fillStyle = "#0e2b46";
    x.font = `500 ${Math.round(pad * 0.36)}px ${this.o.font}`;
    x.textAlign = "center";
    x.fillText(caption, c.width / 2, src.height + pad * 0.6);
    return c.toDataURL("image/png");
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener("visibilitychange", this.invalidate);
    this.controls.dispose();
    if (this.built) disposeTree(this.built.root);
    disposeTree(this.scene);
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.o.overlay.replaceChildren();
  }

  invalidate = () => {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
  };

  private tick = (now: number) => {
    this.raf = 0;
    if (!this.visible || document.hidden || !this.built) return;
    let busy = this.controls.update();
    busy = this.controls.autoRotate || busy;
    if (this.tween) {
      const t = Math.min(1, (now - this.tween.start) / 260);
      const k = ease(t);
      const f = this.tween.from;
      this.built.root.scale.set(lerp(f.x, 1, k), lerp(f.y, 1, k), lerp(f.z, 1, k));
      if (t >= 1) this.tween = null;
      busy = true;
    }
    if (this.explode !== this.explodeTarget) {
      const step = 1 / 18;
      this.explode = this.explode < this.explodeTarget ? Math.min(this.explodeTarget, this.explode + step) : Math.max(this.explodeTarget, this.explode - step);
      this.applyExplode();
      busy = true;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
    if (busy) this.invalidate();
  };

  private resize() {
    const el = this.o.canvas.parentElement!;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.o.overlay.setAttribute("viewBox", `0 0 ${w} ${h}`);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.frameModel(false);
    this.invalidate();
  }

  /** Fit the tube (and the exploded parts) in view; keeps the current orbit angle unless reset. */
  private frameModel(resetAngle: boolean) {
    const b = this.built;
    if (!b) return;
    const top = b.L + 1.6;
    const bottom = b.floor - b.capDrop * this.explodeTarget;
    const height = top - bottom;
    const width = Math.max(b.rx, b.rz) * 2 * (1 + this.explodeTarget * 1.6);
    const cy = (top + bottom) / 2;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitH = (height * 1.18) / 2 / Math.tan(vFov / 2);
    const fitW = (width * 1.6) / 2 / Math.tan(vFov / 2) / this.camera.aspect;
    const dist = Math.max(fitH, fitW, 12);
    const dir =
      resetAngle || this.camera.position.lengthSq() < 0.01
        ? new THREE.Vector3(0.28, 0.3, 0.91).normalize()
        : this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.set(0, cy, 0);
    this.camera.position.copy(this.controls.target).add(dir.multiplyScalar(dist));
    this.controls.minDistance = dist * 0.45;
    this.controls.maxDistance = dist * 1.9;
    this.controls.update();
    const footprint = Math.max(b.rx, b.rz);
    this.shadow.position.y = b.floor + 0.01;
    this.shadow.scale.setScalar(footprint * 5);
    this.ring.position.y = b.floor + 0.005;
    this.ring.scale.setScalar(footprint * 2.6);
  }

  private applyExplode() {
    const b = this.built;
    if (!b) return;
    const k = smooth(this.explode);
    b.closure.position.y = -b.capDrop * k;
    if (b.lid) b.lid.rotation.x = 1.9 * k;
    b.layers.visible = k > 0.001;
    b.layers.children.forEach((layer, i) => {
      layer.position.x = (0.25 + i * 0.42) * Math.max(b.rx, 1) * k;
      layer.position.z = i * 0.05 * k;
      ((layer as THREE.Mesh).material as THREE.Material).opacity = k;
    });
  }

  /** Dimension guides (and layer callouts when inspecting), projected from world space every frame. */
  private drawOverlay() {
    const svg = this.o.overlay;
    const b = this.built;
    if (!b || !this.cfg) return;
    const w = svg.viewBox.baseVal.width;
    const h = svg.viewBox.baseVal.height;
    const s = b.root.scale;
    const project = (v: THREE.Vector3) => {
      const p = v.applyMatrix4(b.root.matrixWorld).project(this.camera);
      return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
    };
    b.root.updateMatrixWorld(true);
    // Guides sit on the camera's right-hand side of the tube so they never cross it.
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const reach = Math.max(b.rx, b.rz);
    const out: string[] = [];
    const line = (a: { x: number; y: number }, c: { x: number; y: number }) =>
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${c.x.toFixed(1)}" y2="${c.y.toFixed(1)}"/>`;
    const tag = (p: { x: number; y: number }, text: string, cls = "") =>
      `<g class="tag ${cls}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><rect x="-40" y="-13" width="80" height="26" rx="13"/><text y="4.5" text-anchor="middle">${text}</text></g>`;

    if (this.dims && this.explode < 0.5) {
      const off = right.clone().multiplyScalar((reach * 1.55) / s.x);
      const a = project(new THREE.Vector3(0, 0, 0).add(off));
      const c = project(new THREE.Vector3(0, b.L, 0).add(off));
      const d1 = project(
        right
          .clone()
          .multiplyScalar(-reach / s.x)
          .setY(b.L + 0.9),
      );
      const d2 = project(
        right
          .clone()
          .multiplyScalar(reach / s.x)
          .setY(b.L + 0.9),
      );
      out.push(`<g class="dim">${line(a, c)}${line(d1, d2)}</g>`);
      out.push(tag({ x: (a.x + c.x) / 2 + 46, y: (a.y + c.y) / 2 }, `${this.cfg.l} mm`));
      out.push(tag({ x: (d1.x + d2.x) / 2, y: Math.min(d1.y, d2.y) - 20 }, `Ø ${this.cfg.d} mm`));
    }
    if (this.explode > 0.6) {
      // Each sheet's outer edge gets a leader line to a legend column on the right.
      const anchors = b.layers.children.map((layer, i) => project(new THREE.Vector3(layer.position.x + b.rx * (1 - i * 0.05), b.L * (0.72 - i * 0.06), 0)));
      const colX = Math.min(w - 150, Math.max(...anchors.map((a) => a.x)) + 28);
      const colY = Math.max(24, Math.min(...anchors.map((a) => a.y)) - 10);
      anchors.forEach((a, i) => {
        const y = colY + i * 24;
        out.push(
          `<g class="callout"><polyline points="${a.x.toFixed(1)},${a.y.toFixed(1)} ${(colX - 8).toFixed(1)},${y}"/><circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="3" fill="${this.o.labels.layers[i]?.color ?? "#999"}"/><text x="${colX}" y="${y + 4}">${escapeXml(this.o.labels.layers[i]?.name ?? "")}</text></g>`,
        );
      });
      const cap = project(new THREE.Vector3(reach * 1.2, -b.capDrop + b.floor * 0.5, 0));
      out.push(`<g class="callout"><text x="${cap.x.toFixed(1)}" y="${cap.y.toFixed(1)}">${escapeXml(this.o.labels.closure)}</text></g>`);
      out.push(`<text class="note" x="${w / 2}" y="22" text-anchor="middle">${escapeXml(this.o.labels.notToScale)}</text>`);
    }
    svg.innerHTML = out.join("");
  }
}

/* ───────────────────────── geometry ───────────────────────── */

function buildTube(cfg: SceneSpec, font: string, layerColors: string[]): Built {
  const r = cfg.d / 20;
  const L = cfg.l / 10;
  const oval = cfg.shape === "oval";
  const ox = oval ? OVAL.x : 1;
  const oz = oval ? OVAL.z : 1;
  const root = new THREE.Group();

  const art = artwork(cfg, font);
  const body = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: art.map,
    roughness: 0.34,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
    sheen: 0.2,
    sheenColor: new THREE.Color(0xe9eef3),
  });
  // Foil prints shine where the foil is (metalness/roughness map); silk ink stands proud (bump map).
  if (art.pbr) {
    body.metalnessMap = art.pbr;
    body.roughnessMap = art.pbr;
    body.metalness = 1;
    body.roughness = 1;
  }
  if (art.bump) {
    body.bumpMap = art.bump;
    body.bumpScale = 2.2;
  }
  const plastic = new THREE.MeshPhysicalMaterial({
    color: 0xf2f3f4,
    roughness: 0.38,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
  });
  const shadowed = new THREE.MeshStandardMaterial({
    color: 0xdfe4e8,
    roughness: 0.55,
  });
  const capMat = capMaterial(cfg.look?.cap) ?? plastic;

  // Shoulder + body + crimp transition as one smooth surface.
  const eye = cfg.shape === "eyeNozzle";
  // With a factory model the neck is the one the cap is made for (neckDiameterMm), never a guess.
  const neckR = eye ? r * 0.16 : cfg.closureModel ? cfg.closureModel.neckDiameterMm / 20 : Math.max(0.36, r * 0.42);
  const shoulderH = eye ? r * 1.7 : Math.max(0.45, r * 0.42);
  const crimpH = Math.min(L * 0.22, r * 1.15 + 0.4);
  const sealH = 0.45;
  const rows: { y: number; rad: number; ovalMix: number; crimp: number }[] = [];
  const SH = 14;
  for (let i = 0; i <= SH; i++) {
    const t = i / SH;
    // eye-nozzle: long convex taper to the tip; standard: rounded shoulder from neck to body.
    const rad = eye ? lerp(neckR, r, Math.sin((t * Math.PI) / 2) ** 0.8) : lerp(neckR, r, Math.sqrt(1 - (1 - t) ** 2));
    rows.push({ y: t * shoulderH, rad, ovalMix: smooth(t), crimp: 0 });
  }
  const bodyTop = L - sealH;
  rows.push({
    y: Math.max(shoulderH + 0.01, bodyTop - crimpH),
    rad: r,
    ovalMix: 1,
    crimp: 0,
  });
  const CR = 16;
  for (let i = 1; i <= CR; i++) {
    const t = i / CR;
    rows.push({
      y: bodyTop - crimpH + crimpH * t,
      rad: r,
      ovalMix: 1,
      crimp: smooth(t),
    });
  }
  const shell = new THREE.Mesh(surface(rows, ox, oz, shoulderH, bodyTop), body);
  root.add(shell);

  // Flat sealed crimp with its ribbed pattern.
  const flatHalf = (Math.PI * (r * ox + r * oz)) / 4;
  const seal = new THREE.Mesh(new THREE.BoxGeometry(flatHalf * 2, sealH, 0.07, 1, 1, 1), sealMaterial(flatHalf * 2, cfg.look?.body));
  seal.position.y = bodyTop + sealH / 2;
  root.add(seal);

  // Neck: threaded finish under the closure (visible when the closure is pulled off).
  const closure = new THREE.Group();
  let lid: THREE.Object3D | null = null;
  let floor: number;
  if (eye) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(neckR * 0.55, neckR, 0.5, 32), plastic);
    tip.position.y = -0.25;
    root.add(tip);
    // Protective nozzle cap over the tip (long or short: shape3d.height).
    const capH = Math.max(0.9, r * (cfg.closureShape?.height ?? 1.3));
    const cap = new THREE.Mesh(
      lathe([
        [0, -capH],
        [neckR * 1.7, -capH],
        [neckR * 2.3, -capH * 0.3],
        [neckR * 2.6, 0.15],
        [neckR * 2.5, 0.25],
        [0, 0.25],
      ]),
      capMat,
    );
    closure.add(cap);
    floor = -capH;
  } else {
    const neckH = 0.75;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(neckR, neckR, neckH, 48), plastic);
    neck.position.y = -neckH / 2;
    const thread = new THREE.Mesh(new THREE.TubeGeometry(new Helix(neckR, -neckH * 0.85, -neckH * 0.15, 2.2), 160, 0.035, 8), plastic);
    root.add(neck, thread);
    const built = cfg.closure === "param" ? buildParam(cfg.closureShape ?? {}, r, neckR, cfg.shape === "oval", capMat, shadowed) : buildClosure(cfg.closure, r, neckR, capMat, shadowed);
    closure.add(built.group);
    lid = built.lid;
    floor = built.floor;
  }
  root.add(closure);

  // Inspection: the structure's co-extruded layers, schematic thickness, fanned out beside the body.
  const layers = new THREE.Group();
  layerColors.forEach((color, i) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const g = new THREE.CylinderGeometry(r * (1 - i * 0.05), r * (1 - i * 0.05), L * 0.5, 64, 1, true, -Math.PI / 3, (Math.PI * 2) / 3);
    g.rotateY(Math.PI / 2); // open side faces +x, where the layers fan out
    g.scale(ox, 1, oz);
    g.translate(0, L * 0.5, 0);
    const mesh = new THREE.Mesh(g, m);
    layers.add(mesh);
  });
  root.add(layers);

  return {
    root,
    closure,
    lid,
    layers,
    rx: r * ox,
    rz: r * oz,
    L,
    capDrop: Math.abs(floor) + 1.4,
    floor,
  };
}

function buildClosure(kind: ClosureModel, r: number, neckR: number, plastic: THREE.Material, shadowed: THREE.Material) {
  const group = new THREE.Group();
  let lid: THREE.Object3D | null = null;
  let floor = 0;
  if (kind === "screw" || kind === "plain") {
    const R = r * 0.86;
    const H = Math.max(1, R * 1.1);
    const g = lathe(
      [
        [0, -H],
        [R - 0.08, -H],
        [R, -H + 0.08],
        [R, -0.02],
        [R - 0.04, 0],
        [neckR, 0],
      ],
      192,
    );
    if (kind === "screw") ribs(g, R, -H + 0.12, -0.08, 60); // plain caps stay smooth
    group.add(new THREE.Mesh(g, plastic));
    floor = -H;
  } else if (kind === "flipTop") {
    const R = r * 0.97;
    const H = Math.max(1.1, R * 1.25);
    const split = -H * 0.62;
    const base = new THREE.Mesh(
      lathe([
        [neckR, 0],
        [R - 0.05, 0],
        [R, -0.06],
        [R, split + 0.02],
        [0, split + 0.02],
      ]),
      plastic,
    );
    const groove = new THREE.Mesh(new THREE.TorusGeometry(R * 0.995, 0.018, 6, 96), shadowed);
    groove.rotation.x = Math.PI / 2;
    groove.position.y = split;
    // Lid hinges at the back; rotating the pivot opens it in inspect mode.
    const pivot = new THREE.Group();
    pivot.position.set(0, split, -R);
    const lidMesh = new THREE.Mesh(
      lathe([
        [0, split],
        [R, split],
        [R, -H + 0.12],
        [R - 0.12, -H],
        [0, -H],
      ]),
      plastic,
    );
    lidMesh.position.set(0, -split, R);
    // Thumb recess on the front of the lid.
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(R * 0.36, 32, 16), shadowed);
    thumb.scale.set(1, 0.55, 0.16);
    thumb.position.set(0, (-H - split) / 2, R * 1.97);
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(R * 0.5, 0.16, 0.08), shadowed);
    hinge.position.set(0, 0, -0.02);
    pivot.add(lidMesh, thumb, hinge);
    group.add(base, groove, pivot);
    lid = pivot;
    floor = -H;
  } else if (kind === "nozzle") {
    const R = r * 0.78;
    const collarH = Math.max(0.8, R * 0.9);
    const coneH = Math.max(1.4, R * 1.9);
    const g = lathe([
      [neckR, 0],
      [R - 0.04, 0],
      [R, -0.05],
      [R, -collarH + 0.06],
      [R - 0.08, -collarH],
      [R * 0.55, -collarH - 0.05],
      [R * 0.16, -collarH - coneH],
      [R * 0.09, -collarH - coneH - 0.04],
      [0, -collarH - coneH - 0.04],
    ]);
    group.add(new THREE.Mesh(g, plastic));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(R * 0.05, 24), new THREE.MeshBasicMaterial({ color: 0x55636e }));
    hole.rotation.x = Math.PI / 2;
    hole.position.y = -collarH - coneH - 0.045;
    group.add(hole);
    floor = -collarH - coneH - 0.04;
  } else {
    // Stand-up cap: narrow collar on the neck, wide flat foot to stand on.
    const R = r * 1.02;
    const collarR = Math.max(neckR + 0.12, R * 0.55);
    const collarH = Math.max(0.5, R * 0.55);
    const footH = Math.max(0.9, R * 0.85);
    const g = lathe([
      [neckR, 0],
      [collarR - 0.05, 0],
      [collarR, -0.05],
      [collarR, -collarH],
      [R - 0.18, -collarH - 0.02],
      [R, -collarH - 0.2],
      [R, -collarH - footH + 0.06],
      [R - 0.08, -collarH - footH],
      [0, -collarH - footH],
    ]);
    group.add(new THREE.Mesh(g, plastic));
    floor = -collarH - footH;
  }
  return { group, lid, floor };
}

/**
 * The parametric closure: a skirt from the neck down to `height`, then a flat, domed, conical or
 * bullet top. Octagonal bodies are an 8-segment lathe; oval ones follow the tube's ellipse.
 */
function buildParam(p: ClosureShape, r: number, neckR: number, ovalTube: boolean, plastic: THREE.Material, shadowed: THREE.Material) {
  const group = new THREE.Group();
  const R = Math.max(neckR + 0.1, r * clampN(p.width, 0.4, 1.4, 0.9));
  const H = Math.max(0.5, r * clampN(p.height, 0.2, 4, 1));
  const T = r * clampN(p.topHeight, 0, 3, 0);
  const top = p.top ?? "flat";
  const pts: [number, number][] = [
    [neckR, 0],
    [R - 0.04, 0],
    [R, -0.05],
    [R, -H + 0.07],
  ];
  if (top === "flat" || T === 0) pts.push([R - 0.07, -H], [0, -H]);
  else {
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // dome: quarter ellipse; bullet: ogive that stays full longer; cone: straight to a small flat tip.
      const x = top === "dome" ? Math.cos((t * Math.PI) / 2) : top === "bullet" ? Math.sqrt(Math.max(0, 1 - t ** 2.4)) : Math.max(0.12, 1 - t);
      const y = top === "dome" ? Math.sin((t * Math.PI) / 2) : t;
      pts.push([R * x, -H - T * y]);
    }
    pts.push([0, -H - T]);
  }
  const g = lathe(pts, p.body === "octagon" ? 8 : 192);
  const ribCount = Math.round(clampN(p.ribs, 0, 120, 0));
  if (ribCount && p.body !== "octagon") ribs(g, R, -H + 0.12, -0.08, ribCount);
  if (p.oval && ovalTube) {
    g.scale(OVAL.x, 1, OVAL.z);
    g.computeVertexNormals();
  }
  group.add(new THREE.Mesh(g, plastic));
  if (p.pump) {
    // Overcap meets the pump base a third of the way down.
    const seam = new THREE.Mesh(new THREE.TorusGeometry(R * 1.002, 0.02, 6, 128), shadowed);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = -H * 0.34;
    if (p.oval && ovalTube) seam.scale.set(OVAL.x, OVAL.z, 1);
    group.add(seam);
  }
  return { group, lid: null as THREE.Object3D | null, floor: -H - T };
}

const clampN = (v: number | undefined, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

/** Surface of revolution with an elliptical cross-section that flattens into the crimp at the top. */
function surface(rows: { y: number; rad: number; ovalMix: number; crimp: number }[], ox: number, oz: number, vStart: number, vEnd: number) {
  const seg = 128;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  rows.forEach((row, j) => {
    const sx = lerp(1, ox, row.ovalMix);
    const sz = lerp(1, oz, row.ovalMix);
    const rx0 = row.rad * sx;
    const rz0 = row.rad * sz;
    const flat = (Math.PI * (rx0 + rz0)) / 4;
    const rx = lerp(rx0, flat, row.crimp);
    const rz = lerp(rz0, 0.035, row.crimp);
    // Artwork runs between shoulder end and seal; shoulder rows clamp to the plain edge of the print.
    const v = THREE.MathUtils.clamp((row.y - vStart) / (vEnd - vStart), 0, 1);
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const a = (u - 0.5) * Math.PI * 2; // u = 0.5 faces +z, where the artwork is centred
      pos.push(Math.sin(a) * rx, row.y, Math.cos(a) * rz);
      uv.push(u, v);
      if (j < rows.length - 1 && i < seg) {
        const p = j * (seg + 1) + i;
        const q = p + seg + 1;
        idx.push(p, p + 1, q, p + 1, q + 1, q); // counter-clockwise from outside
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lathe from [radius, y] points (closure parts). */
function lathe(points: [number, number][], segments = 96) {
  const g = new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y)),
    segments,
  );
  g.computeVertexNormals();
  return g;
}

/** Knurled grip: pushes the cap wall out in narrow vertical ribs. */
function ribs(g: THREE.BufferGeometry, R: number, y0: number, y1: number, count: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const rad = Math.hypot(x, z);
    if (y < y0 || y > y1 || rad < R * 0.98) continue;
    const a = Math.atan2(x, z);
    const k = 1 + 0.035 * Math.pow(Math.abs(Math.cos((a * count) / 2)), 8);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
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
    const a = t * Math.PI * 2 * this.turns;
    return target.set(Math.sin(a) * this.radius, lerp(this.y0, this.y1, t), Math.cos(a) * this.radius);
  }
}

/* ───────────────────────── textures ───────────────────────── */

/** Cap finish from the chosen colour family: matte-gloss plastic, frosted clear, or metallised. */
function capMaterial(cap: SceneLook["cap"]) {
  if (!cap) return null;
  const color = new THREE.Color(cap.hex);
  if (cap.kind === "metallic") return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.24, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  if (cap.kind === "clear")
    return new THREE.MeshPhysicalMaterial({ color, transmission: 0.92, roughness: 0.14, thickness: 0.5, ior: 1.5, transparent: true, opacity: 0.95, clearcoat: 0.4 });
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.3 });
}

/**
 * Print artwork wrapped around the body, drawn at the tube's real aspect so it never stretches.
 * The Arapoush sample design (wordmark, navy sweep, warm line) is painted in the chosen method's
 * style on the chosen body colour; an operator's sample artwork replaces it when the print has one.
 *   flat: solid inks · halftone: process dots, no overlaps · raised: opaque silk ink (bump)
 *   foil: metallic hot stamp only · combo: flexo sweep, silk line, foil wordmark
 * Returns the colour map plus, when needed, a metalness/roughness map and a bump map.
 */
function artwork(cfg: SceneSpec, font: string) {
  const look = cfg.look ?? {};
  const effect = look.print?.effect;
  const bodyHex = look.body ?? "#fbfcfd";
  const circumference = Math.PI * cfg.d;
  const W = 1024;
  const H = THREE.MathUtils.clamp(Math.round((W * cfg.l) / circumference), 256, 2048);
  const canvas = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return [c, c.getContext("2d")!];
  };
  const [cc, x] = canvas();
  const pbrCanvas = effect === "foil" || effect === "combo" ? canvas() : null;
  const bumpCanvas = effect === "raised" || effect === "combo" ? canvas() : null;
  const p = pbrCanvas?.[1];
  const b = bumpCanvas?.[1];
  // Base: body colour; plastic roughness in G, no metal in B; flat bump.
  x.fillStyle = bodyHex;
  x.fillRect(0, 0, W, H);
  if (p) {
    p.fillStyle = "rgb(0,87,0)";
    p.fillRect(0, 0, W, H);
  }
  if (b) {
    b.fillStyle = "#000";
    b.fillRect(0, 0, W, H);
  }
  const dark = new THREE.Color(bodyHex).getHSL({ h: 0, s: 0, l: 0 }).l < 0.45;
  const foil = look.print?.foil ?? "#c9a24a";
  const METAL = "rgb(0,46,255)"; // metal, polished

  const mm = W / circumference; // canvas px per mm around the tube
  const cx = W / 2; // front of the tube (u = 0.5 faces the camera at start)
  const face = cfg.d * 0.95 * mm;
  let size = face * 0.2;
  x.font = `700 ${size}px ${font}`;
  size *= Math.min(1, (face * 0.8) / x.measureText("ARAPOUSH").width);
  const top = H * 0.36 + size; // clear of the crimp taper

  const sweep = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.moveTo(0, H * 0.94);
    ctx.bezierCurveTo(W * 0.3, H * 0.62, W * 0.62, H * 0.86, W, H * 0.6);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
  };
  const line = (ctx: CanvasRenderingContext2D, width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.91);
    ctx.bezierCurveTo(W * 0.3, H * 0.59, W * 0.62, H * 0.83, W, H * 0.57);
    ctx.stroke();
  };
  const words = (ctx: CanvasRenderingContext2D) => {
    ctx.textAlign = "center";
    ctx.font = `700 ${size}px ${font}`;
    ctx.fillText("ARAPOUSH", cx, top);
    ctx.font = `500 ${size * 0.3}px ${font}`;
    ctx.fillText("MULTI-LAYER PLASTIC TUBE", cx, top + size * 0.7);
  };
  const ink = dark ? "#f4f6f8" : "#1f2f3d";
  const lineW = Math.max(2, mm * 0.6);
  const thick = effect === "raised" || effect === "combo";

  if (effect && effect !== "foil") {
    if (effect === "halftone") {
      // Offset: process gradient with a halftone dot screen.
      const g = x.createLinearGradient(0, H * 0.6, 0, H);
      g.addColorStop(0, "#5f86a8");
      g.addColorStop(1, "#14385a");
      x.fillStyle = g;
      sweep(x);
      x.save();
      sweep(x);
      x.clip();
      x.fillStyle = "rgba(255,255,255,0.18)";
      const step = Math.max(4, mm * 0.9);
      for (let yy = H * 0.55; yy < H; yy += step)
        for (let xx = (Math.round(yy / step) % 2) * (step / 2); xx < W; xx += step) {
          x.beginPath();
          x.arc(xx, yy, Math.max(0.5, step * 0.22 * (1 - (yy - H * 0.55) / (H * 0.45))), 0, Math.PI * 2);
          x.fill();
        }
      x.restore();
    } else {
      x.fillStyle = "#1d4a72";
      sweep(x);
      if (b && effect === "raised") {
        b.fillStyle = "#fff";
        sweep(b);
      }
    }
    x.strokeStyle = "#e8893a";
    line(x, thick ? lineW * 1.6 : lineW);
    if (b) {
      b.strokeStyle = "#fff";
      line(b, lineW * 1.6);
    }
  }
  if (effect) {
    // Wordmark: ink, or foil for hot stamp and combination.
    const foilWords = effect === "foil" || effect === "combo";
    x.fillStyle = foilWords ? foil : ink;
    words(x);
    if (foilWords && p) {
      p.fillStyle = METAL;
      words(p);
    }
    if (b && effect === "raised") {
      b.fillStyle = "#fff";
      words(b);
    }
    if (effect === "foil") {
      // Hot stamp is an accent: a foil line as well, on an otherwise plain body.
      x.strokeStyle = foil;
      line(x, lineW);
      if (p) {
        p.strokeStyle = METAL;
        line(p, lineW);
      }
    }
  } else {
    // No print: a faint wordmark only, so the tube still reads as Arapoush.
    x.globalAlpha = 0.35;
    x.fillStyle = ink;
    words(x);
    x.globalAlpha = 1;
  }

  const tex = (c: HTMLCanvasElement | undefined, colour = false) => {
    if (!c) return null;
    const t = new THREE.CanvasTexture(c);
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    // flipY (default): canvas top lands at v = 1, the crimp end.
    return t;
  };
  const map = tex(cc, true)!;
  // An operator's sample artwork, centred on the front face over the body colour.
  if (look.print?.artwork) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      x.fillStyle = bodyHex;
      x.fillRect(0, 0, W, H);
      const k = Math.min((face * 1.6) / img.width, (H * 0.6) / img.height);
      x.drawImage(img, cx - (img.width * k) / 2, H * 0.3, img.width * k, img.height * k);
      map.needsUpdate = true;
    };
    img.src = look.print.artwork;
  }
  return { map, pbr: tex(pbrCanvas?.[0]), bump: tex(bumpCanvas?.[0]) };
}

function sealMaterial(w: number, tint?: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const x = c.getContext("2d")!;
  x.fillStyle = "#808080";
  x.fillRect(0, 0, 256, 32);
  x.fillStyle = "#ffffff";
  const n = Math.round(w * 9);
  for (let i = 0; i < n; i++) x.fillRect((i / n) * 256, 4, (256 / n) * 0.45, 24);
  const bump = new THREE.CanvasTexture(c);
  return new THREE.MeshPhysicalMaterial({
    // The crimp is the same pigmented tube wall, so it takes the body colour.
    color: tint ? new THREE.Color(tint) : 0xf6f7f8,
    roughness: 0.45,
    bumpMap: bump,
    bumpScale: 1.2,
    clearcoat: 0.2,
  });
}

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(20,40,60,0.55)");
  g.addColorStop(0.35, "rgba(20,40,60,0.22)");
  g.addColorStop(1, "rgba(20,40,60,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]!);
