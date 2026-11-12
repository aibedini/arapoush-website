/**
 * Factory CAD → web model (T2). STEP/STP is tessellated by OpenCascade (occt-import-js, LGPL-2.1,
 * used unmodified as a library); GLB uploads are read as they are. Both become one GLB in
 * millimetres, cleaned and compressed with glTF Transform (meshopt), plus the facts the console
 * needs to review it: bounding box, triangle count, parts.
 *
 * Runs inside a worker thread (cadWorker.ts) so a heavy file never blocks the API.
 * Nothing here guesses fit: mounting (anchor, axis, neck) is set by an operator and approved.
 */
import { createRequire } from "node:module";
import { Document, Logger, NodeIO, type Mesh } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

export type CadKind = "step" | "glb";
export type CadResult = {
  glb: Uint8Array;
  /** Millimetres. */
  bbox: { min: [number, number, number]; max: [number, number, number]; size: [number, number, number] };
  triangles: number;
  parts: number;
  simplified: boolean;
};

export const CAD_LIMITS = { bytes: 25 * 1024 * 1024, triangles: 2_000_000, targetTriangles: 80_000 };

export class CadRejected extends Error {}

/** STEP files start with the ISO 10303-21 header; GLB with the binary glTF magic. */
export function sniffCad(buf: Uint8Array): CadKind | null {
  const head = new TextDecoder("latin1").decode(buf.subarray(0, 64));
  if (head.startsWith("ISO-10303-21")) return "step";
  if (head.startsWith("glTF")) return "glb";
  return null;
}

type Occt = { ReadStepFile: (b: Uint8Array, p: unknown) => OcctResult };
type OcctMesh = { name?: string; color?: [number, number, number]; attributes: { position: { array: number[] }; normal?: { array: number[] } }; index: { array: number[] } };
type OcctResult = { success: boolean; meshes: OcctMesh[] };

let occt: Promise<Occt> | null = null;
const loadOcct = () => (occt ??= (createRequire(import.meta.url)("occt-import-js") as () => Promise<Occt>)());

async function fromStep(bytes: Uint8Array): Promise<Document> {
  const r = (await loadOcct()).ReadStepFile(bytes, { linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio", linearDeflection: 0.0015, angularDeflection: 0.35 });
  if (!r.success || !r.meshes.length) throw new CadRejected("The STEP file has no solid geometry that could be read");
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("model");
  const materials = new Map<string, ReturnType<Document["createMaterial"]>>();
  r.meshes.forEach((m, i) => {
    const c = m.color ?? [0.92, 0.93, 0.94];
    const key = c.join(",");
    if (!materials.has(key)) materials.set(key, doc.createMaterial(`m${materials.size}`).setBaseColorFactor([c[0], c[1], c[2], 1]).setRoughnessFactor(0.45).setMetallicFactor(0));
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(m.attributes.position.array)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(m.index.array)).setBuffer(buffer))
      .setMaterial(materials.get(key)!);
    if (m.attributes.normal) prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(m.attributes.normal.array)).setBuffer(buffer));
    const mesh = doc.createMesh(m.name || `part${i + 1}`).addPrimitive(prim);
    scene.addChild(doc.createNode(m.name || `part${i + 1}`).setMesh(mesh));
  });
  doc.getRoot().setDefaultScene(scene);
  return doc;
}

const quiet = new Logger(Logger.Verbosity.ERROR);
const io = () => new NodeIO().setLogger(quiet).registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const count = (meshes: Mesh[]) => meshes.reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")?.getCount() ?? 0) / 3, 0), 0);

/** `unit`: what one GLB unit means (glTF is metres by convention; many CAD exports use mm). */
export async function convertCad(bytes: Uint8Array, o: { unit?: "mm" | "m" } = {}): Promise<CadResult> {
  if (bytes.length > CAD_LIMITS.bytes) throw new CadRejected("File too large (25 MB at most)");
  const kind = sniffCad(bytes);
  if (!kind) throw new CadRejected("Not a STEP (.step/.stp) or GLB file");
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  await MeshoptSimplifier.ready;

  const doc = kind === "step" ? await fromStep(bytes) : await io().readBinary(bytes);
  doc.setLogger(quiet);
  // A GLB in metres is scaled to millimetres so every model shares one unit.
  if (kind === "glb" && (o.unit ?? "m") === "m") for (const n of doc.getRoot().listScenes()[0]?.listChildren() ?? []) n.setScale(n.getScale().map((s) => s * 1000) as [number, number, number]);
  const meshes = doc.getRoot().listMeshes();
  const before = count(meshes);
  if (!before) throw new CadRejected("The file has no meshes");
  if (before > CAD_LIMITS.triangles) throw new CadRejected(`Too many triangles (${Math.round(before)}; 2,000,000 at most)`);

  await doc.transform(dedup(), weld());
  let simplified = false;
  if (count(doc.getRoot().listMeshes()) > CAD_LIMITS.targetTriangles) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: CAD_LIMITS.targetTriangles / before, error: 0.0005 }));
    simplified = true;
  }
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));

  // Bounding box in mm, applying each node's world transform.
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const mtx = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute("POSITION");
      if (!pos) continue;
      const v: number[] = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        const x = mtx[0] * v[0]! + mtx[4] * v[1]! + mtx[8] * v[2]! + mtx[12];
        const y = mtx[1] * v[0]! + mtx[5] * v[1]! + mtx[9] * v[2]! + mtx[13];
        const z = mtx[2] * v[0]! + mtx[6] * v[1]! + mtx[10] * v[2]! + mtx[14];
        [x, y, z].forEach((c, k) => {
          if (c < min[k]!) min[k] = c;
          if (c > max[k]!) max[k] = c;
        });
      }
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const glb = await io().writeBinary(doc);
  return {
    glb,
    bbox: { min: min.map(round) as [number, number, number], max: max.map(round) as [number, number, number], size: max.map((m, i) => round(m - min[i]!)) as [number, number, number] },
    triangles: Math.round(count(doc.getRoot().listMeshes())),
    parts: doc.getRoot().listMeshes().length,
    simplified,
  };
}
