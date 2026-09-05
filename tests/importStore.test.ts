/**
 * Test dello store per l'import Splitwise e l'eliminazione massiva.
 * I moduli nativi (persistenza file, allegati, expo-crypto) sono mockati.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeBalances } from "@/domain/balances";
import { parseSplitwiseCsv } from "@/domain/splitwiseImport";

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

const CSV_USD = [
  "Data,Descrizione,Categorie,Costo,Valuta,Domenico Gaudioso,Cinzia",
  "",
  "2024-01-01,Spese condominiali 1 rata,Generali,481.44,USD,-240.72,240.72",
  "2024-01-02,Bus,Autobus/treno,36.00,USD,-36.00,36.00",
  "2025-06-01,Spesa coop,Alimentari,100.00,USD,-50.00,50.00",
].join("\n");

function parseRows() {
  const res = parseSplitwiseCsv(CSV_USD);
  if (!res.ok) throw new Error(res.error);
  return res.rows;
}

function freshGroupEur() {
  const s = useStore.getState();
  const group = s.addGroup({ name: "Casa", emoji: "🏠", description: "", currency: "EUR", memberIds: [] });
  return group;
}

beforeEach(() => {
  useStore.getState().resetAll();
});

describe("importSplitwiseRows con opzioni", () => {
  it("convert: spesa manuale EUR + import USD convertito → saldi corretti", () => {
    const s = useStore.getState();
    const group = freshGroupEur();
    // Spesa manuale in EUR: Domenico paga 100 €, split equo.
    const dome = s.addPerson({ name: "Domenico Gaudioso", email: null });
    const cinzia = s.addPerson({ name: "Cinzia", email: null });
    useStore.getState().updateGroup(group.id, { memberIds: [dome.id, cinzia.id] });
    useStore.getState().addExpense({
      groupId: group.id,
      title: "Spesa manuale",
      notes: "",
      categoryId: "other",
      date: "2025-05-10",
      currency: "EUR",
      amountMinor: 10000,
      exchangeRate: 1,
      splitMethod: "equal",
      payers: [{ personId: dome.id, amountMinor: 10000 }],
      splits: [
        { personId: dome.id, amountMinor: 5000 },
        { personId: cinzia.id, amountMinor: 5000 },
      ],
    });
    // Import USD convertito: 1 EUR = 2 USD → 481.44 USD = 240.72 EUR ecc.
    const result = useStore.getState().importSplitwiseRows(group.id, parseRows(), { currencyMode: "convert", rates: { USD: 2 } });
    if (!result.ok) throw new Error(result.error);
    expect(result.added).toBe(3);
    expect(result.peopleCreated).toBe(0); // nomi già esistenti

    const data = useStore.getState().data;
    const expenses = data.expenses.filter((e) => e.groupId === group.id);
    expect(expenses.every((e) => e.currency === "EUR" && e.exchangeRate === 1)).toBe(true);
    // Somme coerenti per ogni spesa importata.
    for (const e of expenses) {
      expect(e.payers.reduce((a, p) => a + p.amountMinor, 0)).toBe(e.amountMinor);
      expect(e.splits.reduce((a, x) => a + x.amountMinor, 0)).toBe(e.amountMinor);
    }
    // Saldi in EUR: Cinzia ha pagato 240.72 + 36/2*... calcolo esplicito:
    // condominiali: Cinzia paga 24072, quote 12036/12036
    // bus: Cinzia paga 1800, quota Domenico 1800
    // coop: Cinzia paga 5000, quote 2500/2500
    // manuale: Domenico paga 10000, quote 5000/5000
    const balances = computeBalances({ id: group.id, currency: "EUR", memberIds: [dome.id, cinzia.id] }, expenses, []);
    const bDome = balances.find((b) => b.personId === dome.id)!;
    const bCinzia = balances.find((b) => b.personId === cinzia.id)!;
    expect(bDome.paidMinor).toBe(10000);
    expect(bDome.owedMinor).toBe(12036 + 1800 + 2500 + 5000);
    expect(bCinzia.paidMinor).toBe(24072 + 1800 + 5000);
    expect(bCinzia.owedMinor).toBe(12036 + 2500 + 5000);
    expect(bCinzia.netMinor).toBe(-bDome.netMinor);
    expect(bCinzia.netMinor).toBe(24072 + 1800 + 5000 - (12036 + 2500 + 5000));
  });

  it("relabel: importi identici, valuta del gruppo", () => {
    const group = freshGroupEur();
    const result = useStore.getState().importSplitwiseRows(group.id, parseRows(), { currencyMode: "relabel" });
    if (!result.ok) throw new Error(result.error);
    const data = useStore.getState().data;
    const bus = data.expenses.find((e) => e.title === "Bus")!;
    expect(bus.currency).toBe("EUR");
    expect(bus.amountMinor).toBe(3600);
  });

  it("keep (default): mantiene la valuta del CSV", () => {
    const group = freshGroupEur();
    const result = useStore.getState().importSplitwiseRows(group.id, parseRows());
    if (!result.ok) throw new Error(result.error);
    const data = useStore.getState().data;
    expect(data.expenses.every((e) => e.currency === "USD")).toBe(true);
  });

  it("fromDate: importa solo le righe dalla data in poi", () => {
    const group = freshGroupEur();
    const result = useStore.getState().importSplitwiseRows(group.id, parseRows(), { fromDate: "2025-01-01", currencyMode: "keep" });
    if (!result.ok) throw new Error(result.error);
    expect(result.added).toBe(1);
    expect(result.skippedByDate).toBe(2);
    const data = useStore.getState().data;
    expect(data.expenses.map((e) => e.title)).toEqual(["Spesa coop"]);
  });

  it("convert senza tasso: errore e nessuna scrittura", () => {
    const group = freshGroupEur();
    const before = useStore.getState().data;
    const result = useStore.getState().importSplitwiseRows(group.id, parseRows(), { currencyMode: "convert", rates: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("USD");
    const after = useStore.getState().data;
    expect(after.expenses.length).toBe(before.expenses.length);
    expect(after.people.length).toBe(before.people.length);
  });

  it("gruppo inesistente: errore", () => {
    const result = useStore.getState().importSplitwiseRows("nope", parseRows());
    expect(result.ok).toBe(false);
  });
});

describe("deleteExpensesBefore", () => {
  it("elimina solo le spese del gruppo precedenti alla data; i rimborsi restano", async () => {
    const s = useStore.getState();
    const group = freshGroupEur();
    const other = s.addGroup({ name: "Altro", emoji: "", description: "", currency: "EUR", memberIds: [] });
    const result = useStore.getState().importSplitwiseRows(group.id, parseRows());
    if (!result.ok) throw new Error(result.error);
    const dome = useStore.getState().data.people.find((p) => p.name === "Domenico Gaudioso")!;
    const cinzia = useStore.getState().data.people.find((p) => p.name === "Cinzia")!;
    // Un rimborso e una spesa in un altro gruppo: non devono essere toccati.
    useStore.getState().addSettlement({ groupId: group.id, fromPersonId: dome.id, toPersonId: cinzia.id, amountMinor: 1000, date: "2024-01-15", note: "" });
    useStore.getState().addExpense({
      groupId: other.id,
      title: "Vecchia altrove",
      notes: "",
      categoryId: "other",
      date: "2020-01-01",
      currency: "EUR",
      amountMinor: 100,
      exchangeRate: 1,
      splitMethod: "equal",
      payers: [{ personId: dome.id, amountMinor: 100 }],
      splits: [{ personId: dome.id, amountMinor: 100 }],
    });

    const deleted = await useStore.getState().deleteExpensesBefore(group.id, "2025-01-01");
    expect(deleted).toBe(2); // 2024-01-01 e 2024-01-02
    const data = useStore.getState().data;
    expect(data.expenses.filter((e) => e.groupId === group.id).map((e) => e.title)).toEqual(["Spesa coop"]);
    expect(data.expenses.some((e) => e.groupId === other.id)).toBe(true);
    expect(data.settlements).toHaveLength(1);
  });

  it("nessuna spesa prima della data → 0", async () => {
    const group = freshGroupEur();
    useStore.getState().importSplitwiseRows(group.id, parseRows());
    const deleted = await useStore.getState().deleteExpensesBefore(group.id, "2020-01-01");
    expect(deleted).toBe(0);
  });
});
