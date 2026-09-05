import { describe, expect, it } from "vitest";
import { mergeDocs, tombstoneFor } from "@/cloud/fileShare/merge";
import type { SharedExpenseDoc, SharedGroupDoc, SharedMemberDoc } from "@/cloud/fileShare/types";

// Fixture sintetiche: documento base con 2 membri e 2 spese.

const T0 = "2026-01-01T10:00:00.000Z";
const T1 = "2026-01-02T10:00:00.000Z";
const T2 = "2026-01-03T10:00:00.000Z";

function member(name: string, updatedAt: string): SharedMemberDoc {
  return { name, color: "#ff0000", email: null, updatedAt };
}

function expense(title: string, updatedAt: string): SharedExpenseDoc {
  return {
    title,
    notes: "",
    categoryId: "other",
    date: "2026-01-10",
    currency: "EUR",
    amountMinor: 1000,
    exchangeRate: 1,
    splitMethod: "equal",
    payers: [{ personId: "p1", amountMinor: 1000 }],
    splits: [{ personId: "p1", amountMinor: 1000 }],
    createdAt: T0,
    updatedAt,
  };
}

function baseDoc(overrides: Partial<SharedGroupDoc> = {}): SharedGroupDoc {
  return {
    v: 1,
    groupId: "g1",
    name: "Vacanza",
    emoji: "🏖️",
    description: "",
    currency: "EUR",
    updatedAt: T1,
    revision: 1,
    members: { p1: member("Anna", T1), p2: member("Beppe", T1) },
    expenses: { e1: expense("Hotel", T1), e2: expense("Cena", T1) },
    settlements: {},
    tombstones: {},
    ...overrides,
  };
}

describe("mergeDocs", () => {
  it("con locale null restituisce il remoto (con tombstone potate)", () => {
    const remote = baseDoc({ tombstones: { eX: "2020-01-01T00:00:00.000Z" } });
    const merged = mergeDocs(null, remote);
    // Identico al remoto, ma la tombstone più vecchia di 30 giorni viene potata.
    expect(merged).toEqual({ ...remote, tombstones: {} });
  });

  it("fa union per id su membri e spese", () => {
    const local = baseDoc({ expenses: { e1: expense("Hotel", T1) } });
    const remote = baseDoc({ expenses: { e2: expense("Cena", T1) } });
    const merged = mergeDocs(local, remote);
    expect(Object.keys(merged.expenses).sort()).toEqual(["e1", "e2"]);
    expect(Object.keys(merged.members).sort()).toEqual(["p1", "p2"]);
  });

  it("a parità di id vince updatedAt più recente (last-write-wins)", () => {
    const local = baseDoc({ members: { p1: member("Anna nuova", T2) } });
    const remote = baseDoc({ members: { p1: member("Anna vecchia", T1) } });
    const merged = mergeDocs(local, remote);
    expect(merged.members.p1.name).toBe("Anna nuova");

    const merged2 = mergeDocs(merged, baseDoc({ members: { p1: member("Anna remotissima", T2) } }));
    expect(merged2.members.p1.name).toBe("Anna remotissima");
  });

  it("a parità di updatedAt vince il remoto", () => {
    const local = baseDoc({ members: { p1: member("Anna locale", T1) } });
    const remote = baseDoc({ members: { p1: member("Anna remota", T1) } });
    expect(mergeDocs(local, remote).members.p1.name).toBe("Anna remota");
  });

  it("info gruppo dal doc con updatedAt più recente, revision = max + 1", () => {
    const local = baseDoc({ name: "Nome vecchio", updatedAt: T1, revision: 3 });
    const remote = baseDoc({ name: "Nome nuovo", updatedAt: T2, revision: 5 });
    const merged = mergeDocs(local, remote);
    expect(merged.name).toBe("Nome nuovo");
    expect(merged.updatedAt).toBe(T2);
    expect(merged.revision).toBe(6);
  });

  it("una tombstone cancella il record più vecchio, non quello ri-aggiunto dopo", () => {
    // Timestamp vicini a "ora", altrimenti la tombstone verrebbe potata (> 30 giorni).
    const ora = Date.now();
    const beforeAt = new Date(ora - 2 * 60 * 60 * 1000).toISOString();
    const deletedAt = new Date(ora - 1 * 60 * 60 * 1000).toISOString();
    const local = baseDoc({ expenses: { e1: expense("Hotel", beforeAt) } });
    const remote = baseDoc({ tombstones: { e1: deletedAt } });
    remote.expenses = {};
    const merged = mergeDocs(local, remote);
    // e1 è più vecchio della tombstone -> cancellato.
    expect(merged.expenses.e1).toBeUndefined();
    expect(merged.tombstones.e1).toBe(deletedAt);

    // Ri-aggiunta dopo l'eliminazione: il record sopravvive alla tombstone.
    const readdedAt = new Date(ora).toISOString();
    const other = baseDoc({ expenses: { e1: expense("Hotel di nuovo", readdedAt) } });
    const merged2 = mergeDocs(merged, other);
    expect(merged2.expenses.e1?.title).toBe("Hotel di nuovo");
  });

  it("pota le tombstone più vecchie di 30 giorni durante il merge", () => {
    const ora = new Date();
    const recente = new Date(ora.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const vecchia = new Date(ora.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const local = baseDoc({ tombstones: { eOld: vecchia } });
    const remote = baseDoc({ tombstones: { eNew: recente } });
    const merged = mergeDocs(local, remote);
    expect(merged.tombstones).toEqual({ eNew: recente });
  });
});

describe("tombstoneFor", () => {
  it("aggiunge tombstone e rimuove i record corrispondenti", () => {
    const doc = baseDoc();
    const out = tombstoneFor(doc, ["e1", "p2"], T2);
    expect(out.tombstones).toEqual({ e1: T2, p2: T2 });
    expect(out.expenses.e1).toBeUndefined();
    expect(out.expenses.e2).toBeDefined();
    expect(out.members.p2).toBeUndefined();
    expect(out.members.p1).toBeDefined();
    // Il documento originale non viene mutato.
    expect(doc.expenses.e1).toBeDefined();
    expect(doc.tombstones).toEqual({});
  });
});
