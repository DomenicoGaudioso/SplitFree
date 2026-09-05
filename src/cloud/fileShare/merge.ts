import { pruneTombstones } from "./doc";
import type { SharedGroupDoc } from "./types";

/**
 * Merge last-write-wins fra documenti condivisi: union per id, a parità di id
 * vince il record con updatedAt più recente (a parità vince il remoto).
 * Le tombstone fanno union e cancellano i record più vecchi della eliminazione.
 */

function nowIso(): string {
  return new Date().toISOString();
}

/** Timestamp di confronto: updatedAt dove c'è, altrimenti createdAt (i rimborsi non hanno updatedAt). */
function stampOf(rec: { updatedAt?: string; createdAt?: string }): string {
  return rec.updatedAt ?? rec.createdAt ?? "";
}

/** Union per id con last-write-wins; a parità di timestamp vince il remoto. */
function mergeMap<V extends { updatedAt?: string; createdAt?: string }>(
  local: Record<string, V>,
  remote: Record<string, V>,
): Record<string, V> {
  const out: Record<string, V> = { ...local };
  for (const [id, rec] of Object.entries(remote)) {
    const existing = out[id];
    if (!existing || stampOf(rec) >= stampOf(existing)) {
      out[id] = rec;
    }
  }
  return out;
}

/** Applica le tombstone: un id tombstonato cancella il record, salvo record più recente della eliminazione. */
function applyTombstones<V extends { updatedAt?: string; createdAt?: string }>(
  map: Record<string, V>,
  tombstones: Record<string, string>,
): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [id, rec] of Object.entries(map)) {
    const deletedAt = tombstones[id];
    if (deletedAt !== undefined && stampOf(rec) <= deletedAt) continue;
    out[id] = rec;
  }
  return out;
}

/** Fonde il documento locale con quello remoto (il locale può non esistere ancora). */
export function mergeDocs(local: SharedGroupDoc | null, remote: SharedGroupDoc): SharedGroupDoc {
  if (!local) {
    return { ...remote, tombstones: pruneTombstones(remote.tombstones, nowIso()) };
  }

  const tombstones = pruneTombstones({ ...local.tombstones, ...remote.tombstones }, nowIso());

  // Info gruppo dal documento con updatedAt più recente (a parità vince il remoto).
  const info = remote.updatedAt >= local.updatedAt ? remote : local;

  return {
    v: 1,
    groupId: remote.groupId,
    name: info.name,
    emoji: info.emoji,
    description: info.description,
    currency: info.currency,
    updatedAt: info.updatedAt,
    revision: Math.max(local.revision, remote.revision) + 1,
    members: applyTombstones(mergeMap(local.members, remote.members), tombstones),
    expenses: applyTombstones(mergeMap(local.expenses, remote.expenses), tombstones),
    settlements: applyTombstones(mergeMap(local.settlements, remote.settlements), tombstones),
    tombstones,
  };
}

/** Marca gli id come eliminati (tombstone a `now`) e rimuove i record corrispondenti. */
export function tombstoneFor(doc: SharedGroupDoc, ids: string[], now: string): SharedGroupDoc {
  const tombstones = { ...doc.tombstones };
  for (const id of ids) tombstones[id] = now;
  return {
    ...doc,
    members: applyTombstones(doc.members, tombstones),
    expenses: applyTombstones(doc.expenses, tombstones),
    settlements: applyTombstones(doc.settlements, tombstones),
    tombstones,
  };
}
