/**
 * Three-way merge for shared case values (timeline, payments, tasks, ignored flags).
 *
 * `base` is the copy this device last read from the shared store, `mine` is what
 * the device wants to save, and `theirs` is what the shared store holds right now.
 * Only what this device actually changed since `base` is applied on top of
 * `theirs`, so two devices editing different entries never wipe each other out.
 */

type Json = unknown;

function same(a: Json, b: Json) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isPlainObject(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasIds(list: Json[]): list is { id: string }[] {
  return list.every((entry) => isPlainObject(entry) && typeof entry["id"] === "string");
}

function mergeById(base: { id: string }[], mine: { id: string }[], theirs: { id: string }[]) {
  const baseById = new Map(base.map((e) => [e.id, e]));
  const mineById = new Map(mine.map((e) => [e.id, e]));
  const result: { id: string }[] = [];
  const placed = new Set<string>();

  for (const entry of theirs) {
    placed.add(entry.id);
    const before = baseById.get(entry.id);
    const mineEntry = mineById.get(entry.id);
    if (!mineEntry) {
      // Removed on this device since the last read: drop it. Otherwise this device never had it: keep it.
      if (before) continue;
      result.push(entry);
    } else if (!before || !same(mineEntry, before)) {
      result.push(mineEntry); // added or edited here
    } else {
      result.push(entry); // untouched here: keep the shared version
    }
  }
  for (const entry of mine) {
    if (placed.has(entry.id)) continue;
    // Not in the shared copy: new on this device, unless another device deleted it.
    const before = baseById.get(entry.id);
    if (!before || !same(entry, before)) result.push(entry);
  }
  return result;
}

function mergeSet(base: Json[], mine: Json[], theirs: Json[]) {
  const key = (v: Json) => JSON.stringify(v);
  const baseKeys = new Set(base.map(key));
  const mineKeys = new Set(mine.map(key));
  const removedHere = new Set([...baseKeys].filter((k) => !mineKeys.has(k)));
  const result = theirs.filter((v) => !removedHere.has(key(v)));
  const resultKeys = new Set(result.map(key));
  for (const v of mine) {
    if (!baseKeys.has(key(v)) && !resultKeys.has(key(v))) {
      result.push(v);
      resultKeys.add(key(v));
    }
  }
  return result;
}

export function mergeShared(base: Json, mine: Json, theirs: Json): Json {
  if (theirs === undefined || theirs === null) return mine;
  if (base === undefined || base === null) {
    // No earlier read to compare with: combine both sides, never delete anything.
    if (!Array.isArray(mine) && !isPlainObject(mine)) return mine;
    return mergeShared(emptyLike(mine), mine, theirs);
  }
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const before = Array.isArray(base) ? base : [];
    if (hasIds(mine) && hasIds(theirs) && hasIds(before)) return mergeById(before, mine, theirs);
    return mergeSet(before, mine, theirs);
  }
  if (isPlainObject(mine) && isPlainObject(theirs)) {
    const before = isPlainObject(base) ? base : {};
    const out: Record<string, Json> = { ...theirs };
    for (const key of Object.keys(mine)) {
      out[key] = mergeShared(before[key], mine[key], theirs[key]);
    }
    return out;
  }
  return same(mine, base) ? theirs : mine;
}

function emptyLike(value: Json): Json {
  if (Array.isArray(value)) return [];
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, emptyLike(v)]));
  }
  return undefined;
}
