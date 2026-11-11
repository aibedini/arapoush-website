import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { capAssembly, tabletGeometry, tabletMaterial, tubeBody, type Assembly, type CapVariant } from "./EffParts";
import { Glass } from "./EffGlass";
import { Environment } from "./EffEnvironment";

/**
 * Effervescent tube stage (1 unit = 1 cm). One tube whose pose follows the page's scroll story:
 * hero → close-up → the cap comes apart (exploded view) → the tube tips and its tablets pour out →
 * the cap goes back on. Poured tablets are live: a click or tap knocks them around. Scrolling back up
 * gathers them into the tube again, so the whole story reverses.
 */

export type EffSceneOptions = {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  /** -1 puts the hero tube on the left (Persian), +1 on the right (English, Turkish). */
  side: 1 | -1;
  logo: string;
  onInteract?: () => void;
  /** Called when tablets come out or go back in (the page shows a "tap the tablets" hint). */
  onPoured?: (out: boolean) => void;
  /** Called when the glass can take another tablet (or no longer can). */
  onGlass?: (ready: boolean) => void;
  /** Scroll mood, 0 (ice-blue hero) to 1 (navy): the page darkens the backdrop to match. */
  onMood?: (mood: number) => void;
};

type Pose = { x: number; y: number; tilt: number; lean: number; dist: number; aim: number; open: number; park: number; pour: number; turn: number };
type Tablet = { p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; w: THREE.Vector3; state: 0 | 1 | 2; t: number; from: THREE.Vector3; fromQ: THREE.Quaternion; rest: boolean };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const GRAVITY = 70;
/** Story progress before which poured tablets go back into the tube. */
const GATHER_BELOW = 0.6;

