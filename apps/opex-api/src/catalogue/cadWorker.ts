/**
 * Runs one CAD conversion off the main thread. A fresh worker per file keeps OpenCascade's
 * WebAssembly memory from growing across uploads; the parent kills it after the time limit.
 */
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { CadRejected, convertCad, type CadResult } from "./cad.ts";

export const CAD_TIMEOUT_MS = 90_000;

if (!isMainThread && parentPort && workerData?.cad) {
  const { bytes, unit } = workerData as { cad: true; bytes: Uint8Array; unit?: "mm" | "m" };
  convertCad(bytes, { unit })
    .then((r) => parentPort!.postMessage({ ok: true, result: r }, [r.glb.buffer as ArrayBuffer]))
    .catch((e: Error) => parentPort!.postMessage({ ok: false, rejected: e instanceof CadRejected, message: e instanceof CadRejected ? e.message : "The file could not be converted" }));
}

export function convertInWorker(bytes: Uint8Array, o: { unit?: "mm" | "m"; timeoutMs?: number } = {}): Promise<CadResult> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { cad: true, bytes, unit: o.unit }, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
    const timer = setTimeout(() => {
      void w.terminate();
      reject(new CadRejected("Conversion took too long (90 s limit); simplify the model or split the assembly"));
    }, o.timeoutMs ?? CAD_TIMEOUT_MS);
    w.once("message", (m: { ok: true; result: CadResult } | { ok: false; rejected: boolean; message: string }) => {
      clearTimeout(timer);
      void w.terminate();
      if (m.ok) resolve({ ...m.result, glb: new Uint8Array(m.result.glb) });
      else reject(m.rejected ? new CadRejected(m.message) : new Error(m.message));
    });
    w.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}
