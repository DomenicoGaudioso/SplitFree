import type { Expense, Group, Person, Settlement } from "@/domain/types";
import type { SharedGroupDoc, SharedMemberDoc } from "./types";

/** Millisecondi in 30 giorni: oltre questa soglia le tombstone vengono potate. */
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

/** Tiene solo le tombstone più recenti di 30 giorni rispetto a `now`. */
export function pruneTombstones(tombstones: Record<string, string>, now: string): Record<string, string> {
  const nowMs = Date.parse(now);
  const out: Record<string, string> = {};
  for (const [id, deletedAt] of Object.entries(tombstones)) {
    const t = Date.parse(deletedAt);
    if (Number.isNaN(t) || Number.isNaN(nowMs) || nowMs - t <= TOMBSTONE_TTL_MS) {
      out[id] = deletedAt;
    }
  }
  return out;
}

/**
 * Costruisce il documento condiviso a partire dai dati locali del gruppo.
 * Se `prev` è dato, preserva le tombstone (potate oltre 30 giorni) e incrementa la revision.
 */
export function buildDoc(
  group: Group,
  people: Person[],
  expenses: Expense[],
  settlements: Settlement[],
  prev?: SharedGroupDoc | null,
): SharedGroupDoc {
  const members: Record<string, SharedMemberDoc> = {};
  for (const p of people) {
    if (!group.memberIds.includes(p.id)) continue;
    members[p.id] = { name: p.name, color: p.color, email: p.email, updatedAt: p.updatedAt };
  }

  const expenseDocs: SharedGroupDoc["expenses"] = {};
  for (const e of expenses) {
    if (e.groupId !== group.id) continue;
    const { id, groupId, ...rest } = e;
    expenseDocs[id] = rest;
  }

  const settlementDocs: SharedGroupDoc["settlements"] = {};
  for (const s of settlements) {
    if (s.groupId !== group.id) continue;
    const { id, groupId, ...rest } = s;
    settlementDocs[id] = rest;
  }

  return {
    v: 1,
    groupId: group.id,
    name: group.name,
    emoji: group.emoji,
    description: group.description,
    currency: group.currency,
    updatedAt: group.updatedAt,
    revision: (prev?.revision ?? 0) + 1,
    members,
    expenses: expenseDocs,
    settlements: settlementDocs,
    tombstones: pruneTombstones(prev?.tombstones ?? {}, nowIso()),
  };
}

/** Ricostruisce i record locali (persone, spese, rimborsi) dal documento condiviso. */
export function docToSlices(doc: SharedGroupDoc): {
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
} {
  const people: Person[] = Object.entries(doc.members).map(([id, m]) => ({
    id,
    name: m.name,
    color: m.color,
    email: m.email,
    isSelf: false,
    archivedAt: null,
    createdAt: m.updatedAt,
    updatedAt: m.updatedAt,
  }));

  const expenses: Expense[] = Object.entries(doc.expenses).map(([id, e]) => ({
    ...e,
    id,
    groupId: doc.groupId,
  }));

  const settlements: Settlement[] = Object.entries(doc.settlements).map(([id, s]) => ({
    ...s,
    id,
    groupId: doc.groupId,
  }));

  return { people, expenses, settlements };
}
