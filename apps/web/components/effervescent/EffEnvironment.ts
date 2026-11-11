import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

/**
 * Live accents over the studio backdrop (1 unit = 1 cm): a reflective water floor with soft waves
 * and ripple rings, and iridescent bubbles drifting up around the product. The backdrop itself is
 * an image behind the transparent canvas; the floor melts into it towards the horizon.
 */

type Bubble = { p: THREE.Vector3; r: number; v: number; ph: number };
const RIPPLES = 8;

export class Environment {
  readonly root = new THREE.Group();
  private floor: Reflector;
  private floorU: Record<string, THREE.IUniform>;
  private nextRipple = 0;
  private bubbles: THREE.InstancedMesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private bub: Bubble[] = [];
  private time = 0;
  /** Where the hero product stands; bubbles drift around it. */
  private anchor = new THREE.Vector3();

  constructor(
    private side: 1 | -1,
    private mobile: boolean,
    private reduced: boolean,
  ) {
    const count = mobile ? 12 : 28;
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, mobile ? 18 : 28, mobile ? 12 : 18), bubbleMaterial(side), count);
    this.bubbles.frustumCulled = false;
    this.bubbles.renderOrder = 2;
    for (let i = 0; i < count; i++) this.bub.push({ p: new THREE.Vector3(), r: 0, v: 0, ph: Math.random() * 100 });
    this.bub.forEach((b) => this.respawn(b, true));

    // Planar reflection (smaller buffer, no MSAA on phones), distorted by waves and ripple rings.
    this.floor = new Reflector(new THREE.PlaneGeometry(560, 560), { textureWidth: 512, textureHeight: 512, clipBias: 0.003, multisample: mobile ? 0 : 4, shader: floorShader(side) });
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = -8;
    const fm = this.floor.material as THREE.ShaderMaterial;
    fm.transparent = true;
    fm.toneMapped = false;
    this.floorU = fm.uniforms;
    // The reflection pass re-renders the scene: refresh it every other frame (a one-frame lag on
    // gently moving water is invisible), and only once the studio has settled in.
    const reflect = this.floor.onBeforeRender.bind(this.floor);
    let frame = 0;
    this.floor.onBeforeRender = (...args) => {
      if (this.time < 1.2 && !this.reduced) return;
      if (frame++ % 2 === 0 || this.reduced) reflect(...args);
    };
    // Bubbles stay out of the reflection (layer 1 is drawn by the main camera only).
    this.bubbles.layers.set(1);
    this.root.add(this.floor, this.bubbles);
  }

  setAnchor(x: number, y: number) {
    this.anchor.set(x, y, 0);
  }

  /** The reflection's render target (shaders drawn into it need their own compiled variants). */
  get reflectionTarget() {
    return this.floor.getRenderTarget();
  }

  setFloor(y: number) {
    this.floor.position.y = y;
  }

  resize(w: number, h: number, pr: number) {
    const k = this.mobile ? 0.4 : 0.6;
    this.floor.getRenderTarget().setSize(Math.max(256, Math.round(w * pr * k)), Math.max(256, Math.round(h * pr * k)));
  }

  /** A ring spreading on the water at world (x, z). */
  ripple(x: number, z: number, strength = 1) {
    (this.floorU.uRip!.value as THREE.Vector4[])[this.nextRipple++ % RIPPLES]!.set(x, z, this.time, strength);
  }

  /** 0 = ice-blue studio (hero), 1 = navy (end of the story). */
  setMood(m: number) {
    this.bubbles.material.uniforms.uMood!.value = m;
    this.floorU.uMood!.value = m;
  }

  update(dt: number) {
    if (!this.reduced) this.time += dt;
    const t = this.time;
    this.floorU.uTime!.value = t;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    this.bub.forEach((b, i) => {
      if (!this.reduced) {
        b.p.y += b.v * dt;
        if (b.p.y - this.anchor.y > 42) this.respawn(b, false);
      }
      const s = b.r * (1 + Math.sin(t * 2.2 + b.ph) * 0.03);
      pos.set(b.p.x + Math.sin(t * 0.7 + b.ph) * 0.8, b.p.y, b.p.z + Math.cos(t * 0.5 + b.ph) * 0.6);
      m.compose(pos, q, scale.set(s, s, s));
      this.bubbles.setMatrixAt(i, m);
    });
    this.bubbles.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.floor.dispose();
    this.bubbles.geometry.dispose();
    this.bubbles.material.dispose();
  }

  private respawn(b: Bubble, anywhere: boolean) {
    // Mostly small, a few large; spread over the product's side of the frame.
    const big = Math.random() < 0.18;
    b.r = big ? 0.6 + Math.random() * 0.7 : 0.12 + Math.random() * 0.35;
    b.v = (big ? 0.9 : 1.6) + Math.random() * 1.6;
    const spread = this.mobile ? 16 : 24;
    b.p.set(this.anchor.x + (Math.random() - 0.5) * spread * 2 + this.side * 4, this.anchor.y + (anywhere ? Math.random() * 40 : -2), -8 + Math.random() * 14);
  }
}

