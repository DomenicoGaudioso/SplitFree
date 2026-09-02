import { describe, expect, it } from "vitest";
import { computeBalances, computePairwiseDebts } from "@/domain/balances";
import { simplifyDebts, transfersSettle } from "@/domain/simplify";
import type { Expense, PersonBalance, Settlement } from "@/domain/types";

const group = { id: "g", currency: "EUR", memberIds: ["a", "b", "c"] };

function expense(partial: Partial<Expense> & Pick<Expense, "amountMinor" | "payers" | "splits">): Expense {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    groupId: "g",
    title: "t",
    notes: "",
    categoryId: "other",
    date: "2026-01-01",
    currency: "EUR",
    exchangeRate: 1,
    splitMethod: "exact",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("computeBalances", () => {
  it("un pagatore, divisione uguale", () => {
    const e = expense({
      amountMinor: 3000,
      payers: [{ personId: "a", amountMinor: 3000 }],
      splits: [
        { personId: "a", amountMinor: 1000 },
        { personId: "b", amountMinor: 1000 },
        { personId: "c", amountMinor: 1000 },
      ],
    });
    const b = computeBalances(group, [e], []);
    const net = Object.fromEntries(b.map((x) => [x.personId, x.netMinor]));
    expect(net).toEqual({ a: 2000, b: -1000, c: -1000 });
    expect(b.reduce((s, x) => s + x.netMinor, 0)).toBe(0);
  });

  it("rimborso riduce il debito", () => {
    const e = expense({
      amountMinor: 2000,
      payers: [{ personId: "a", amountMinor: 2000 }],
      splits: [
        { personId: "a", amountMinor: 1000 },
        { personId: "b", amountMinor: 1000 },
      ],
    });
    const s: Settlement = {
      id: "s1",
      groupId: "g",
      fromPersonId: "b",
      toPersonId: "a",
      amountMinor: 600,
      date: "2026-01-02",
      note: "",
      createdAt: "",
    };
    const b = computeBalances(group, [e], [s]);
    const net = Object.fromEntries(b.map((x) => [x.personId, x.netMinor]));
    expect(net).toEqual({ a: 400, b: -400, c: 0 });
  });

  it("spesa in valuta estera convertita nella valuta del gruppo", () => {
    const e = expense({
      currency: "USD",
      exchangeRate: 0.9,
      amountMinor: 10000, // 100 USD -> 90 EUR
      payers: [{ personId: "a", amountMinor: 10000 }],
      splits: [
        { personId: "a", amountMinor: 3333 },
        { personId: "b", amountMinor: 3333 },
        { personId: "c", amountMinor: 3334 },
      ],
    });
    const b = computeBalances(group, [e], []);
    const paidA = b.find((x) => x.personId === "a")!;
    expect(paidA.paidMinor).toBe(9000);
    const owedSum = b.reduce((s, x) => s + x.owedMinor, 0);
    expect(owedSum).toBe(9000);
    expect(b.reduce((s, x) => s + x.netMinor, 0)).toBe(0);
  });

  it("più pagatori", () => {
    const e = expense({
      amountMinor: 3000,
      payers: [
        { personId: "a", amountMinor: 2000 },
        { personId: "b", amountMinor: 1000 },
      ],
      splits: [
        { personId: "a", amountMinor: 1000 },
        { personId: "b", amountMinor: 1000 },
        { personId: "c", amountMinor: 1000 },
      ],
    });
    const b = computeBalances(group, [e], []);
    const net = Object.fromEntries(b.map((x) => [x.personId, x.netMinor]));
    expect(net).toEqual({ a: 1000, b: 0, c: -1000 });
  });
});

describe("computePairwiseDebts", () => {
  it("attribuisce le quote ai pagatori in proporzione", () => {
    const e = expense({
      amountMinor: 3000,
      payers: [
        { personId: "a", amountMinor: 2000 },
        { personId: "b", amountMinor: 1000 },
      ],
      splits: [
        { personId: "a", amountMinor: 1000 },
        { personId: "b", amountMinor: 1000 },
        { personId: "c", amountMinor: 1000 },
      ],
    });
    const debts = computePairwiseDebts(group, [e], []);
    // c deve 667 ad a e 333 a b; a e b si compensano parzialmente (a deve 333 a b, b deve 667 ad a -> b deve 334 ad a).
    const key = (t: { fromPersonId: string; toPersonId: string }) => `${t.fromPersonId}>${t.toPersonId}`;
    const map = Object.fromEntries(debts.map((t) => [key(t), t.amountMinor]));
    expect(map["c>a"]).toBe(667);
    expect(map["c>b"]).toBe(333);
    expect(map["b>a"]).toBe(334);
  });
});

function bal(nets: Record<string, number>): PersonBalance[] {
  return Object.entries(nets).map(([personId, netMinor]) => ({
    personId,
    paidMinor: 0,
    owedMinor: 0,
    sentMinor: 0,
    receivedMinor: 0,
    netMinor,
  }));
}

describe("simplifyDebts", () => {
  it("catena a->b->c si riduce a una transazione", () => {
    const b = bal({ a: -1000, b: 0, c: 1000 });
    const t = simplifyDebts(b);
    expect(t).toEqual([{ fromPersonId: "a", toPersonId: "c", amountMinor: 1000 }]);
  });

  it("usa al massimo n-1 transazioni e azzera i bilanci", () => {
    const b = bal({ a: -500, b: -300, c: 200, d: 600 });
    const t = simplifyDebts(b);
    expect(t.length).toBeLessThanOrEqual(3);
    expect(transfersSettle(b, t)).toBe(true);
  });

  it("accoppia coppie esatte per scendere sotto n-1", () => {
    const b = bal({ a: -100, b: 100, c: -250, d: 250 });
    const t = simplifyDebts(b);
    expect(t.length).toBe(2);
    expect(transfersSettle(b, t)).toBe(true);
  });

  it("riconosce terne a somma zero", () => {
    // {a,b,c} somma zero e {d,e} somma zero: 3 transazioni invece di 4.
    const b = bal({ a: -300, b: 100, c: 200, d: -700, e: 700 });
    const t = simplifyDebts(b);
    expect(t.length).toBe(3);
    expect(transfersSettle(b, t)).toBe(true);
  });

  it("nessun debito -> nessuna transazione", () => {
    expect(simplifyDebts(bal({ a: 0, b: 0 }))).toEqual([]);
  });

  it("fuzz: azzera sempre i bilanci con <= n-1 transazioni", () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let t = 0; t < 500; t++) {
      const n = 2 + Math.floor(rnd() * 9);
      const nets: Record<string, number> = {};
      let sum = 0;
      for (let i = 0; i < n - 1; i++) {
        const v = Math.floor(rnd() * 20000) - 10000;
        nets[`p${i}`] = v;
        sum += v;
      }
      nets[`p${n - 1}`] = -sum;
      const b = bal(nets);
      const tr = simplifyDebts(b);
      const nonZero = b.filter((x) => x.netMinor !== 0).length;
      expect(tr.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      expect(transfersSettle(b, tr)).toBe(true);
      expect(tr.every((x) => x.amountMinor > 0)).toBe(true);
    }
  });
});
