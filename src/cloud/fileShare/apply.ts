import type { AppData } from "@/domain/types";
import { docToSlices } from "./doc";
import type { SharedGroupDoc } from "./types";

/**
 * Applica un documento condiviso (già fuso con mergeDocs) ai dati locali:
 * - upsert delle persone del documento per id, preservando i campi solo locali
 *   (isSelf, archivedAt, createdAt) di chi esiste già;
 * - spese e rimborsi del gruppo sostituiti con quelli del documento
 *   (i record tombstonati sono già assenti dal documento, quindi spariscono);
 * - info del gruppo (nome, emoji, descrizione, valuta, membri) allineate al doc;
 * - group.fileShare.lastSyncedAt aggiornato a `now`.
 *
 * Funzione pura su AppData: nessun gruppo diverso da `groupId` viene toccato.
 */
export function applySharedDocToData(
  data: AppData,
  groupId: string,
  doc: SharedGroupDoc,
  now: string,
): AppData {
  const group = data.groups.find((g) => g.id === groupId);
  if (!group) return data;

  const slices = docToSlices(doc);

  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  for (const p of slices.people) {
    const existing = peopleById.get(p.id);
    peopleById.set(
      p.id,
      existing
        ? { ...existing, name: p.name, color: p.color, email: p.email, updatedAt: p.updatedAt }
        : p,
    );
  }

  const groups = data.groups.map((g) =>
    g.id === groupId
      ? {
          ...g,
          name: doc.name,
          emoji: doc.emoji,
          description: doc.description,
          currency: doc.currency,
          updatedAt: doc.updatedAt,
          memberIds: Object.keys(doc.members),
          fileShare: g.fileShare ? { ...g.fileShare, lastSyncedAt: now } : g.fileShare,
        }
      : g,
  );

  return {
    ...data,
    people: Array.from(peopleById.values()),
    groups,
    expenses: [...data.expenses.filter((e) => e.groupId !== groupId), ...slices.expenses],
    settlements: [...data.settlements.filter((s) => s.groupId !== groupId), ...slices.settlements],
  };
}