/**
 * Water floor. Reflects the live objects; where nothing is reflected it shows a painted studio sky
 * (champagne on the glass side, blue across), and it fades out with distance into the backdrop.
 */
function floorShader(side: number) {
  return {
    name: "WaterFloor",
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      uTime: { value: 0 },
      uMood: { value: 0 },
      uSide: { value: side },
      uRip: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
    },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime, uMood, uSide;
      uniform vec4 uRip[${RIPPLES}];
      varying vec4 vUv;
      varying vec3 vWorld;
      vec2 waves(vec2 p) {
        float t = uTime;
        vec2 d = vec2(sin(p.x * 0.33 + t * 0.8) + sin(p.y * 0.52 - t * 0.6), cos(p.y * 0.41 + t * 0.7) + cos((p.x + p.y) * 0.27 + t * 0.5)) * 0.006;
        d += vec2(sin((p.x - p.y) * 1.1 + t * 1.7), cos((p.x + p.y) * 1.3 - t * 1.4)) * 0.0025;
        for (int i = 0; i < ${RIPPLES}; i++) {
          vec4 r = uRip[i];
          float age = uTime - r.z;
          if (age < 0.0 || age > 3.2 || r.w <= 0.0) continue;
          vec2 q = p - r.xy;
          float dist = length(q) + 1e-4;
          float ring = exp(-pow((dist - age * 5.5) * 1.3, 2.0)) * r.w * (1.0 - age / 3.2);
          d += (q / dist) * ring * 0.045 * sin(dist * 4.5 - age * 13.0);
        }
        return d;
      }
      vec3 sky(vec3 d) {
        vec3 horizon = mix(vec3(0.91, 0.94, 0.98), vec3(0.11, 0.24, 0.39), uMood);
        vec3 top = mix(vec3(0.55, 0.69, 0.85), vec3(0.03, 0.09, 0.18), uMood);
        vec3 col = mix(horizon, top, pow(clamp(d.y * 1.5, 0.0, 1.0), 0.75));
        float across = clamp(-uSide * d.x / max(0.25, length(d.xz)), -1.0, 1.0);
        col = mix(col, mix(vec3(0.16, 0.42, 0.72), vec3(0.11, 0.35, 0.65), uMood), pow(smoothstep(-0.35, 1.0, across), 1.4) * 0.75);
        float w = pow(max(dot(d, normalize(vec3(uSide * 0.8, 0.18, -0.55))), 0.0), 3.0);
        col = mix(col, vec3(1.0, 0.86, 0.66), w * 0.55 * (1.0 - uMood * 0.8));
        return col;
      }
      void main() {
        vec2 n = waves(vWorld.xz);
        vec4 uv = vUv;
        uv.xy += n * 4.0 * uv.w;
        vec4 refl = texture2DProj(tDiffuse, uv);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 R = reflect(-V, normalize(vec3(-n.x * 6.0, 1.0, -n.y * 6.0)));
        float fr = 0.3 + 0.7 * pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
        vec3 tint = mix(vec3(0.66, 0.78, 0.89), vec3(0.05, 0.15, 0.26), uMood);
        vec3 mirror = mix(sky(R), refl.rgb, refl.a);
        vec3 col = mix(tint, mirror, fr * 0.85);
        // Sparkle where the waves catch the light.
        col += vec3(1.0, 0.95, 0.88) * pow(clamp(length(n) * 60.0, 0.0, 1.0), 6.0) * 0.25 * (1.0 - uMood * 0.6);
        float far = smoothstep(30.0, 110.0, length(vWorld.xz - cameraPosition.xz));
        gl_FragColor = vec4(col, 1.0 - far);
        #include <colorspace_fragment>
      }`,
  };
}

/** Thin-film bubble: clear centre, iridescent rim, two highlights. */
function bubbleMaterial(side: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { uMood: { value: 0 }, uSide: { value: side } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uMood, uSide;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN);
        float nv = clamp(dot(N, V), 0.0, 1.0);
        float rim = pow(1.0 - nv, 2.6);
        vec3 film = 0.6 + 0.4 * cos(6.2831 * (rim * 1.4 + vec3(0.0, 0.33, 0.67)));
        vec3 L = normalize(vec3(uSide * 0.7, 0.8, 0.5));
        float sp = pow(max(dot(reflect(-V, N), L), 0.0), 80.0);
        float sp2 = pow(max(dot(reflect(-V, N), normalize(vec3(-uSide * 0.6, -0.3, 0.6))), 0.0), 24.0);
        vec3 col = mix(vec3(1.0), film, 0.45) * rim + vec3(1.0, 0.97, 0.9) * sp * 1.4 + vec3(0.75, 0.88, 1.0) * sp2 * 0.5;
        col = mix(col, col * vec3(0.7, 0.85, 1.2), uMood * 0.5);
        float a = clamp(rim * 0.8 + sp + sp2 * 0.4 + 0.02, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}
