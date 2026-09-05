import { describe, expect, it } from "vitest";
import { buildDoc, docToSlices } from "@/cloud/fileShare/doc";
import { validateSharedGroupDoc } from "@/cloud/fileShare/types";
import type { Expense, Group, Person, Settlement } from "@/domain/types";

// Fixture sintetiche: un gruppo con 3 persone, 2 spese e 1 rimborso,
// più una spesa e una persona di un altro gruppo (da escludere).

const group: Group = {
  id: "g1",
  name: "Vacanza",
  emoji: "🏖️",
  description: "Viaggio al mare",
  currency: "EUR",
  memberIds: ["p1", "p2", "p3"],
  archivedAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-02-01T10:00:00.000Z",
};

const people: Person[] = [
  {
    id: "p1",
    name: "Anna",
    email: "anna@esempio.it",
    color: "#ff0000",
    isSelf: true,
    archivedAt: null,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-02T10:00:00.000Z",
  },
  {
    id: "p2",
    name: "Beppe",
    email: null,
    color: "#00ff00",
    isSelf: false,
    archivedAt: null,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-03T10:00:00.000Z",
  },
  {
    id: "p3",
    name: "Carla",
    email: "carla@esempio.it",
    color: "#0000ff",
    isSelf: false,
    archivedAt: null,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-04T10:00:00.000Z",
  },
  {
    id: "px",
    name: "Xeno",
    email: null,
    color: "#ffffff",
    isSelf: false,
    archivedAt: null,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
  },
];

const expenses: Expense[] = [
  {
    id: "e1",
    groupId: "g1",
    title: "Hotel",
    notes: "",
    categoryId: "lodging",
    date: "2026-01-10",
    currency: "EUR",
    amountMinor: 30000,
    exchangeRate: 1,
    splitMethod: "equal",
    payers: [{ personId: "p1", amountMinor: 30000 }],
    splits: [
      { personId: "p1", amountMinor: 10000 },
      { personId: "p2", amountMinor: 10000 },
      { personId: "p3", amountMinor: 10000 },
    ],
    createdAt: "2026-01-10T20:00:00.000Z",
    updatedAt: "2026-01-10T20:00:00.000Z",
  },
  {
    id: "e2",
    groupId: "g1",
    title: "Cena",
    notes: "pesce",
    categoryId: "food",
    date: "2026-01-11",
    currency: "EUR",
    amountMinor: 9000,
    exchangeRate: 1,
    splitMethod: "equal",
    payers: [{ personId: "p2", amountMinor: 9000 }],
    splits: [
      { personId: "p1", amountMinor: 3000 },
      { personId: "p2", amountMinor: 3000 },
      { personId: "p3", amountMinor: 3000 },
    ],
    createdAt: "2026-01-11T21:00:00.000Z",
    updatedAt: "2026-01-11T21:00:00.000Z",
  },
  {
    id: "e9",
    groupId: "g2",
    title: "Altro gruppo",
    notes: "",
    categoryId: "other",
    date: "2026-01-12",
    currency: "EUR",
    amountMinor: 100,
    exchangeRate: 1,
    splitMethod: "equal",
    payers: [{ personId: "px", amountMinor: 100 }],
    splits: [{ personId: "px", amountMinor: 100 }],
    createdAt: "2026-01-12T10:00:00.000Z",
    updatedAt: "2026-01-12T10:00:00.000Z",
  },
];

const settlements: Settlement[] = [
  {
    id: "s1",
    groupId: "g1",
    fromPersonId: "p3",
    toPersonId: "p1",
    amountMinor: 5000,
    date: "2026-01-15",
    note: "acconto",
    createdAt: "2026-01-15T09:00:00.000Z",
  },
  {
    id: "s9",
    groupId: "g2",
    fromPersonId: "px",
    toPersonId: "px",
    amountMinor: 1,
    date: "2026-01-16",
    note: "",
    createdAt: "2026-01-16T09:00:00.000Z",
  },
];

