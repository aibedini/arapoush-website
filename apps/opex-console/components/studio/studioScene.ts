import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export type Axis = "+Y" | "-Y" | "+X" | "-X" | "+Z" | "-Z";
export type Mount = { axis: Axis; anchorMm: [number, number, number]; neckDiameterMm: number };
export type Finish = "cad" | "white" | "colour" | "clear" | "silver" | "gold";
export type StudioLook = { finish: Finish; hex: string; bodyHex: string; section: boolean; lift: boolean; body: boolean };

const AXES: Record<Axis, THREE.Vector3> = {
  "+Y": new THREE.Vector3(0, 1, 0),
  "-Y": new THREE.Vector3(0, -1, 0),
  "+X": new THREE.Vector3(1, 0, 0),
  "-X": new THREE.Vector3(-1, 0, 0),
  "+Z": new THREE.Vector3(0, 0, 1),
  "-Z": new THREE.Vector3(0, 0, -1),
};

/** The cap finishes the site uses (TubeScene's capMaterial), so the console shows what visitors will see. */
export function finishMaterial(finish: Finish, hex: string): THREE.Material | null {
  const color = new THREE.Color(finish === "white" ? "#f7f8f9" : finish === "silver" ? "#c9ced3" : finish === "gold" ? "#d4af37" : hex);
  if (finish === "cad") return null;
  if (finish === "silver" || finish === "gold") return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.22, clearcoat: 0.5 });
  if (finish === "clear") return new THREE.MeshPhysicalMaterial({ color, transmission: 0.92, roughness: 0.14, thickness: 0.5, ior: 1.5, transparent: true, opacity: 0.95, clearcoat: 0.4 });
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.3 });
}

/**
 * The console's 3D studio for a factory part: the converted GLB (millimetres) mounted by its
 * contract on a tube neck and shoulder, exactly as the site places it (rotated and anchored, never
 * scaled). The operator sees the mounting change live, can cut the view in half to check the neck
 * seats inside the cap, and tries the site's cap finishes. Renders on demand.
 */
