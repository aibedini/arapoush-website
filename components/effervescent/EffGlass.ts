import * as THREE from "three";
import { lathe, tabletGeometry, tabletMaterial } from "./EffParts";

/**
 * A glass of water beside the hero tube (1 unit = 1 cm). A tablet drops in from above the frame,
 * splashes, sinks, then rises and skates on the surface while it fizzes away, tinting the water
 * the colour of the drink. Bubbles, spray, foam and a ripple are cheap points and flat meshes.
 */

const G = 110;
const BASE_R = 3.2;
const RIM_R = 3.7;
const HEIGHT = 11.5;
const WALL = 0.18;
const FLOOR = 0.92;
const LEVEL = 8.4;
const TAB_R = 1.15;
const TAB_T = 0.48;
const MAX = 260;
const CLEAR = new THREE.Color("#6fb6ea");
const CLOUD = new THREE.Color("#eaf1f4");
const DRINK = new THREE.Color("#ff8a1c");

const innerR = (y: number) => THREE.MathUtils.lerp(BASE_R - WALL, RIM_R - WALL, y / HEIGHT);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

type Phase = "idle" | "fall" | "sink" | "bottom" | "rise" | "float";

export class Glass {
  readonly root = new THREE.Group();
  /** Front shell, for picking. */
  readonly hit: THREE.Mesh;
  private waterMat: THREE.MeshStandardMaterial;
  private foam: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private ripple: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private tablet: THREE.Mesh;
  private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private pv = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private kind = new Uint8Array(MAX);
  private seed = new Float32Array(MAX);
  private phase: Phase = "idle";
  private clock = 0;
  private age = 0;
  private p = new THREE.Vector3();
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private w = new THREE.Vector3();
  private left = 0;
  private drunk = 0;
  private foamLevel = 0;
  private rippleT = 1;
  private orbit = 0;
  private emit = 0;
  private started = false;
  /** Called when a tablet hits the water (strength 0–1), so the floor can ring too. */
  onSplash?: (strength: number) => void;

