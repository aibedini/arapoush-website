import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type Fin = "matte" | "gloss" | "metal" | "brushed" | "clear" | "glass";
export type PartLook = { finish: Fin; hex: string; meshes?: { i: number; finish: Fin; hex: string }[] };
export type Mounted = { src: string; axis: "+Y" | "-Y" | "+X" | "-X" | "+Z" | "-Z"; anchorMm: [number, number, number]; look?: PartLook };

/** The console studio's finishes (opex-console `studioScene.ts` keeps the same table). */
function finish(f: Fin, hex: string) {
  const base = { color: new THREE.Color(hex), side: THREE.DoubleSide };
  if (f === "matte") return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.75 });
  if (f === "gloss") return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  if (f === "metal") return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.2, metalness: 1, clearcoat: 0.4 });
  if (f === "brushed") return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.45, metalness: 1 });
  if (f === "clear") return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.14, transmission: 0.9, thickness: 0.5, ior: 1.5, transparent: true, opacity: 0.95 });
  return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.05, transmission: 1, thickness: 1, ior: 1.5, transparent: true, opacity: 0.4 });
}

const AXES = { "+Y": [0, 1, 0], "-Y": [0, -1, 0], "+X": [1, 0, 0], "-X": [-1, 0, 0], "+Z": [0, 0, 1], "-Z": [0, 0, -1] } as const;

/**
 * A product from the 3D studio: the body stands with its neck top at the origin (opening up) and
 * the closure sits on it by its own anchor, exactly as approved in OPEX. Real size, never scaled to
 * fit; the camera frames it. Renders only while the visitor moves it.
 */
export class PartScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.5, 5000);
  private controls: OrbitControls;
  private ro: ResizeObserver;
  private raf = 0;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff4ea, 2);
    key.position.set(-60, 100, 80);
    this.scene.add(key, new THREE.HemisphereLight(0xffffff, 0xc9d4de, 0.4));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.addEventListener("change", this.invalidate);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement!);
    this.resize();
  }

  /** `up`: where the mount's axis should point in the scene (+Y for a body, −Y for a closure). */
  private async place(m: Mounted, up: THREE.Vector3) {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(m.src);
    if (m.look) {
      let i = 0;
      const look = m.look;
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const own = look.meshes?.find((x) => x.i === i++);
        mesh.material = own ? finish(own.finish, own.hex) : finish(look.finish, look.hex);
      });
    }
    const holder = new THREE.Group();
    gltf.scene.position.set(-m.anchorMm[0], -m.anchorMm[1], -m.anchorMm[2]);
    holder.add(gltf.scene);
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(...AXES[m.axis]), up);
    return holder;
  }

  async load(body: Mounted | null, closure: Mounted | null) {
    const parts = await Promise.all([body ? this.place(body, new THREE.Vector3(0, 1, 0)) : null, closure ? this.place(closure, new THREE.Vector3(0, -1, 0)) : null]);
    if (this.disposed) return;
    for (const p of parts) if (p) this.scene.add(p);
    this.frame();
  }

  private frame() {
    const box = new THREE.Box3().setFromObject(this.scene);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const d = (Math.max(size.x, size.y, size.z) / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * 1.35;
    this.camera.position.set(centre.x + d * 0.5, centre.y + d * 0.25, centre.z + d * 0.85);
    this.camera.near = d / 100;
    this.camera.far = d * 50;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(centre);
    this.controls.minDistance = d * 0.4;
    this.controls.maxDistance = d * 2.5;
    this.controls.update();
    this.invalidate();
  }

  private resize() {
    const p = this.canvas.parentElement!;
    if (!p.clientWidth || !p.clientHeight) return;
    this.renderer.setSize(p.clientWidth, p.clientHeight, false);
    this.camera.aspect = p.clientWidth / p.clientHeight;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private invalidate = () => {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const moving = this.controls.update();
      this.renderer.render(this.scene, this.camera);
      if (moving) this.invalidate();
    });
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
    });
    this.renderer.dispose();
  }
}