describe("buildDoc", () => {
  it("filtra spese, rimborsi e persone del gruppo", () => {
    const doc = buildDoc(group, people, expenses, settlements);
    expect(doc.v).toBe(1);
    expect(doc.groupId).toBe("g1");
    expect(doc.name).toBe("Vacanza");
    expect(doc.revision).toBe(1);
    expect(Object.keys(doc.members).sort()).toEqual(["p1", "p2", "p3"]);
    expect(Object.keys(doc.expenses).sort()).toEqual(["e1", "e2"]);
    expect(Object.keys(doc.settlements)).toEqual(["s1"]);
    // I record condivisi non portano id né groupId.
    expect(doc.expenses.e1).not.toHaveProperty("id");
    expect(doc.expenses.e1).not.toHaveProperty("groupId");
    expect(doc.expenses.e1.title).toBe("Hotel");
    expect(doc.members.p1).toEqual({
      name: "Anna",
      color: "#ff0000",
      email: "anna@esempio.it",
      updatedAt: "2026-01-02T10:00:00.000Z",
    });
  });

  it("con prev incrementa la revision e preserva le tombstone (potate oltre 30 giorni)", () => {
    const prev = buildDoc(group, people, expenses, settlements);
    const ora = new Date();
    const recente = new Date(ora.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const vecchia = new Date(ora.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    prev.tombstones = { eOld: vecchia, eRecent: recente };
    const doc = buildDoc(group, people, expenses, settlements, prev);
    expect(doc.revision).toBe(2);
    expect(doc.tombstones).toEqual({ eRecent: recente });
  });

  it("round-trip build -> slices ricostruisce i record locali", () => {
    const doc = buildDoc(group, people, expenses, settlements);
    const slices = docToSlices(doc);
    expect(slices.people).toHaveLength(3);
    expect(slices.expenses.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(slices.settlements.map((s) => s.id)).toEqual(["s1"]);
    const anna = slices.people.find((p) => p.id === "p1");
    expect(anna).toMatchObject({
      name: "Anna",
      color: "#ff0000",
      email: "anna@esempio.it",
      isSelf: false,
      archivedAt: null,
      createdAt: "2026-01-02T10:00:00.000Z",
      updatedAt: "2026-01-02T10:00:00.000Z",
    });
    const hotel = slices.expenses.find((e) => e.id === "e1");
    expect(hotel?.groupId).toBe("g1");
    expect(hotel?.amountMinor).toBe(30000);
    expect(slices.settlements[0].groupId).toBe("g1");
  });
});

describe("validateSharedGroupDoc", () => {
  it("accetta il documento prodotto da buildDoc", () => {
    const doc = buildDoc(group, people, expenses, settlements);
    expect(validateSharedGroupDoc(doc)).toEqual(doc);
    expect(validateSharedGroupDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it("rifiuta input malformati senza lanciare eccezioni", () => {
    expect(validateSharedGroupDoc(null)).toBeNull();
    expect(validateSharedGroupDoc(undefined)).toBeNull();
    expect(validateSharedGroupDoc("ciao")).toBeNull();
    expect(validateSharedGroupDoc(42)).toBeNull();
    expect(validateSharedGroupDoc([])).toBeNull();
    const doc = buildDoc(group, people, expenses, settlements);
    expect(validateSharedGroupDoc({ ...doc, v: 2 })).toBeNull();
    expect(validateSharedGroupDoc({ ...doc, name: 5 })).toBeNull();
    expect(validateSharedGroupDoc({ ...doc, revision: "1" })).toBeNull();
    expect(validateSharedGroupDoc({ ...doc, members: null })).toBeNull();
    expect(validateSharedGroupDoc({ ...doc, members: { p1: { name: 1 } } })).toBeNull();
    expect(validateSharedGroupDoc({ ...doc, tombstones: { e1: 123 } })).toBeNull();
    const senza = { ...doc } as Record<string, unknown>;
    delete senza.currency;
    expect(validateSharedGroupDoc(senza)).toBeNull();
  });
});