export class StudioScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  private controls: OrbitControls;
  private holder = new THREE.Group();
  private tube = new THREE.Group();
  private model: THREE.Object3D | null = null;
  /** S2: a real body from the parts library, in place of the drawn tube stub. */
  private baseHolder = new THREE.Group();
  private base: THREE.Object3D | null = null;
  private baseMount: Mount | null = null;
  private baseMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private cadMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  private mount: Mount | null = null;
  private look: StudioLook = { finish: "cad", hex: "#1d4a72", bodyHex: "#f4f6f8", section: false, lift: false, body: true };
  private tubeDiameter = 30;
  private ro: ResizeObserver;
  private raf = 0;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.localClippingEnabled = true;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff4ea, 2.2);
    key.position.set(-60, 100, 80);
    const rim = new THREE.DirectionalLight(0xcfe2ff, 1.2);
    rim.position.set(70, 40, -80);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0xc9d4de, 0.4), this.holder, this.tube, this.baseHolder);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener("change", () => this.invalidate());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement!);
    this.resize();
  }

  /**
   * A body to seat the closure on: its mount's axis points out of the opening and its anchor is the
   * neck top, so it stands below y = 0 exactly where the closure's anchor sits. Null removes it.
   */
  async loadBase(url: string | null, mount: Mount | null) {
    this.baseMount = mount;
    if (this.base) this.baseHolder.remove(this.base);
    this.base = null;
    this.baseMaterials.clear();
    if (url) {
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
      if (this.disposed) return;
      this.base = gltf.scene;
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) this.baseMaterials.set(m, m.material);
      });
      this.baseHolder.add(gltf.scene);
    }
    this.apply();
    this.frame();
  }

  setBaseMount(mount: Mount | null) {
    this.baseMount = mount;
    this.apply();
  }

  async load(url: string | null) {
    if (!url) {
      if (this.model) this.holder.remove(this.model);
      this.model = null;
      this.cadMaterials.clear();
      this.apply();
      return;
    }
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    if (this.disposed) return;
    if (this.model) this.holder.remove(this.model);
    this.model = gltf.scene;
    this.cadMaterials.clear();
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) this.cadMaterials.set(m, m.material);
    });
    this.holder.add(gltf.scene);
    this.apply();
    this.frame();
  }

  /** Mounting contract, tube diameter and look: everything the operator edits, applied together. */
  set(mount: Mount | null, tubeDiameter: number | null, look: Partial<StudioLook>) {
    this.mount = mount;
    this.tubeDiameter = tubeDiameter ?? Math.max(19, (mount?.neckDiameterMm ?? 20) * 1.5);
    this.look = { ...this.look, ...look };
    this.apply();
  }

  private apply() {
    const m = this.mount;
    if (this.model) {
      const [ax, ay, az] = m?.anchorMm ?? [0, 0, 0];
      this.model.position.set(-ax, -ay, -az);
      this.holder.quaternion.setFromUnitVectors(AXES[m?.axis ?? "-Y"], new THREE.Vector3(0, -1, 0));
      this.holder.updateMatrixWorld(true);
      const lift = this.look.lift ? new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3()).y * 0.9 + 8 : 0;
      this.holder.position.y = lift;
      const chosen = finishMaterial(this.look.finish, this.look.hex);
      for (const [mesh, cad] of this.cadMaterials) mesh.material = chosen ?? cad;
    }
    if (this.base) {
      const [bx, by, bz] = this.baseMount?.anchorMm ?? [0, 0, 0];
      this.base.position.set(-bx, -by, -bz);
      this.baseHolder.quaternion.setFromUnitVectors(AXES[this.baseMount?.axis ?? "+Y"], new THREE.Vector3(0, 1, 0));
      const mat = this.look.finish === "cad" ? null : new THREE.MeshPhysicalMaterial({ color: new THREE.Color(this.look.bodyHex), roughness: 0.42, clearcoat: 0.25 });
      for (const [mesh, cad] of this.baseMaterials) mesh.material = mat ?? cad;
    }
    this.buildTube();
    this.setClipping();
    this.invalidate();
  }

  /** Neck (thread length), shoulder and the start of the body, below the neck top at y = 0. */
  private buildTube() {
    this.tube.clear();
    const ring = (d: number) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(d / 2, Math.max(0.15, d * 0.01), 8, 96), new THREE.MeshBasicMaterial({ color: 0xe8893a }));
      t.rotation.x = Math.PI / 2;
      return t;
    };
    if (this.base) {
      // The real body is shown; only mark its neck top.
      const d = this.baseMount?.neckDiameterMm;
      if (d) this.tube.add(ring(d));
      this.baseHolder.visible = this.look.body;
      return;
    }
    if (!this.look.body || !this.mount?.neckDiameterMm) return;
    const rn = this.mount.neckDiameterMm / 2;
    const rb = Math.max(rn * 1.2, this.tubeDiameter / 2);
    const neckH = Math.max(6, rn * 0.9);
    const shoulderH = Math.max(4, (rb - rn) * 0.55);
    const bodyH = rb * 2.6;
    const pts = [
      new THREE.Vector2(rn * 0.88, 0), // the open neck: its wall, not a closed disc
      new THREE.Vector2(rn, 0),
      new THREE.Vector2(rn, -neckH),
      new THREE.Vector2(rb, -neckH - shoulderH),
      new THREE.Vector2(rb, -neckH - shoulderH - bodyH),
    ];
    const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(this.look.bodyHex), roughness: 0.42, clearcoat: 0.25, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), mat);
    this.tube.add(body, ring(rn * 2));
  }

  private setClipping() {
    const planes = this.look.section ? [this.clip] : [];
    const all: THREE.Material[] = [];
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) all.push(...(Array.isArray(m.material) ? m.material : [m.material]));
    });
    for (const mat of all) {
      mat.clippingPlanes = planes;
      mat.side = this.look.section ? THREE.DoubleSide : mat.side;
      mat.needsUpdate = true;
    }
  }

  /** The cap and the tube stub in view, from a three-quarter angle. */
  frame() {
    const box = new THREE.Box3();
    if (this.model) box.expandByObject(this.holder);
    if (this.tube.children.length) box.expandByObject(this.tube);
    if (this.base && this.baseHolder.visible) box.expandByObject(this.baseHolder);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) * 1.5;
    this.camera.position.set(centre.x + d * 0.55, centre.y + d * 0.3, centre.z + d * 0.8);
    this.camera.near = d / 100;
    this.camera.far = d * 50;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(centre);
    this.controls.update();
    this.invalidate();
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  private resize() {
    const p = this.canvas.parentElement!;
    const w = p.clientWidth;
    const h = p.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
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
