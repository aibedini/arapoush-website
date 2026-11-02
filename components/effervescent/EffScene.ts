import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { capAssembly, tabletGeometry, tabletMaterial, tubeBody, type Assembly, type CapVariant } from "./EffParts";

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
};

type Pose = { x: number; y: number; tilt: number; lean: number; dist: number; aim: number; open: number; park: number; pour: number };
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
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 300);
  private env: THREE.Texture;
  private rig = new THREE.Group();
  private spin = new THREE.Group();
  private tube = new THREE.Group();
  private assembly: Assembly | null = null;
  private shadow: THREE.Mesh;
  private bubbles: THREE.Points;
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
  private floor = 0;
  private yaw = -0.35;
  private velocity = 0;
  private drag: { x: number; y: number; t: number; moved: boolean } | null = null;
  private raycaster = new THREE.Raycaster();
  private raf = 0;
  private last = 0;
  private visible = true;
  private disposed = false;
  private out = false;
  private ro: ResizeObserver;
  private io: IntersectionObserver;

  constructor(private o: EffSceneOptions) {
    const mobile = matchMedia("(max-width: 767px)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;

    // Soft studio light with a cool, water-like rim. Generated locally: no HDR download.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.42;
    const key = new THREE.DirectionalLight(0xfff6ee, 2.8);
    key.position.set(-7, 8, 7);
    const rim = new THREE.DirectionalLight(0xa9cdf5, 2.4);
    rim.position.set(7, 3, -5);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x9fb4c8, 0.6));

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.5 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.bubbles = makeBubbles(mobile ? 36 : 64);

    this.spin.add(this.tube);
    this.rig.add(this.spin);
    this.scene.add(this.rig, this.shadow, this.bubbles);

    new THREE.TextureLoader().load(o.logo, (tex) => {
      if (this.disposed) return tex.dispose();
      tex.colorSpace = THREE.SRGBColorSpace;
      this.logo = tex;
      this.build();
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

  /** 0 = hero, 1 = end of the opening story. */
  setProgress(p: number) {
    this.progress = clamp01(p);
    this.invalidate();
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
    const hidden = [this.bubbles, this.shadow, this.tablets].filter(Boolean) as THREE.Object3D[];
    hidden.forEach((o) => (o.visible = false));
    if (exploded) this.clipTube(h - d * 1.1);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, ht, false);
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.clipTube(null);
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
    disposeTree(this.scene);
    this.logo?.dispose();
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  invalidate = () => {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
  };

  // ── Pointer: horizontal drag turns the tube; a tap on poured tablets knocks them about ──
  private down = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    this.velocity = 0;
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
    if (this.drag || !this.out || e.pointerType !== "mouse") return;
    this.o.canvas.style.cursor = this.pick(e) ? "pointer" : "";
  };

  private pick(e: PointerEvent) {
    if (!this.tablets) return null;
    const r = this.o.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObject(this.tablets, false).find((h) => h.instanceId !== undefined && this.pills[h.instanceId]?.state === 1);
    return hit ?? null;
  }

  private tap(e: PointerEvent) {
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
    if (!this.drag && Math.abs(this.velocity) > 1e-5 && !this.o.reducedMotion) {
      this.yaw += this.velocity * dt * 1000;
      this.velocity *= Math.pow(0.04, dt);
      busy = true;
    } else if (!this.drag && !this.o.reducedMotion && !this.out) {
      this.yaw += dt * 0.18;
      busy = true;
    }
    if (!this.o.reducedMotion) {
      const pos = this.bubbles.geometry.getAttribute("position") as THREE.BufferAttribute;
      const speed = this.bubbles.userData.speed as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + speed[i]! * dt;
        if (y > 22) y = -2;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      busy = true;
    }
    this.render(now, dt);
    if (this.step(dt)) busy = true;
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
    const base = { open: 0, park: 0, pour: 0, tilt: 0 };
    const hero: Pose = { ...base, x: side(0.42), y: down(0.55), tilt: s * -0.2, lean: 0.08, dist: h * far(3.1), aim: h * 0.5 };
    const near: Pose = { ...base, x: side(0.2), y: down(-0.3), lean: 0.12, dist: h * far(1.45), aim: h * 0.8 };
    const open: Pose = { ...base, x: side(0.2), y: down(-0.3) * 0.6, lean: 0.22, dist: far(fit), aim: (stackTop + h - d * 2) / 2, open: 1 };
    // Lying down the tube is wider than a phone: keep its base on the far side and step back.
    const parked: Pose = { ...base, x: s * h * (wide ? 0.3 : 0.2), y: down(-0.1), lean: 0.28, dist: h * far(2.2), aim: h * 0.45, park: 1 };
    const pour: Pose = { ...base, x: s * h * (wide ? 0.48 : 0.36), y: down(-0.55), lean: 0.4, dist: h * (wide ? 2.6 : 5.2), aim: h * 0.28, park: 1, pour: 1 };
    const back: Pose = { ...base, x: side(0.22), y: down(-0.4), tilt: s * -0.04, lean: 0.36, dist: h * far(2.3), aim: h * 0.42 };
    const keys: [number, Pose][] = [
      [0, hero],
      [0.08, hero],
      [0.26, near],
      [0.42, open],
      [0.5, open],
      [0.58, parked],
      [0.7, pour],
      [0.8, pour],
      [0.93, back],
      [1, back],
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
    this.spin.rotation.set(0, this.yaw, 0);
    this.rig.updateMatrixWorld(true);

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
    this.bubbles.position.set(q.x * 0.6, this.floor, -d);
    this.bubbles.scale.setScalar(h / 17.5);
    this.renderer.render(this.scene, this.camera);
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
        const wx = this.size.h * 0.95;
        const wz = this.size.d * 3;
        if (Math.abs(t.p.x) > wx) {
          t.p.x = Math.sign(t.p.x) * wx;
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
    const { d, h } = this.size;
    const body = tubeBody(d, h, this.logo);
    this.neck = body.neck;
    this.tube.add(body.group);
    this.assembly = capAssembly(d, h, this.variant);
    this.spin.add(this.assembly.root);

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

function makeBubbles(count: number) {
  const pos = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 9;
    pos[i * 3 + 1] = Math.random() * 24 - 2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    speed[i] = 0.4 + Math.random() * 1.1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const grad = x.createRadialGradient(32, 32, 10, 32, 32, 31);
  grad.addColorStop(0, "rgba(160,195,230,0.08)");
  grad.addColorStop(0.7, "rgba(150,190,230,0.35)");
  grad.addColorStop(0.88, "rgba(120,170,220,0.85)");
  grad.addColorStop(1, "rgba(120,170,220,0)");
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  const points = new THREE.Points(
    g,
    new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 0.32, transparent: true, depthWrite: false, opacity: 0.9, sizeAttenuation: true }),
  );
  points.userData.speed = speed;
  return points;
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