  constructor(
    private reduced: boolean,
    side: 1 | -1,
  ) {
    // Closed lathe profile: outer wall up, rounded rim, inner wall down to a thick base.
    const prof: [number, number][] = [[0, 0]];
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      prof.push([BASE_R - 0.3 + Math.sin(a) * 0.3, 0.3 - Math.cos(a) * 0.3]);
    }
    prof.push([RIM_R, HEIGHT - 0.06]);
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI;
      prof.push([RIM_R - WALL / 2 + Math.cos(a) * (WALL / 2), HEIGHT + Math.sin(a) * 0.07]);
    }
    prof.push([innerR(FLOOR + 0.25), FLOOR + 0.25], [innerR(FLOOR) - 0.25, FLOOR], [0, FLOOR]);
    const shell = lathe(prof, 72);
    const back = new THREE.Mesh(shell, glassMaterial(THREE.BackSide));
    this.hit = new THREE.Mesh(shell, glassMaterial(THREE.FrontSide));
    back.renderOrder = 1;
    this.hit.renderOrder = 6;

    const r0 = innerR(FLOOR) - 0.03;
    const r1 = innerR(LEVEL) - 0.03;
    this.waterMat = new THREE.MeshStandardMaterial({ color: CLEAR.clone(), roughness: 0.06, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 1.3 });
    fresnel(this.waterMat, 0.2, 0.7, 0.05);
    const water = new THREE.Mesh(lathe([[0, FLOOR + 0.01], [r0, FLOOR + 0.01], [r1, LEVEL], [0, LEVEL]], 72), this.waterMat);
    water.renderOrder = 3;

    this.foam = new THREE.Mesh(new THREE.CircleGeometry(r1 - 0.04, 56), new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, opacity: 0 }));
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.y = LEVEL + 0.012;
    this.foam.renderOrder = 5;
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 }));
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.position.y = LEVEL + 0.02;
    this.ripple.renderOrder = 5;

    // Light through the drink lands on the floor beside the glass, away from the key light.
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softDot(), color: CLEAR.clone(), transparent: true, depthWrite: false, opacity: 0.5 }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.set(2.6, 0.012, -1.4);
    this.glow.scale.set(RIM_R * 4.2, RIM_R * 2.6, 1);
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softDot(), color: 0x14304f, transparent: true, depthWrite: false, opacity: 0.32 }));
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = 0.01;
    shade.scale.setScalar(RIM_R * 3);

    this.tablet = new THREE.Mesh(tabletGeometry(TAB_R, TAB_T), tabletMaterial());
    this.tablet.visible = false;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute("size", new THREE.BufferAttribute(new Float32Array(MAX), 1));
    g.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(MAX), 1));
    this.points = new THREE.Points(g, bubbleMaterial());
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.layers.set(1);

    // Two loose tablets at the foot of the glass, on the tube's side, one leaning on the other.
    const geo = tabletGeometry(TAB_R, TAB_T);
    const mat = tabletMaterial();
    const loose = [
      { p: [-side * 4.6, TAB_T / 2 + 0.01, 3.2], r: [0, 0.6, 0] },
      { p: [-side * 6.9, TAB_R * 0.62, 2.4], r: [0, -0.3, side * 1.08] },
    ].map(({ p, r }) => {
      const t = new THREE.Mesh(geo, mat);
      t.position.set(p[0]!, p[1]!, p[2]!);
      t.rotation.set(r[0]!, r[1]!, r[2]!);
      return t;
    });

    this.root.add(shade, this.glow, back, water, this.tablet, ...loose, this.points, this.foam, this.ripple, this.hit);
    if (reduced) {
      // Still image of the finished drink.
      this.drunk = 1;
      this.foamLevel = 0.2;
      this.started = true;
      this.tint();
    }
  }

  /** True once the first tablet has gone and none is in play. */
  get idle() {
    return this.started && this.phase === "idle";
  }

  /** World units → pixels for the bubble sprites (drawing-buffer height / (2·tan(fov/2))). */
  setPointScale(px: number) {
    this.points.material.uniforms.uScale!.value = px;
  }

  /** Drop a tablet from `fromY` (local height, above the frame). */
  drop(fromY: number) {
    if (this.reduced || this.phase !== "idle") return;
    this.started = true;
    this.phase = "fall";
    this.clock = 0;
    this.left = 1;
    this.p.set((Math.random() - 0.5) * 0.6, Math.max(fromY, HEIGHT + 4), (Math.random() - 0.5) * 0.6);
    this.v.set(0, -6, 0);
    this.q.setFromEuler(new THREE.Euler(0.9 + Math.random() * 0.4, Math.random() * Math.PI, 0.35));
    this.w.set(2.5 + Math.random(), 1.5, -1.8);
    this.orbit = Math.random() * Math.PI * 2;
    // A fresh glass for each tablet: the drink clears as the new one falls.
    this.tablet.visible = true;
  }

  /** Auto-drops the first tablet once the glass has been on screen for a beat. */
  autoDrop(dt: number, fromY: number) {
    if (this.started) return;
    this.age += dt;
    // A beat after the canvas has faded in over the poster.
    if (this.age > 1.1) this.drop(fromY);
  }

  /** Advance the drink. Returns true while anything is still moving. */
  update(dt: number, now: number) {
    if (this.reduced || dt <= 0) return false;
    const s = this.left;
    this.clock += dt;
    let fizz = 0;
    switch (this.phase) {
      case "fall": {
        this.v.y -= G * dt;
        this.p.addScaledVector(this.v, dt);
        this.spin(dt);
        this.drunk = Math.max(0, this.drunk - dt * 1.4);
        if (this.p.y - TAB_T / 2 < LEVEL) {
          this.splash();
          this.v.multiplyScalar(0.18);
          this.phase = "sink";
          this.clock = 0;
        }
        break;
      }
      case "sink": {
        fizz = 0.65;
        this.v.y += (-7 - this.v.y) * Math.min(1, dt * 5);
        this.v.x *= Math.exp(-dt * 4);
        this.v.z *= Math.exp(-dt * 4);
        this.p.addScaledVector(this.v, dt);
        this.w.multiplyScalar(Math.exp(-dt * 2.5));
        this.spin(dt);
        this.flatten(dt * 3);
        const bottom = FLOOR + (TAB_T / 2) * this.thick();
        if (this.p.y <= bottom) {
          this.p.y = bottom;
          this.phase = "bottom";
          this.clock = 0;
        }
        break;
      }
      case "bottom": {
        fizz = 1;
        this.left -= dt / 16;
        this.flatten(dt * 6);
        this.p.x += Math.sin(now / 90) * 0.004;
        if (this.clock > 1.3) {
          this.phase = "rise";
          this.clock = 0;
          this.v.set(0, 0, 0);
        }
        break;
      }
      case "rise": {
        fizz = 1;
        this.left -= dt / 14;
        const top = LEVEL - (TAB_T / 2) * this.thick() - 0.12;
        this.v.y += (6 - this.v.y) * Math.min(1, dt * 2.5);
        this.p.y = Math.min(top, this.p.y + this.v.y * dt);
        this.w.y += (1.6 - this.w.y) * dt;
        this.spin(dt);
        this.wobble(now, dt);
        if (this.p.y >= top - 0.01) {
          this.phase = "float";
          this.clock = 0;
        }
        break;
      }
      case "float": {
        this.left -= dt / 6.5;
        fizz = Math.pow(Math.max(0, this.left), 0.55);
        this.orbit += dt * (0.7 + fizz * 0.6);
        const ring = (innerR(LEVEL) - TAB_R * this.left - 0.45) * 0.55;
        const tx = Math.cos(this.orbit) * ring;
        const tz = Math.sin(this.orbit) * ring;
        this.p.x += (tx - this.p.x) * Math.min(1, dt * 1.6);
        this.p.z += (tz - this.p.z) * Math.min(1, dt * 1.6);
        this.p.y = LEVEL - (TAB_T / 2) * this.thick() - 0.12 + Math.sin(now / 160) * 0.03;
        this.w.set(0, 1.4 + fizz * 1.6, 0);
        this.spin(dt);
        this.wobble(now, dt);
        if (this.left <= 0.02) {
          this.left = 0;
          this.tablet.visible = false;
          this.phase = "idle";
          this.clock = 0;
        }
        break;
      }
      default:
        break;
    }
    if (this.left < s) this.drunk = Math.min(1, this.drunk + (s - this.left) * 1.05);
    this.foamLevel += (fizz * 0.9 - this.foamLevel) * Math.min(1, dt * (fizz > this.foamLevel ? 3 : 0.8));
    this.emitBubbles(dt, fizz);
    const moving = this.stepParticles(dt, now);
    this.place();
    this.tint();
    this.rippleT = Math.min(1, this.rippleT + dt / 1.1);
    const k = this.rippleT;
    this.ripple.scale.setScalar(0.4 + k * (innerR(LEVEL) - 0.45));
    this.ripple.material.opacity = (1 - k) * (1 - k) * 0.7;
    this.foam.material.opacity = this.foamLevel;
    this.foam.rotation.z += dt * 0.25;
    return this.phase !== "idle" || moving || this.foamLevel > 0.01 || k < 1;
  }

  /** Pose the simulation `seconds` after a drop from `fromY` (static renders). */
  simulate(seconds: number, fromY: number) {
    // Start from a fresh glass of clear water, whatever the live scene was doing.
    this.phase = "idle";
    this.tablet.visible = false;
    this.drunk = 0;
    this.foamLevel = 0;
    this.rippleT = 1;
    this.life.fill(0);
    this.stepParticles(0, 0);
    this.started = true;
    if (seconds > 0) this.drop(fromY);
    for (let t = 0; t < seconds; t += 1 / 60) this.update(1 / 60, t * 1000);
    this.place();
    this.tint();
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
  }

  private thick() {
    return 0.35 + 0.65 * this.left;
  }

  private spin(dt: number) {
    const a = this.w.length();
    if (a > 1e-3) this.q.premultiply(new THREE.Quaternion().setFromAxisAngle(this.w.clone().divideScalar(a), a * dt));
  }

  /** Ease the disc's faces towards horizontal, keeping its heading. */
  private flatten(k: number) {
    const up = new THREE.Vector3(0, 1, 0);
    const axis = up.clone().applyQuaternion(this.q);
    const flat = new THREE.Quaternion().setFromUnitVectors(axis, axis.y < 0 ? up.clone().negate() : up).multiply(this.q);
    this.q.slerp(flat, Math.min(1, k));
  }

  /** Gas escaping from underneath rocks the tablet a little. */
  private wobble(now: number, dt: number) {
    this.flatten(dt * 4);
    const rock = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(now / 210) * 0.05, 0, Math.cos(now / 260) * 0.05));
    this.q.multiply(rock.slerp(new THREE.Quaternion(), 0.85));
  }

  private place() {
    const r = 0.18 + 0.82 * this.left;
    this.tablet.position.copy(this.p);
    this.tablet.quaternion.copy(this.q);
    this.tablet.scale.set(r, this.thick(), r);
  }

  private tint() {
    // Clear → cloudy as the gas comes off → the drink's colour (never through pink).
    const k = this.drunk;
    const c = k < 0.35 ? this.waterMat.color.copy(CLEAR).lerp(CLOUD, k / 0.35) : this.waterMat.color.copy(CLOUD).lerp(DRINK, ((k - 0.35) / 0.65) * 0.92);
    this.waterMat.emissive.copy(c).multiplyScalar(0.06 + this.drunk * 0.22);
    const u = this.waterMat.userData.fresnel as { uBase: { value: number } } | undefined;
    if (u) u.uBase.value = 0.2 + this.drunk * 0.36;
    this.glow.material.color.copy(c);
    this.glow.material.opacity = 0.3 + this.drunk * 0.4;
  }

  private splash() {
    this.rippleT = 0;
    this.onSplash?.(0.8);
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = 2 + Math.random() * 6;
      this.spawn(1, this.p.x + Math.cos(a) * TAB_R * 0.6, LEVEL + 0.05, this.p.z + Math.sin(a) * TAB_R * 0.6, Math.cos(a) * out, 9 + Math.random() * 16, Math.sin(a) * out, 0.06 + Math.random() * 0.1);
    }
    for (let i = 0; i < 26; i++) this.spawn(0, this.p.x + (Math.random() - 0.5) * 2, LEVEL - Math.random() * 1.5, this.p.z + (Math.random() - 0.5) * 2, 0, 2 + Math.random() * 4, 0, 0.1 + Math.random() * 0.18);
  }

  private emitBubbles(dt: number, fizz: number) {
    if (fizz <= 0 || !this.tablet.visible) return;
    this.emit += dt * fizz * 150;
    const r = TAB_R * (0.18 + 0.82 * this.left);
    while (this.emit >= 1) {
      this.emit -= 1;
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      const big = Math.random() < 0.12;
      this.spawn(0, this.p.x + Math.cos(a) * d, this.p.y + (Math.random() - 0.3) * TAB_T * 0.6, this.p.z + Math.sin(a) * d, (Math.random() - 0.5) * 0.6, 1 + Math.random() * 2, (Math.random() - 0.5) * 0.6, big ? 0.2 + Math.random() * 0.12 : 0.05 + Math.random() * 0.1);
    }
  }

  /** kind 0 = bubble in the water, 1 = droplet in the air. */
  private spawn(kind: 0 | 1, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number) {
    const g = this.points.geometry;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const sz = g.getAttribute("size") as THREE.BufferAttribute;
    let i = this.life.findIndex((l) => l <= 0);
    if (i < 0) i = Math.floor(Math.random() * MAX);
    pos.setXYZ(i, x, y, z);
    this.pv.set([vx, vy, vz], i * 3);
    sz.setX(i, size);
    this.life[i] = kind ? 1.4 : 6;
    this.kind[i] = kind;
    this.seed[i] = Math.random() * 100;
  }

  private stepParticles(dt: number, now: number) {
    const g = this.points.geometry;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const sz = g.getAttribute("size") as THREE.BufferAttribute;
    const al = g.getAttribute("alpha") as THREE.BufferAttribute;
    let alive = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i]! <= 0) {
        if (al.getX(i) !== 0) al.setX(i, 0);
        continue;
      }
      alive = true;
      this.life[i]! -= dt;
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const j = i * 3;
      if (this.kind[i] === 0) {
        // Bubbles accelerate as they rise; bigger ones faster, all with a little sideways wobble.
        const size = sz.getX(i);
        this.pv[j + 1] = Math.min(4 + size * 40, this.pv[j + 1]! + dt * 14);
        const sway = Math.sin(now / 120 + this.seed[i]!) * 0.35;
        x += (this.pv[j]! + sway) * dt;
        y += this.pv[j + 1]! * dt;
        z += (this.pv[j + 2]! + Math.cos(now / 140 + this.seed[i]!) * 0.35) * dt;
        const lim = innerR(y) - size - 0.06;
        const rr = Math.hypot(x, z);
        if (rr > lim) {
          x *= lim / rr;
          z *= lim / rr;
        }
        if (y >= LEVEL - 0.02) {
          this.life[i] = 0;
          // Some pop with a fine spray above the surface.
          if (Math.random() < 0.28) this.spawn(1, x, LEVEL + 0.03, z, (Math.random() - 0.5) * 2.4, 3 + Math.random() * 6, (Math.random() - 0.5) * 2.4, 0.035 + Math.random() * 0.05);
        }
        al.setX(i, this.life[i]! > 0 ? 0.95 : 0);
      } else {
        this.pv[j + 1]! -= G * 0.55 * dt;
        x += this.pv[j]! * dt;
        y += this.pv[j + 1]! * dt;
        z += this.pv[j + 2]! * dt;
        // Droplets landing back in the drink (or on the floor) vanish.
        if ((y < LEVEL && Math.hypot(x, z) < innerR(LEVEL)) || y < 0) this.life[i] = 0;
        al.setX(i, Math.max(0, Math.min(1, this.life[i]! * 2)) * 0.9);
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
    sz.needsUpdate = true;
    return alive;
  }
}

