import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export type Axis = "+Y" | "-Y" | "+X" | "-X" | "+Z" | "-Z";
export type Mount = { axis: Axis; anchorMm: [number, number, number]; neckDiameterMm: number };
/** Studio finishes (the parts library's `look`); `cad` keeps the file's own colours. */
export type Finish = "cad" | "matte" | "gloss" | "metal" | "brushed" | "clear" | "glass";
export type Look = { finish: Exclude<Finish, "cad">; hex: string; meshes?: { i: number; finish: Exclude<Finish, "cad">; hex: string }[] };
export type View = { section: boolean; lift: boolean; body: boolean; rotate: boolean; wire: boolean; grid: boolean; bg: number };
export type ModelInfo = { triangles: number; meshes: number; sizeMm: [number, number, number] };

const AXES: Record<Axis, THREE.Vector3> = {
  "+Y": new THREE.Vector3(0, 1, 0),
  "-Y": new THREE.Vector3(0, -1, 0),
  "+X": new THREE.Vector3(1, 0, 0),
  "-X": new THREE.Vector3(-1, 0, 0),
  "+Z": new THREE.Vector3(0, 0, 1),
  "-Z": new THREE.Vector3(0, 0, -1),
};
const BGS = [null, 0xffffff, 0x111111];

/** The finishes the site renders too (web `partScene.ts` keeps the same table). */
export function finishMaterial(finish: Exclude<Finish, "cad">, hex: string): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color(hex);
  const base = { color, side: THREE.DoubleSide };
  switch (finish) {
    case "matte":
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.75, metalness: 0 });
    case "gloss":
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.12, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1 });
    case "metal":
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.2, metalness: 1, clearcoat: 0.4 });
    case "brushed":
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.45, metalness: 1 });
    case "clear":
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.14, transmission: 0.9, thickness: 0.5, ior: 1.5, transparent: true, opacity: 0.95 });
    case "glass":
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.05, transmission: 1, thickness: 1, ior: 1.5, transparent: true, opacity: 0.4 });
  }
}

/**
 * The console's 3D studio: a factory part (GLB in millimetres) mounted by its contract, exactly as
 * the site places it (rotated and anchored, never scaled), on a drawn tube stub or on a real body
 * from the parts library. Pieces are picked with a click and given a colour and finish; the view
 * turns, shows a wireframe, a floor grid with the model's box, a half-section and a lifted cap.
 */
