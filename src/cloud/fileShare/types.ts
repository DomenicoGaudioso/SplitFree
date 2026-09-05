import type { Expense, Settlement } from "@/domain/types";

/**
 * Documento JSON condiviso via file (Google Drive/OneDrive dell'amministratore).
 * Un solo file per gruppo: mappe indicizzate per id, merge last-write-wins su updatedAt.
 * Le tombstone ricordano gli id eliminati (id -> ISO di eliminazione) per propagare le cancellazioni.
 */

export type SharedMemberDoc = {
  name: string;
  color: string;
  email: string | null;
  updatedAt: string;
};

export type SharedExpenseDoc = Omit<Expense, "id" | "groupId">;

export type SharedSettlementDoc = Omit<Settlement, "id" | "groupId">;

export type SharedGroupDoc = {
  /** Versione del formato, per evoluzioni future. */
  v: 1;
  groupId: string;
  name: string;
  emoji: string;
  description: string;
  currency: string;
  updatedAt: string;
  /** Contatore monotono: aumenta a ogni scrittura, utile per capire se il file è cambiato. */
  revision: number;
  members: Record<string, SharedMemberDoc>;
  expenses: Record<string, SharedExpenseDoc>;
  settlements: Record<string, SharedSettlementDoc>;
  /** Id eliminati -> ISO di eliminazione. */
  tombstones: Record<string, string>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isValidMember(v: unknown): v is SharedMemberDoc {
  if (!isRecord(v)) return false;
  return (
    isString(v.name) &&
    isString(v.color) &&
    (v.email === null || isString(v.email)) &&
    isString(v.updatedAt)
  );
}

function isValidExpense(v: unknown): v is SharedExpenseDoc {
  if (!isRecord(v)) return false;
  return (
    isString(v.title) &&
    isString(v.date) &&
    isString(v.currency) &&
    typeof v.amountMinor === "number" &&
    Array.isArray(v.payers) &&
    Array.isArray(v.splits) &&
    isString(v.createdAt) &&
    isString(v.updatedAt)
  );
}

function isValidSettlement(v: unknown): v is SharedSettlementDoc {
  if (!isRecord(v)) return false;
  return (
    isString(v.fromPersonId) &&
    isString(v.toPersonId) &&
    typeof v.amountMinor === "number" &&
    isString(v.date) &&
    isString(v.createdAt)
  );
}

function isValidMap<V>(v: unknown, check: (x: unknown) => x is V): v is Record<string, V> {
  if (!isRecord(v)) return false;
  return Object.values(v).every(check);
}

function isValidTombstones(v: unknown): v is Record<string, string> {
  if (!isRecord(v)) return false;
  return Object.values(v).every(isString);
}

/** Parsing difensivo di un documento letto dal file: restituisce null su qualsiasi difformità, mai eccezioni. */
export function validateSharedGroupDoc(raw: unknown): SharedGroupDoc | null {
  try {
    if (!isRecord(raw)) return null;
    if (raw.v !== 1) return null;
    if (
      !isString(raw.groupId) ||
      !isString(raw.name) ||
      !isString(raw.emoji) ||
      !isString(raw.description) ||
      !isString(raw.currency) ||
      !isString(raw.updatedAt)
    ) {
      return null;
    }
    if (typeof raw.revision !== "number" || !Number.isFinite(raw.revision)) return null;
    if (!isValidMap(raw.members, isValidMember)) return null;
    if (!isValidMap(raw.expenses, isValidExpense)) return null;
    if (!isValidMap(raw.settlements, isValidSettlement)) return null;
    if (!isValidTombstones(raw.tombstones)) return null;
    return raw as unknown as SharedGroupDoc;
  } catch {
    return null;
  }
}
