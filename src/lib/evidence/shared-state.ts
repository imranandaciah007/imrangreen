import { useCallback, useEffect, useRef, useState } from "react";

import { documentProvider } from "@/lib/evidence/provider";

/**
 * A setting that follows you to whichever device you sign in on, such as the
 * Documents layout or folder favourites. This device's copy shows straight
 * away; the shared copy replaces it once read, and again when the app regains focus.
 */
export function useSharedPref<T>(
  name: string,
  fallback: T,
  /** Where this device kept the setting before it was shared, so nothing is lost. */
  localKey = `gc.pref.${name}`,
): [T, (next: T | ((prev: T) => T)) => void] {
  const key = `pref.${name}`;
  const [value, setValue] = useState<T>(fallback);
  const valueRef = useRef(value);
  valueRef.current = value;
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    let alive = true;
    try {
      const raw = window.localStorage.getItem(localKey);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      // No copy on this device yet; the shared copy arrives below.
    }
    const load = () =>
      void documentProvider
        .loadShared<T>(key, localKey, fallbackRef.current)
        .then((shared) => {
          if (alive && JSON.stringify(shared) !== JSON.stringify(valueRef.current)) setValue(shared);
        })
        .catch(() => undefined);
    load();
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
    };
  }, [key, localKey]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(valueRef.current) : next;
      valueRef.current = resolved;
      setValue(resolved);
      documentProvider.saveShared(key, localKey, resolved, { replace: true });
    },
    [key, localKey],
  );

  return [value, update];
}

/** Long jobs whose progress is shared, so another device can see and resume them. */
export type JobKind = "drive" | "read" | "filing";

export interface SharedJob {
  status: "running" | "paused" | "stopped" | "done";
  done: number;
  total: number;
  updatedAt: string;
  device: string;
  /** The packet a filing build belongs to. */
  packetId?: string | undefined;
}

export type SharedJobs = Partial<Record<JobKind, SharedJob>>;

export const JOBS_KEY = "jobs";
export const JOBS_LOCAL_KEY = "gc.jobs";

/** A random name for this browser, so a job can tell "this device" from "another one". */
export function deviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.localStorage.getItem("gc.device");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem("gc.device", id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

/** A job that says "running" but has not moved for this long has stopped (the device closed). */
export const STALE_JOB_MS = 2 * 60_000;
