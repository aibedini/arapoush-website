"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "./api";

/** GET a resource; `reload` re-fetches. Errors are kept for the page to show. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    api<T>(path)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: ApiError) => live && setError(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Runs a write, tracking busy/error state and a short success message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await fn();
      if (ok) setDone(ok);
      return r;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "CLIENT", String(e)));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, done, run, setError, setDone };
}

export type Me = { id: string; display: string; role: "super_admin" | "operator" | "auditor" | "viewer"; stepUpValid: boolean };
export const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);
const RANK = { viewer: 1, auditor: 2, operator: 3, super_admin: 4 } as const;
/** Read access by rank. Writes use canWrite: auditors outrank viewers but never write. */
export const atLeast = (me: Me | null, role: keyof typeof RANK) => !!me && RANK[me.role] >= RANK[role];
export const canWrite = (me: Me | null) => !!me && (me.role === "operator" || me.role === "super_admin");