/** Transparent material whose opacity and sheen rise towards grazing angles (Fresnel). */
function fresnel(mat: THREE.MeshStandardMaterial, base: number, edge: number, sheen: number) {
  const u = { uBase: { value: base }, uEdge: { value: edge }, uSheen: { value: sheen } };
  mat.userData.fresnel = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "uniform float uBase;\nuniform float uEdge;\nuniform float uSheen;\nvoid main() {")
      .replace(
        "#include <opaque_fragment>",
        `float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
        outgoingLight += vec3(uSheen) * fr;
        diffuseColor.a *= mix(uBase, uEdge, fr);
        #include <opaque_fragment>`,
      );
  };
}

function glassMaterial(side: THREE.Side) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, depthWrite: false, side, envMapIntensity: 1.8 });
  fresnel(m, side === THREE.BackSide ? 0.03 : 0.05, side === THREE.BackSide ? 0.3 : 0.52, 0.16);
  return m;
}

function bubbleMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 600 } },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      uniform float uScale;
      varying float vA;
      void main() {
        vA = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * 2.0 * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        if (vA <= 0.0) discard;
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float d = length(c);
        if (d > 1.0) discard;
        float rim = smoothstep(0.5, 0.92, d) * (1.0 - smoothstep(0.9, 1.0, d));
        float spec = 1.0 - smoothstep(0.0, 0.42, length(c - vec2(-0.32, -0.36)));
        vec3 col = mix(vec3(0.58, 0.72, 0.86), vec3(1.0), spec);
        gl_FragColor = vec4(col, (rim * 0.85 + spec * 0.95 + (1.0 - d) * 0.1) * vA);
      }`,
  });
}

function canvasTexture(draw: (x: CanvasRenderingContext2D, s: number) => void, s = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = s;
  draw(c.getContext("2d")!, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softDot() {
  return canvasTexture((x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  });
}

/** Fizz on the surface: clusters of tiny rings, denser towards the rim. */
function foamTexture() {
  return canvasTexture((x, s) => {
    const c = s / 2;
    for (let i = 0; i < 1400; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.6) * c * 0.98;
      const r = 0.6 + Math.random() * (d > c * 0.75 ? 3.4 : 2);
      x.strokeStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.5})`;
      x.lineWidth = 0.7;
      x.beginPath();
      x.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, Math.PI * 2);
      x.stroke();
    }
  }, 256);
}