export class EffScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 900);
  private env: THREE.Texture;
  private rig = new THREE.Group();
  private spin = new THREE.Group();
  private tube = new THREE.Group();
  private assembly: Assembly | null = null;
  private shadow: THREE.Mesh;
  private world: Environment;
  private key: THREE.DirectionalLight;
  private rim: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private droplets: THREE.InstancedMesh | null = null;
  private tablets: THREE.InstancedMesh | null = null;
  private pills: Tablet[] = [];
  private slots: number[] = [];
  private tabletR = 1;
  private tabletT = 0.5;
  private released = 0;
  private releaseClock = 0;
  private size = { d: 2.7, h: 17.5 };
  private neck = 0.5;
  private variant: CapVariant = "spiral";
  private logo: THREE.Texture | null = null;
  private progress = 0;
  /** Scroll position the story eases towards (scroll is damped, so wheel steps glide). */
  private target = 0;
  private floor = 0;
  /** The user's own turn of the tube; the scroll story and idle sway are added on top. */
  private yaw = -0.35;
  private velocity = 0;
  private lastTouch = 0;
  private glass: Glass;
  private glassIn = 1;
  private glassReady = false;
  private drag: { x: number; y: number; t: number; moved: boolean } | null = null;
  private raycaster = new THREE.Raycaster();
  private raf = 0;
  private last = 0;
  private visible = true;
  private disposed = false;
  private out = false;
  private ro: ResizeObserver;
  private io: IntersectionObserver;

  private mobile: boolean;
  /** Keep poured tablets off the copy's half of the frame (off for static renders without copy). */
  copyWall = true;
  private warmed = false;

  constructor(private o: EffSceneOptions) {
    const mobile = matchMedia("(max-width: 767px)").matches;
    this.mobile = mobile;
    // Layer 1: small live details the main camera draws but the floor reflection skips.
    this.camera.layers.enable(1);
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;

    // Studio reflections: the room plus a warm champagne softbox on the glass side and a cool one
    // opposite, so glossy plastic picks up both. Generated locally: no HDR download.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const panel = (color: string, k: number, x: number, y: number, z: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 2, 0);
      room.add(m);
    };
    panel("#ffd9a8", 9, o.side * 7, 4, 3, 3, 7);
    panel("#9ccaff", 7, -o.side * 7, 3, -2, 3, 8);
    panel("#ffffff", 5, 0, 9, 1, 8, 2);
    this.env = pmrem.fromScene(room, 0.04).texture;
    room.traverse((x) => (x as THREE.Mesh).isMesh && ((x as THREE.Mesh).geometry.dispose(), ((x as THREE.Mesh).material as THREE.Material).dispose()));
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.5;
    // Warm key from the glass side, cold rim from behind the other side.
    this.key = new THREE.DirectionalLight(0xffe7c8, 2.9);
    this.key.position.set(o.side * 8, 9, 7);
    this.rim = new THREE.DirectionalLight(0x9cc8ff, 2.8);
    this.rim.position.set(-o.side * 8, 4, -6);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x9fb4c8, 0.55);
    this.scene.add(this.key, this.rim, this.hemi);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.5 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.world = new Environment(o.side, mobile, o.reducedMotion);

    this.spin.add(this.tube);
    this.rig.add(this.spin);
    this.glass = new Glass(o.reducedMotion, o.side);
    this.glass.onSplash = (strength) => {
      const p = this.glass.root.position;
      this.world.ripple(p.x, p.z, strength);
    };
    this.scene.add(this.world.root, this.rig, this.shadow, this.glass.root);

    new THREE.TextureLoader().load(o.logo, (tex) => {
      if (this.disposed) return tex.dispose();
      tex.colorSpace = THREE.SRGBColorSpace;
      this.logo = tex;
      // Rebuilding mid-compile would dispose materials the compiler is waiting on.
      if (this.warmed) this.build();
    });
    this.build();

    o.canvas.style.touchAction = "pan-y";
    o.canvas.addEventListener("pointerdown", this.down);
    o.canvas.addEventListener("pointermove", this.hover);
    addEventListener("pointermove", this.move);
    addEventListener("pointerup", this.up);
    addEventListener("pointercancel", this.cancel);

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

  /** Diameter and height in millimetres. */
  setSize(d: number, h: number) {
    if (d / 10 === this.size.d && h / 10 === this.size.h) return;
    this.size = { d: d / 10, h: h / 10 };
    this.build();
  }

  setVariant(v: CapVariant) {
    if (v === this.variant) return;
    this.variant = v;
    this.build();
  }

  /** 0 = hero, 1 = end of the opening story. `instant` skips the glide (first frame, static renders). */
  setProgress(p: number, instant = false) {
    this.target = clamp01(p);
    if (instant || this.o.reducedMotion) this.progress = this.target;
    this.invalidate();
  }

  /** Drop a tablet into the glass (button and keyboard equivalent of tapping the glass). */
  drop() {
    this.glass.drop(this.dropHeight());
    this.invalidate();
  }

  /** Pose the glass `seconds` after a drop, for the static renders (0 = clear water, no tablet). */
  glassMoment(seconds: number) {
    this.render(performance.now());
    this.glass.simulate(seconds, this.dropHeight());
  }

  rotate(radians: number) {
    this.yaw += radians;
    this.invalidate();
  }

  /** Knock every poured tablet about (keyboard equivalent of clicking them). */
  scatter() {
    for (const t of this.pills) if (t.state === 1) this.kick(t, new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2), 1);
    this.invalidate();
  }

  /** Run the tablet simulation without rendering (used to pose the static renders). */
  settle(seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 60) this.step(1 / 60, true);
    this.invalidate();
  }

  /** The current frame as a PNG data URL (used for the static posters). */
  snapshot() {
    this.render(performance.now());
    return this.renderer.domElement.toDataURL("image/png");
  }

  /**
   * Upright, orthographic product shot at a fixed scale, so every size renders with true proportions.
   * `exploded` renders the cap's parts spread above the neck instead of the whole tube.
   */
  productShot(pxPerMm: number, exploded = false) {
    const { d, h } = this.size;
    const R = (d / 2) * 1.12;
    const parts = this.assembly!.parts;
    const capH = d * 0.42;
    parts.forEach((p) => (p.obj.position.y = exploded ? p.open : p.closed));
    this.assembly!.root.position.set(0, 0, 0);
    this.assembly!.root.quaternion.identity();
    const top = (exploded ? parts[0]!.open : parts[0]!.closed) + capH;
    const bottom = exploded ? h - d * 1.1 : 0;
    const pad = 0.15;
    const k = 10 * pxPerMm;
    const halfW = R + pad;
    const halfH = (top - bottom + R * 0.4) / 2 + pad;
    const w = Math.ceil(halfW * 2 * k);
    const ht = Math.ceil(halfH * 2 * k);
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 200);
    const elev = exploded ? 0.2 : 0.12;
    const cy = (top + bottom) / 2;
    cam.position.set(0, cy + Math.sin(elev) * 40, Math.cos(elev) * 40);
    cam.lookAt(0, cy, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const toPx = (v: THREE.Vector3) => {
      const p = v.project(cam);
      return { x: Math.round(((p.x + 1) / 2) * w), y: Math.round(((1 - p.y) / 2) * ht) };
    };
    const marks = { base: toPx(new THREE.Vector3(0, 0, d / 2)).y, mouth: toPx(new THREE.Vector3(0, h, d / 2)).y, left: toPx(new THREE.Vector3(-d / 2, 0, 0)).x, right: toPx(new THREE.Vector3(d / 2, 0, 0)).x };
    const pr = this.renderer.getPixelRatio();
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.spin.rotation.set(0, -0.35, 0);
    this.tube.visible = true;
    const hidden = [this.world.root, this.shadow, this.tablets, this.glass.root, this.droplets].filter(Boolean) as THREE.Object3D[];
    hidden.forEach((o) => (o.visible = false));
    if (exploded) this.clipTube(h - d * 1.1);
    // Exploded views show the bare neck, without a slice of the printed sleeve.
    const sleeve = this.tube.getObjectByName("sleeve");
    if (sleeve) sleeve.visible = !exploded;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, ht, false);
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.clipTube(null);
    if (sleeve) sleeve.visible = true;
    hidden.forEach((o) => (o.visible = true));
    this.renderer.setPixelRatio(pr);
    this.resize();
    return { url, width: w, height: ht, ...marks };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener("visibilitychange", this.invalidate);
    this.o.canvas.removeEventListener("pointerdown", this.down);
    this.o.canvas.removeEventListener("pointermove", this.hover);
    removeEventListener("pointermove", this.move);
    removeEventListener("pointerup", this.up);
    removeEventListener("pointercancel", this.cancel);
    this.glass.dispose();
    this.scene.remove(this.glass.root);
    this.world.dispose();
    this.scene.remove(this.world.root);
    disposeTree(this.scene);
    this.logo?.dispose();
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  invalidate = () => {
    if (this.disposed || this.raf || !this.warmed) return;
    this.raf = requestAnimationFrame(this.tick);
  };

  /**
   * Compile every shader in the background (parallel compile where the GPU supports it) before the
   * first frame, so the page never stalls on one long synchronous compile.
   */
  async warm() {
    this.camera.position.set(0, 10, 50);
    this.camera.lookAt(0, 8, 0);
    // Upload textures one per task, so no single frame carries them all.
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) for (const v of Object.values(mat)) if (v instanceof THREE.Texture) textures.add(v);
    });
    for (const t of textures) {
      this.renderer.initTexture(t);
      await new Promise((r) => setTimeout(r, 0));
    }
    try {
      // Programs are picked per output: the screen (tone-mapped sRGB) and the floor's reflection
      // target (linear) each need their own variants, so compile both. The variant is fixed when
      // compileAsync is called, so the target can be switched straight back.
      this.renderer.setRenderTarget(this.world.reflectionTarget);
      const reflection = this.renderer.compileAsync(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      await Promise.all([reflection, this.renderer.compileAsync(this.scene, this.camera)]);
    } catch {
      // Older drivers: fall back to compiling on the first frame.
    }
    this.warmed = true;
    // The logo arrived while compiling: put it on the sleeve now (same shaders, already compiled).
    if (this.logo) this.build();
    this.invalidate();
  }

  // ── Pointer: horizontal drag turns the tube; a tap on poured tablets knocks them about ──
  private down = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    this.velocity = 0;
    this.lastTouch = performance.now();
    this.o.onInteract?.();
  };
  private move = (e: PointerEvent) => {
    if (!this.drag) return;
    const now = performance.now();
    if (Math.abs(e.clientX - this.drag.x) + Math.abs(e.clientY - this.drag.y) > 6) this.drag.moved = true;
    if (!this.drag.moved) return;
    const dx = ((e.clientX - this.drag.x) / Math.max(320, this.o.canvas.clientWidth)) * Math.PI * 2.2;
    this.yaw += dx;
    this.velocity = dx / Math.max(8, now - this.drag.t);
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.drag.t = now;
    this.invalidate();
  };
  private up = (e: PointerEvent) => {
    const tap = this.drag && !this.drag.moved;
    this.drag = null;
    if (tap) this.tap(e);
    this.invalidate();
  };
  private cancel = () => {
    this.drag = null;
  };
  private hover = (e: PointerEvent) => {
    if (this.drag || e.pointerType !== "mouse") return;
    this.o.canvas.style.cursor = (this.out && this.pick(e)) || (this.glassReady && this.pickGlass(e)) ? "pointer" : "";
  };

  private ray(e: PointerEvent) {
    const r = this.o.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
  }

  private pick(e: PointerEvent) {
    if (!this.tablets) return null;
    this.ray(e);
    const hit = this.raycaster.intersectObject(this.tablets, false).find((h) => h.instanceId !== undefined && this.pills[h.instanceId]?.state === 1);
    return hit ?? null;
  }

  private pickGlass(e: PointerEvent) {
    if (!this.glass.root.visible) return false;
    this.ray(e);
    return this.raycaster.intersectObject(this.glass.hit, false).length > 0;
  }

  private tap(e: PointerEvent) {
    if (this.glassReady && this.pickGlass(e)) {
      this.drop();
      return;
    }
    const hit = this.pick(e);
    if (!hit) return;
    const reach = this.tabletR * 5;
    for (const t of this.pills) {
      if (t.state !== 1) continue;
      const away = t.p.clone().sub(hit.point);
      const dist = away.length();
      if (dist > reach) continue;
      away.y = 0;
      if (away.lengthSq() < 1e-4) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      this.kick(t, away.normalize(), 1 - dist / reach);
    }
  }

  private kick(t: Tablet, dir: THREE.Vector3, strength: number) {
    const s = 0.6 + strength;
    t.v.addScaledVector(dir, 9 * s).add(new THREE.Vector3(0, 10 * s, 0));
    t.w.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
    t.rest = false;
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (!this.visible || document.hidden) {
      this.last = 0;
      return;
    }
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    let busy = false;
    // Scroll glides: the story follows the scrollbar with a short exponential lag.
    const gap = this.target - this.progress;
    if (Math.abs(gap) > 1e-4) {
      this.progress += gap * (1 - Math.exp(-dt * 6.5));
      busy = true;
    } else this.progress = this.target;
    if (!this.drag && Math.abs(this.velocity) > 1e-5 && !this.o.reducedMotion) {
      this.yaw += this.velocity * dt * 1000;
      this.velocity *= Math.pow(0.04, dt);
      busy = true;
    } else if (!this.drag && !this.o.reducedMotion && now - this.lastTouch > 2500) {
      // A while after the user lets go, the tube eases back to face the front.
      const home = -0.35 + Math.round((this.yaw + 0.35) / (Math.PI * 2)) * Math.PI * 2;
      if (Math.abs(home - this.yaw) > 1e-3) {
        this.yaw += (home - this.yaw) * (1 - Math.exp(-dt * 1.4));
        busy = true;
      }
    }
    // In the hero the tube sways gently instead of spinning, so the label stays readable.
    if (!this.o.reducedMotion && this.progress < 0.1) busy = true;
    // The studio is alive (waves, ribbons, bubbles) whenever it is on screen.
    this.world.update(dt);
    if (!this.o.reducedMotion) busy = true;
    if (this.glass.root.visible) {
      if (this.glassIn > 0.9) this.glass.autoDrop(dt, this.dropHeight());
      if (this.glass.update(dt, now)) busy = true;
    }
    this.render(now, dt);
    if (this.step(dt)) busy = true;
    const ready = !this.o.reducedMotion && this.glass.idle && this.glassIn > 0.9 && this.glass.root.visible;
    if (ready !== this.glassReady) {
      this.glassReady = ready;
      this.o.onGlass?.(ready);
    }
    if (busy) this.invalidate();
    else this.last = 0;
  };

  /** Scroll story keyframes. Distances scale with the tube so every size frames the same way. */
  private pose(): Pose {
    const { d, h } = this.size;
    const wide = this.camera.aspect > 0.95;
    const s = this.o.side;
    const side = (k: number) => (wide ? s * h * k : 0);
    const down = (k: number) => (wide ? 0 : -h * k);
    const far = (k: number) => k * (wide ? 1 : 1.55);
    // Exploded stack: frame from just under the mouth to the top of the lifted cap.
    const stackTop = (this.assembly?.parts[0]?.open ?? h + 8) + d * 0.42;
    const span = stackTop - (h - d * 2);
    const fit = (span / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.12;
    const base = { open: 0, park: 0, pour: 0, tilt: 0, turn: 0 };
    const hero: Pose = { ...base, x: side(0.42), y: down(0.55), tilt: s * -0.2, lean: 0.08, dist: h * far(3.1), aim: h * 0.5 };
    const near: Pose = { ...base, x: side(0.2), y: down(-0.3), lean: 0.12, dist: h * far(1.45), aim: h * 0.8 };
    const open: Pose = { ...base, x: side(0.2), y: down(-0.3) * 0.6, lean: 0.22, dist: far(fit), aim: (stackTop + h - d * 2) / 2, open: 1 };
    // Lying down the tube is wider than a phone: keep its base on the far side and step back.
    const parked: Pose = { ...base, x: s * h * (wide ? 0.3 : 0.2), y: down(-0.1), lean: 0.28, dist: h * far(2.2), aim: h * 0.45, park: 1 };
    // Wide screens: the tube lies across its own half, mouth just short of the copy, so the pour is in view.
    const pour: Pose = { ...base, x: s * h * (wide ? 0.96 : 0.52), y: down(-0.55), lean: 0.4, dist: h * (wide ? 2.6 : 5.2), aim: h * 0.28, park: 1, pour: 1 };
    const back: Pose = { ...base, x: side(0.22), y: down(-0.4), tilt: s * -0.04, lean: 0.36, dist: h * far(2.3), aim: h * 0.42 };
    // `turn` is the scroll-driven spin: a slow orbit round the tube as you read, a quarter turn more
    // while the cap's parts hang apart, and a final turn that brings the label back to the front.
    const T = Math.PI * 2;
    const keys: [number, Pose][] = [
      [0, hero],
      [0.08, hero],
      [0.26, { ...near, turn: 0.9 }],
      [0.42, { ...open, turn: 2.1 }],
      [0.5, { ...open, turn: 2.75 }],
      [0.58, { ...parked, turn: 3.3 }],
      [0.7, { ...pour, turn: 3.3 }],
      [0.8, { ...pour, turn: 3.3 }],
      [0.93, { ...back, turn: T }],
      [1, { ...back, turn: T }],
    ];
    const p = this.progress;
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1]![0]) i++;
    const [p0, a] = keys[i]!;
    const [p1, b] = keys[i + 1]!;
    const t = smooth(clamp01((p - p0) / Math.max(1e-6, p1 - p0)));
    const out = {} as Pose;
    for (const k of Object.keys(a) as (keyof Pose)[]) out[k] = lerp(a[k], b[k], t);
    return out;
  }

  private render(now: number, dt = 0) {
    const q = this.pose();
    const { d, h } = this.size;
    const s = this.o.side;
    const calm = q.open || q.pour || this.o.reducedMotion ? 0 : 1;
    const float = Math.sin(now / 1400) * h * 0.012 * calm;
    this.floor = q.y;
    // Pouring lifts the tube and tips its mouth down towards the middle of the screen.
    const pour = smooth(q.pour);
    this.rig.position.set(q.x, q.y + float + pour * h * 0.32, 0);
    this.rig.rotation.set(0, 0, q.tilt + s * pour * 1.65);
    const hero = this.o.reducedMotion ? 0 : 1 - clamp01(this.progress / 0.08);
    const sway = Math.sin(now / 2600) * 0.32 * hero;
    this.spin.rotation.set(0, this.yaw + s * q.turn + sway, 0);
    this.rig.updateMatrixWorld(true);

    // The glass stands in front of the tube's base in the hero, and slides out of shot as the
    // camera moves in on the tube (and back in on the way up).
    const wide = this.camera.aspect > 0.95;
    this.glassIn = 1 - smooth(clamp01((this.progress - 0.05) / 0.17));
    this.glass.root.visible = this.glassIn > 0.001;
    this.glass.root.position.set(q.x + s * h * (wide ? 0.3 : 0.36) + s * (1 - this.glassIn) * h * 1.6, this.floor, h * (wide ? 0.24 : 0.26));
    this.glass.root.scale.setScalar(0.82);

    const a = this.assembly;
    if (a) {
      const open = smooth(q.open);
      for (const p of a.parts) p.obj.position.y = lerp(p.closed, p.open, open);
      // Parked: the assembled cap waits upright beside the tube while it pours.
      const park = smooth(q.park);
      if (park > 0) {
        // On the floor beyond the tube's base, its cage and cartridge standing under it.
        const at = new THREE.Vector3(q.x - s * h * 0.12, this.floor + d * 0.62 * 0.95 - this.neck + 0.05, -d * 2.4);
        const m = new THREE.Matrix4().copy(this.spin.matrixWorld).invert().multiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)).multiply(new THREE.Matrix4().makeTranslation(0, -(h - this.neck), 0));
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        m.decompose(pos, quat, new THREE.Vector3());
        a.root.position.lerpVectors(new THREE.Vector3(), pos, park);
        a.root.quaternion.identity().slerp(quat, park);
      } else {
        a.root.position.set(0, 0, 0);
        a.root.quaternion.identity();
      }
    }

    // Tablets come out once the tube is tipped far enough, and go home when the story rewinds.
    if (this.progress < GATHER_BELOW) this.gather();
    else if (pour > 0.62 && dt > 0) this.release(dt);
    this.placeTablets();

    this.camera.position.set(0, q.aim + q.dist * Math.sin(q.lean), q.dist * Math.cos(q.lean));
    this.camera.lookAt(0, q.aim, 0);
    // Contact shadow under the middle of the tube, wherever it points.
    const mid = this.spin.localToWorld(new THREE.Vector3(0, h / 2, 0));
    this.shadow.position.set(lerp(this.rig.position.x, mid.x, pour), this.floor + 0.01, 0);
    this.shadow.scale.setScalar(d * (3.2 + pour * 3));
    // Ice blue in the hero, navy by the end of the story.
    const mood = smooth(clamp01((this.progress - 0.12) / 0.6));
    this.world.setMood(mood);
    this.world.setAnchor(q.x, this.floor);
    this.world.setFloor(this.floor);
    this.o.onMood?.(mood);
    this.key.intensity = lerp(2.9, 2.2, mood);
    this.rim.intensity = lerp(2.8, 3.6, mood);
    this.hemi.intensity = lerp(0.55, 0.3, mood);
    this.scene.environmentIntensity = lerp(0.5, 0.34, mood);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = lerp(0.42, 0.6, mood);
    this.renderer.render(this.scene, this.camera);
  }

  /** Height (in the glass's frame) just above the top edge of the frame, where a tablet starts. */
  private dropHeight() {
    const g = this.glass.root.position;
    const depth = this.camera.position.distanceTo(g);
    const top = this.camera.position.y + depth * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;
    return top - g.y + 2;
  }

  // ── Tablets ──
  private slotMatrix(i: number, target = new THREE.Matrix4()) {
    return target.copy(this.spin.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0, this.slots[i]!, 0));
  }

  private release(dt: number) {
    this.releaseClock += dt;
    while (this.releaseClock > 0.06 && this.released < this.pills.length) {
      this.releaseClock -= 0.06;
      // Top of the stack first, from the mouth, along the tube's axis.
      const i = this.pills.length - 1 - this.released++;
      const t = this.pills[i]!;
      const mouth = this.spin.localToWorld(new THREE.Vector3(0, this.size.h - 0.2, 0));
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(this.spin.getWorldQuaternion(new THREE.Quaternion()));
      t.p.copy(mouth);
      t.q.copy(this.spin.getWorldQuaternion(new THREE.Quaternion()));
      t.v.copy(axis).multiplyScalar(4 + Math.random() * 2.5).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 4));
      t.w.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 16);
      t.state = 1;
      t.rest = false;
    }
    if (!this.out && this.released > 0) {
      this.out = true;
      this.o.onPoured?.(true);
    }
  }

  private gather() {
    if (!this.out && this.released === 0) return;
    for (const t of this.pills) {
      if (t.state !== 1) continue;
      t.state = 2;
      t.t = 0;
      t.from.copy(t.p);
      t.fromQ.copy(t.q);
    }
    this.released = 0;
    this.releaseClock = 0;
    if (this.out) {
      this.out = false;
      this.o.canvas.style.cursor = "";
      this.o.onPoured?.(false);
    }
  }

  private placeTablets() {
    if (!this.tablets) return;
    const m = new THREE.Matrix4();
    const slot = new THREE.Matrix4();
    const sp = new THREE.Vector3();
    const sq = new THREE.Quaternion();
    this.pills.forEach((t, i) => {
      if (t.state === 0) this.slotMatrix(i, m);
      else if (t.state === 2) {
        this.slotMatrix(i, slot).decompose(sp, sq, new THREE.Vector3());
        const k = smooth(clamp01(t.t));
        // Arc up and over into the mouth.
        const lift = Math.sin(k * Math.PI) * this.size.d * 1.5;
        m.compose(t.p.lerpVectors(t.from, sp, k).add(new THREE.Vector3(0, lift, 0)), t.q.slerpQuaternions(t.fromQ, sq, k), new THREE.Vector3(1, 1, 1));
      } else m.compose(t.p, t.q, new THREE.Vector3(1, 1, 1));
      this.tablets!.setMatrixAt(i, m);
    });
    this.tablets.instanceMatrix.needsUpdate = true;
    this.tablets.computeBoundingSphere();
  }

  /** Simple rigid-disc physics: gravity, floor, tablet–tablet and tablet–tube contacts. */
  private step(dt: number, force = false) {
    if (!dt || (!force && this.o.reducedMotion && !this.out)) return false;
    let moving = false;
    const R = this.tabletR;
    const half = this.tabletT / 2;
    const floor = this.floor + half;
    const base = new THREE.Vector3().setFromMatrixPosition(this.rig.matrixWorld);
    const mouth = this.spin.localToWorld(new THREE.Vector3(0, this.size.h, 0));
    const tubeR = this.size.d / 2 + R * 0.5;
    const sub = 3;
    const h = dt / sub;
    const s = this.o.side;
    const wide = this.camera.aspect > 0.95;
    const copyEdge = -s * this.size.h * 0.04;
    const up = new THREE.Vector3(0, 1, 0);
    for (let n = 0; n < sub; n++) {
      for (const t of this.pills) {
        if (t.state === 2) {
          t.t += h / 0.7;
          if (t.t >= 1) t.state = 0;
          moving = true;
          continue;
        }
        if (t.state !== 1 || t.rest) continue;
        moving = true;
        t.v.y -= GRAVITY * h;
        t.p.addScaledVector(t.v, h);
        const spin = t.w.length();
        if (spin > 1e-3) t.q.premultiply(new THREE.Quaternion().setFromAxisAngle(t.w.clone().divideScalar(spin), spin * h));
        if (t.p.y < floor) {
          t.p.y = floor;
          // A hard landing rings the water.
          if (t.v.y < -9 && !force) this.world.ripple(t.p.x, t.p.z, Math.min(1, -t.v.y / 30));
          if (t.v.y < 0) t.v.y *= -0.28;
          t.v.x *= 0.9;
          t.v.z *= 0.9;
          t.w.multiplyScalar(0.82);
          // Settle flat, keeping the current heading.
          const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(t.q);
          const flat = new THREE.Quaternion().setFromUnitVectors(axis, axis.y < 0 ? up.clone().negate() : up).multiply(t.q);
          t.q.slerp(flat, 0.18);
          if (t.v.lengthSq() < 0.05 && Math.abs(t.v.y) < 0.4) {
            t.v.set(0, 0, 0);
            t.w.set(0, 0, 0);
            t.q.copy(flat);
            t.rest = true;
          }
        }
        // Invisible walls keep the tablets on stage (and off the lens).
        const wx = this.size.h * (wide ? 0.95 : 0.66);
        const wz = this.size.d * 3;
        if (Math.abs(t.p.x) > wx) {
          t.p.x = Math.sign(t.p.x) * wx;
          t.v.x *= -0.4;
        }
        // Wide screens: tablets stay on the tube's half, clear of the copy cards.
        if (wide && this.copyWall && s * (t.p.x - copyEdge) < 0) {
          t.p.x = copyEdge;
          t.v.x *= -0.4;
        }
        if (Math.abs(t.p.z) > wz) {
          t.p.z = Math.sign(t.p.z) * wz;
          t.v.z *= -0.4;
        }
        // Keep out of the tube (a capsule from base to mouth).
        const seg = mouth.clone().sub(base);
        const k = clamp01(t.p.clone().sub(base).dot(seg) / seg.lengthSq());
        const near = base.clone().addScaledVector(seg, k);
        const off = t.p.clone().sub(near);
        const dist = off.length();
        if (dist < tubeR && k > 0.02 && k < 0.98 && dist > 1e-4) {
          off.divideScalar(dist);
          t.p.copy(near).addScaledVector(off, tubeR);
          const vn = t.v.dot(off);
          if (vn < 0) t.v.addScaledVector(off, -vn * 1.3);
        }
      }
      // Pairwise contacts.
      for (let i = 0; i < this.pills.length; i++) {
        const a = this.pills[i]!;
        if (a.state !== 1) continue;
        for (let j = i + 1; j < this.pills.length; j++) {
          const b = this.pills[j]!;
          if (b.state !== 1) continue;
          const dx = b.p.clone().sub(a.p);
          const dist = dx.length();
          const min = R * 1.9;
          if (dist >= min || dist < 1e-5) continue;
          const nrm = dx.divideScalar(dist);
          const push = (min - dist) / 2;
          a.p.addScaledVector(nrm, -push);
          b.p.addScaledVector(nrm, push);
          const rel = b.v.clone().sub(a.v).dot(nrm);
          if (rel < 0) {
            a.v.addScaledVector(nrm, rel * 0.6);
            b.v.addScaledVector(nrm, -rel * 0.6);
          }
          if (Math.abs(rel) > 0.3) {
            a.rest = false;
            b.rest = false;
          }
        }
      }
    }
    return moving;
  }

  private resize() {
    const el = this.o.canvas.parentElement!;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait screens see the tube from further back so it never overflows the width.
    this.camera.fov = this.camera.aspect < 0.95 ? 36 : 28;
    this.camera.updateProjectionMatrix();
    this.glass.setPointScale((h * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
    this.world.resize(w, h, this.renderer.getPixelRatio());
    this.invalidate();
  }

  /** Hide the tube below a height (exploded cap renders show only the neck). */
  private clipTube(y: number | null) {
    this.renderer.localClippingEnabled = y !== null;
    const planes = y === null ? [] : [new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)];
    this.tube.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.clippingPlanes = planes;
    });
  }

  private build() {
    disposeTree(this.tube);
    this.tube.clear();
    if (this.assembly) {
      disposeTree(this.assembly.root);
      this.spin.remove(this.assembly.root);
    }
    if (this.tablets) {
      disposeTree(this.tablets);
      this.scene.remove(this.tablets);
    }
    if (this.droplets) {
      disposeTree(this.droplets);
      this.spin.remove(this.droplets);
    }
    const { d, h } = this.size;
    const body = tubeBody(d, h, this.logo);
    this.neck = body.neck;
    this.tube.add(body.group);
    this.assembly = capAssembly(d, h, this.variant);
    this.spin.add(this.assembly.root);
    this.droplets = makeDroplets(this.mobile ? 60 : 150, d / 2, h * 0.08, h - this.neck - 0.3);
    this.droplets.layers.set(1);
    this.spin.add(this.droplets);

    // A stack of tablets fills the tube below the cage.
    this.tabletR = body.innerR - 0.05;
    this.tabletT = Math.max(0.35, d * 0.2);
    const room = h - this.neck - d * 0.7;
    const count = Math.max(5, Math.min(22, Math.floor(room / (this.tabletT * 1.04))));
    this.slots = Array.from({ length: count }, (_, i) => 0.14 + this.tabletT * (i + 0.5) * 1.04);
    this.tablets = new THREE.InstancedMesh(tabletGeometry(this.tabletR, this.tabletT), tabletMaterial(), count);
    this.tablets.frustumCulled = false;
    this.scene.add(this.tablets);
    this.pills = Array.from({ length: count }, () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      w: new THREE.Vector3(),
      state: 0 as const,
      t: 0,
      from: new THREE.Vector3(),
      fromQ: new THREE.Quaternion(),
      rest: false,
    }));
    this.released = 0;
    this.out = false;
    this.invalidate();
  }
}

/** Condensation on the tube body: flattened water beads sitting on the surface, in the tube's frame. */
function makeDroplets(count: number, radius: number, from: number, to: number) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = from + Math.random() * (to - from);
    const r = 0.03 + Math.pow(Math.random(), 2.2) * 0.1;
    q.setFromEuler(new THREE.Euler(0, -a, 0));
    // Flattened against the wall, a little taller than wide (water runs down).
    m.compose(new THREE.Vector3(Math.cos(a) * (radius + r * 0.2), y, Math.sin(a) * (radius + r * 0.2)), q, new THREE.Vector3(r * 0.45, r * 1.25, r));
    mesh.setMatrixAt(i, m);
  }
  mesh.renderOrder = 3;
  return mesh;
}

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(20,48,80,0.5)");
  g.addColorStop(0.4, "rgba(20,48,80,0.18)");
  g.addColorStop(1, "rgba(20,48,80,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}