export class StudioScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.5, 5000);
  private controls: OrbitControls;
  private holder = new THREE.Group();
  private tube = new THREE.Group();
  private helpers = new THREE.Group();
  private baseHolder = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private base: THREE.Object3D | null = null;
  private meshes: THREE.Mesh[] = [];
  private cadMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private baseMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  private mount: Mount | null = null;
  private baseMount: Mount | null = null;
  private look: Look | null = null;
  private bodyHex = "#f4f6f8";
  private view: View = { section: false, lift: false, body: true, rotate: true, wire: false, grid: true, bg: 0 };
  private tubeDiameter = 30;
  private selected: THREE.Mesh | null = null;
  private start: { p: THREE.Vector3; t: THREE.Vector3 } | null = null;
  private ro: ResizeObserver;
  private raf = 0;
  private disposed = false;
  /** Called with the picked piece's index (or null) when the operator clicks the model. */
  onSelect: ((i: number | null) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.localClippingEnabled = true;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff4ea, 2);
    key.position.set(-60, 100, 80);
    const rim = new THREE.DirectionalLight(0xcfe2ff, 1);
    rim.position.set(70, 40, -80);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0xc9d4de, 0.4), this.holder, this.tube, this.baseHolder, this.helpers);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.autoRotateSpeed = 1.2;
    this.controls.addEventListener("change", () => this.invalidate());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement!);
    this.resize();
    // A click (not a drag) picks a piece.
    let down: [number, number] | null = null;
    canvas.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    canvas.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !this.model) return;
      const r = canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = ray.intersectObject(this.model, true)[0];
      this.select(hit ? this.meshes.indexOf(hit.object as THREE.Mesh) : null);
    });
  }

  private async gltf(url: string) {
    return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)).scene;
  }

  /** The part being edited; null shows only the body (when a body is the part). */
  async load(url: string | null) {
    const next = url ? await this.gltf(url) : null;
    if (this.disposed) return;
    if (this.model) this.holder.remove(this.model);
    this.model = next;
    this.meshes = [];
    this.cadMaterials.clear();
    this.selected = null;
    next?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      this.meshes.push(m);
      this.cadMaterials.set(m, m.material);
    });
    if (next) this.holder.add(next);
    this.apply();
    this.frame();
  }

  /** A body to seat the part on: axis out of its opening, anchor at the neck top. Null removes it. */
  async loadBase(url: string | null, mount: Mount | null) {
    const next = url ? await this.gltf(url) : null;
    if (this.disposed) return;
    if (this.base) this.baseHolder.remove(this.base);
    this.base = next;
    this.baseMount = mount;
    this.baseMaterials.clear();
    next?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) this.baseMaterials.set(m, m.material);
    });
    if (next) this.baseHolder.add(next);
    this.apply();
    this.frame();
  }

  /** Everything the operator edits, applied together. */
  set(o: { mount?: Mount | null; baseMount?: Mount | null; tubeDiameter?: number | null; look?: Look | null; bodyHex?: string; view?: Partial<View> }) {
    if ("mount" in o) this.mount = o.mount ?? null;
    if ("baseMount" in o) this.baseMount = o.baseMount ?? null;
    if ("tubeDiameter" in o) this.tubeDiameter = o.tubeDiameter ?? Math.max(19, (this.mount?.neckDiameterMm ?? 20) * 1.5);
    if ("look" in o) this.look = o.look ?? null;
    if (o.bodyHex) this.bodyHex = o.bodyHex;
    if (o.view) this.view = { ...this.view, ...o.view };
    this.apply();
  }

  info(): ModelInfo | null {
    if (!this.model) return null;
    let triangles = 0;
    for (const m of this.meshes) triangles += (m.geometry.index?.count ?? m.geometry.attributes.position!.count) / 3;
    const s = new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3());
    return { triangles: Math.round(triangles), meshes: this.meshes.length, sizeMm: [s.x, s.y, s.z] };
  }

  select(i: number | null) {
    this.selected = i == null || i < 0 ? null : (this.meshes[i] ?? null);
    this.paint();
    this.onSelect?.(this.selected ? this.meshes.indexOf(this.selected) : null);
  }

  private paint() {
    const look = this.look;
    for (const [i, mesh] of this.meshes.entries()) {
      const own = look?.meshes?.find((x) => x.i === i);
      const mat = own ? finishMaterial(own.finish, own.hex) : look ? finishMaterial(look.finish, look.hex) : null;
      if (mat) mat.wireframe = this.view.wire;
      mesh.material = mat ?? this.cadMaterials.get(mesh)!;
      if (!mat) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) (m as THREE.MeshStandardMaterial).wireframe = this.view.wire;
      if (mesh === this.selected) {
        const sel = (mat ?? (Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material)).clone() as THREE.MeshStandardMaterial;
        sel.emissive = new THREE.Color(0x0f4a3c);
        mesh.material = sel;
      }
    }
    this.setClipping();
    this.invalidate();
  }

  private apply() {
    const m = this.mount;
    if (this.model) {
      const [ax, ay, az] = m?.anchorMm ?? [0, 0, 0];
      this.model.position.set(-ax, -ay, -az);
      this.holder.quaternion.setFromUnitVectors(AXES[m?.axis ?? "-Y"], new THREE.Vector3(0, -1, 0));
      this.holder.position.y = 0;
      this.holder.updateMatrixWorld(true);
      this.holder.position.y = this.view.lift ? new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3()).y * 0.9 + 8 : 0;
    }
    if (this.base) {
      const [bx, by, bz] = this.baseMount?.anchorMm ?? [0, 0, 0];
      this.base.position.set(-bx, -by, -bz);
      this.baseHolder.quaternion.setFromUnitVectors(AXES[this.baseMount?.axis ?? "+Y"], new THREE.Vector3(0, 1, 0));
      this.baseHolder.visible = this.view.body;
      // With no part loaded the body is the part: it takes the look.
      const mat = !this.model && this.look ? finishMaterial(this.look.finish, this.look.hex) : null;
      for (const [mesh, cad] of this.baseMaterials) mesh.material = mat ?? cad;
    }
    this.controls.autoRotate = this.view.rotate && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bg = BGS[this.view.bg % BGS.length];
    this.scene.background = bg == null ? null : new THREE.Color(bg);
    this.scene.updateMatrixWorld(true);
    this.buildTube();
    this.buildHelpers();
    this.paint();
  }

  /** Neck (thread length), shoulder and the start of a tube below y = 0, when there is no real body. */
  private buildTube() {
    this.tube.clear();
    const ring = (d: number) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(d / 2, Math.max(0.15, d * 0.01), 8, 96), new THREE.MeshBasicMaterial({ color: 0xe8893a }));
      t.rotation.x = Math.PI / 2;
      return t;
    };
    if (this.base) {
      if (this.baseMount?.neckDiameterMm) this.tube.add(ring(this.baseMount.neckDiameterMm));
      return;
    }
    if (!this.view.body || !this.mount?.neckDiameterMm || !this.model) return;
    const rn = this.mount.neckDiameterMm / 2;
    const rb = Math.max(rn * 1.2, this.tubeDiameter / 2);
    const neckH = Math.max(6, rn * 0.9);
    const shoulderH = Math.max(4, (rb - rn) * 0.55);
    const pts = [
      new THREE.Vector2(rn * 0.88, 0),
      new THREE.Vector2(rn, 0),
      new THREE.Vector2(rn, -neckH),
      new THREE.Vector2(rb, -neckH - shoulderH),
      new THREE.Vector2(rb, -neckH - shoulderH - rb * 2.6),
    ];
    const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(this.bodyHex), roughness: 0.42, clearcoat: 0.25, side: THREE.DoubleSide, wireframe: this.view.wire });
    this.tube.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 96), mat), ring(rn * 2));
  }

  /** Floor grid and the model's box, sized to what is in view. */
  private buildHelpers() {
    this.helpers.clear();
    this.helpers.visible = this.view.grid;
    const box = this.contentBox(false);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.z, size.y) * 2;
    const grid = new THREE.GridHelper(span, 20, 0x8a9590, 0xc9d0cc);
    grid.position.set(c.x, box.min.y, c.z);
    this.helpers.add(grid);
    if (this.model) this.helpers.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(this.model), new THREE.Color(0x0f7a63)));
  }

  private contentBox(withTube = true) {
    const box = new THREE.Box3();
    if (this.model) box.expandByObject(this.holder);
    if (this.base && this.baseHolder.visible) box.expandByObject(this.baseHolder);
    if (withTube && this.tube.children.length) box.expandByObject(this.tube);
    else if (!withTube) for (const o of this.tube.children) if ((o as THREE.Mesh).geometry instanceof THREE.LatheGeometry) box.expandByObject(o);
    return box;
  }

  private setClipping() {
    const planes = this.view.section ? [this.clip] : [];
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        mat.clippingPlanes = planes;
        if (this.view.section) mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      }
    });
  }

  /** Everything in view, from a three-quarter angle. */
  frame() {
    this.scene.updateMatrixWorld(true);
    const box = this.contentBox();
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const d = (Math.max(size.x, size.y, size.z) / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * 1.5;
    this.camera.position.set(centre.x + d * 0.55, centre.y + d * 0.3, centre.z + d * 0.8);
    this.camera.near = d / 100;
    this.camera.far = d * 50;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(centre);
    this.controls.update();
    this.start = { p: this.camera.position.clone(), t: centre.clone() };
    this.invalidate();
  }

  reset() {
    if (!this.start) return this.frame();
    this.camera.position.copy(this.start.p);
    this.controls.target.copy(this.start.t);
    this.controls.update();
    this.invalidate();
  }

  snapshot() {
    const was = this.helpers.visible;
    this.helpers.visible = false;
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.helpers.visible = was;
    this.invalidate();
    return url;
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
      if (moving || this.controls.autoRotate) this.invalidate();
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
