/**
 * Test store per deletePerson: eliminazione sempre possibile con ripartizione
 * sui rimanenti. Stessi mock di importStore.test.ts (persistence/attachments/expo-crypto).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeBalances } from "@/domain/balances";

vi.mock("@/store/persistence", async () => {
  const dd = await vi.importActual<typeof import("@/store/dataDefaults")>("@/store/dataDefaults");
  return {
    emptyData: dd.emptyData,
    migrate: dd.migrate,
    loadData: async () => dd.emptyData(),
    saveData: async () => {},
  };
});
vi.mock("@/store/attachments", () => ({ deleteExpenseAttachmentFiles: async () => {} }));
let seq = 0;
vi.mock("expo-crypto", () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}` }));

import { useStore } from "@/store/store";

beforeEach(() => {
  useStore.getState().resetAll();
});

describe("deletePerson con ripartizione", () => {
  it("caso completo: ripartizione, rimozioni e riepilogo conteggi", () => {
    const s = useStore.getState();
    const anna = s.addPerson({ name: "Anna", email: null });
    const bruno = useStore.getState().addPerson({ name: "Bruno", email: null });
    const carla = useStore.getState().addPerson({ name: "Carla", email: null });
    const group = useStore.getState().addGroup({ name: "G", emoji: "", description: "", currency: "EUR", memberIds: [anna.id, bruno.id, carla.id] });

    // e1: Anna unica pagante, divisa fra tutti e tre (equal).
    useStore.getState().addExpense({
      groupId: group.id,
      title: "Cena",
      notes: "",
      categoryId: "food",
      date: "2024-01-01",
      currency: "EUR",
      amountMinor: 9000,
      exchangeRate: 1,
      splitMethod: "equal",
      payers: [{ personId: anna.id, amountMinor: 9000 }],
      splits: [
        { personId: anna.id, amountMinor: 3000 },
        { personId: bruno.id, amountMinor: 3000 },
        { personId: carla.id, amountMinor: 3000 },
      ],
    });
    // e2: solo Anna coinvolta → spesa eliminata.
    useStore.getState().addExpense({
      groupId: group.id,
      title: "Solo Anna",
      notes: "",
      categoryId: "other",
      date: "2024-01-02",
      currency: "EUR",
      amountMinor: 1000,
      exchangeRate: 1,
      splitMethod: "equal",
      payers: [{ personId: anna.id, amountMinor: 1000 }],
      splits: [{ personId: anna.id, amountMinor: 1000 }],
    });
    // e3: Anna non coinvolta → intatta.
    useStore.getState().addExpense({
      groupId: group.id,
      title: "Bruno e Carla",
      notes: "",
      categoryId: "other",
      date: "2024-01-03",
      currency: "EUR",
      amountMinor: 2000,
      exchangeRate: 1,
      splitMethod: "equal",
      payers: [{ personId: bruno.id, amountMinor: 2000 }],
      splits: [
        { personId: bruno.id, amountMinor: 1000 },
        { personId: carla.id, amountMinor: 1000 },
      ],
    });
    useStore.getState().addSettlement({ groupId: group.id, fromPersonId: bruno.id, toPersonId: anna.id, amountMinor: 1500, date: "2024-01-04", note: "" });

    const res = useStore.getState().deletePerson(anna.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.updatedExpenses).toBe(1); // e1 ripartita
    expect(res.removedExpenses).toBe(1); // e2 eliminata
    expect(res.removedSettlements).toBe(1);

    const data = useStore.getState().data;
    expect(data.people.some((p) => p.id === anna.id)).toBe(false);
    expect(data.groups.find((g) => g.id === group.id)!.memberIds).toEqual([bruno.id, carla.id]);
    expect(data.settlements).toHaveLength(0);

    const e1 = data.expenses.find((e) => e.title === "Cena")!;
    expect(e1.splitMethod).toBe("exact");
    expect(e1.splits).toEqual([
      { personId: bruno.id, amountMinor: 4500 },
      { personId: carla.id, amountMinor: 4500 },
    ]);
    expect(e1.payers).toEqual([{ personId: bruno.id, amountMinor: 9000 }]);
    // Saldi coerenti: somma dei netti zero.
    const balances = computeBalances({ id: group.id, currency: "EUR", memberIds: [bruno.id, carla.id] }, data.expenses, data.settlements);
    expect(balances.reduce((a, b) => a + b.netMinor, 0)).toBe(0);
  });

  it("self bloccato, persona inesistente bloccata", () => {
    const self = useStore.getState().data.people.find((p) => p.isSelf)!;
    const resSelf = useStore.getState().deletePerson(self.id);
    expect(resSelf.ok).toBe(false);
    if (!resSelf.ok) expect(resSelf.reason).toContain("te stesso");
    const resGhost = useStore.getState().deletePerson("non-esiste");
    expect(resGhost.ok).toBe(false);
  });
});
