import { describe, expect, it } from "vitest";
import { removePersonFromExpenses } from "@/domain/removePerson";
import { monthLabel, monthLabelLong } from "@/domain/dates";
import type { Expense, Settlement, SplitMethod } from "@/domain/types";

const NOW = "2026-09-04T10:00:00.000Z";

function makeExpense(
  id: string,
  amountMinor: number,
  splitMethod: SplitMethod,
  payers: { personId: string; amountMinor: number }[],
  splits: Expense["splits"]
): Expense {
  return {
    id,
    groupId: "g1",
    title: `Spesa ${id}`,
    notes: "",
    categoryId: "other",
    date: "2024-01-01",
    currency: "EUR",
    amountMinor,
    exchangeRate: 1,
    splitMethod,
    payers,
    splits,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeSettlement(id: string, from: string, to: string): Settlement {
  return { id, groupId: "g1", fromPersonId: from, toPersonId: to, amountMinor: 1000, date: "2024-01-02", note: "", createdAt: NOW };
}

describe("removePersonFromExpenses", () => {
  it("splits: ridistribuzione proporzionale, metodo convertito a exact", () => {
    const e = makeExpense("e1", 10000, "exact", [{ personId: "A", amountMinor: 10000 }], [
      { personId: "A", amountMinor: 5000 },
      { personId: "B", amountMinor: 3000 },
      { personId: "C", amountMinor: 2000 },
    ]);
    const res = removePersonFromExpenses([e], [], "A", NOW);
    expect(res.removedExpenses).toBe(0);
    expect(res.updatedExpenses).toBe(1);
    const out = res.expenses[0];
    // 3000:2000 → 6000:4000
    expect(out.splits).toEqual([
      { personId: "B", amountMinor: 6000 },
      { personId: "C", amountMinor: 4000 },
    ]);
    expect(out.splitMethod).toBe("exact");
    // A era l'unico pagante: paga il primo partecipante rimasto (B).
    expect(out.payers).toEqual([{ personId: "B", amountMinor: 10000 }]);
    expect(out.updatedAt).toBe(NOW);
  });

  it("payers: ridistribuzione proporzionale sui paganti rimasti", () => {
    const e = makeExpense(
      "e1",
      10000,
      "equal",
      [
        { personId: "A", amountMinor: 7000 },
        { personId: "B", amountMinor: 2000 },
        { personId: "C", amountMinor: 1000 },
      ],
      [
        { personId: "B", amountMinor: 5000 },
        { personId: "C", amountMinor: 5000 },
      ]
    );
    const res = removePersonFromExpenses([e], [], "A", NOW);
    const out = res.expenses[0];
    // A non era nei splits: quote invariate e metodo preservato.
    expect(out.splits).toEqual(e.splits);
    expect(out.splitMethod).toBe("equal");
    // 2000:1000 → 6667:3333 (resto alla frazione maggiore)
    expect(out.payers).toEqual([
      { personId: "B", amountMinor: 6667 },
      { personId: "C", amountMinor: 3333 },
    ]);
  });

  it("somme esatte in centesimi anche con resti", () => {
    const e = makeExpense("e1", 10001, "equal", [{ personId: "B", amountMinor: 10001 }], [
      { personId: "A", amountMinor: 3334 },
      { personId: "B", amountMinor: 3334 },
      { personId: "C", amountMinor: 3333 },
    ]);
    const res = removePersonFromExpenses([e], [], "A", NOW);
    const out = res.expenses[0];
    expect(out.splits.reduce((a, s) => a + s.amountMinor, 0)).toBe(10001);
    expect(out.payers.reduce((a, p) => a + p.amountMinor, 0)).toBe(10001);
  });

  it("spesa eliminata se la persona era l'unico partecipante", () => {
    const e = makeExpense("e1", 5000, "equal", [{ personId: "A", amountMinor: 5000 }], [{ personId: "A", amountMinor: 5000 }]);
    const keep = makeExpense("e2", 2000, "equal", [{ personId: "B", amountMinor: 2000 }], [{ personId: "B", amountMinor: 2000 }]);
    const res = removePersonFromExpenses([e, keep], [], "A", NOW);
    expect(res.removedExpenses).toBe(1);
    expect(res.updatedExpenses).toBe(0);
    expect(res.expenses).toEqual([keep]);
    expect(res.expenses[0]).toBe(keep); // mai toccata: stessa istanza
  });

  it("metodo percentage: percent/shares spariscono dopo il ricalcolo", () => {
    const e = makeExpense("e1", 8000, "percentage", [{ personId: "B", amountMinor: 8000 }], [
      { personId: "A", amountMinor: 4000, percent: 50 },
      { personId: "B", amountMinor: 4000, percent: 50 },
    ]);
    const res = removePersonFromExpenses([e], [], "A", NOW);
    const out = res.expenses[0];
    expect(out.splitMethod).toBe("exact");
    expect(out.splits).toEqual([{ personId: "B", amountMinor: 8000 }]);
    expect(out.splits[0].percent).toBeUndefined();
  });

  it("settlements che coinvolgono la persona vengono rimossi", () => {
    const settlements = [makeSettlement("s1", "A", "B"), makeSettlement("s2", "B", "C"), makeSettlement("s3", "C", "A")];
    const res = removePersonFromExpenses([], settlements, "A", NOW);
    expect(res.settlements).toEqual([settlements[1]]);
    expect(res.removedSettlements).toBe(2);
  });

  it("spese senza la persona restano identiche (stessa istanza)", () => {
    const e = makeExpense("e1", 1000, "equal", [{ personId: "B", amountMinor: 1000 }], [{ personId: "B", amountMinor: 1000 }]);
    const res = removePersonFromExpenses([e], [], "A", NOW);
    expect(res.expenses[0]).toBe(e);
    expect(res.updatedExpenses).toBe(0);
  });
});

describe("regressione: etichette mese con date malformate", () => {
  it("monthLabel/monthLabelLong non lanciano su chiavi invalide", () => {
    expect(() => monthLabel("")).not.toThrow();
    expect(() => monthLabelLong("")).not.toThrow();
    expect(monthLabelLong("")).toBe("—");
    expect(monthLabel("nanana")).toBe("nanana");
    expect(monthLabelLong("2024-03")).toBe("Marzo 2024");
  });
});
