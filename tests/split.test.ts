import { describe, expect, it } from "vitest";
import { allocateByWeights, computeSplits, validatePayments } from "@/domain/split";

const ids = ["a", "b", "c"];

describe("allocateByWeights", () => {
  it("distribuisce i resti con il massimo resto e somma esatta", () => {
    expect(allocateByWeights(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocateByWeights(1001, [1, 1, 1])).toEqual([334, 334, 333]);
    expect(allocateByWeights(100, [1, 1, 1, 1, 1, 1, 1])).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it("gestisce pesi zero e totale zero", () => {
    expect(allocateByWeights(500, [0, 1, 0])).toEqual([0, 500, 0]);
    expect(allocateByWeights(0, [1, 2])).toEqual([0, 0]);
    expect(allocateByWeights(5, [0, 0])).toEqual([0, 0]);
  });

  it("la somma coincide sempre con il totale (fuzz)", () => {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let t = 0; t < 2000; t++) {
      const n = 1 + Math.floor(rnd() * 8);
      const weights = Array.from({ length: n }, () => Math.floor(rnd() * 10));
      if (weights.reduce((a, b) => a + b, 0) === 0) weights[0] = 1;
      const total = Math.floor(rnd() * 100000);
      const parts = allocateByWeights(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => p >= 0)).toBe(true);
      // Nessuna parte si discosta di più di 1 dalla quota ideale.
      const tw = weights.reduce((a, b) => a + b, 0);
      parts.forEach((p, i) => {
        expect(Math.abs(p - (total * weights[i]) / tw)).toBeLessThan(1 + 1e-9);
      });
    }
  });
});

describe("computeSplits", () => {
  it("parti uguali", () => {
    const r = computeSplits(1000, "equal", ids.map((personId) => ({ personId })));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.splits.map((s) => s.amountMinor)).toEqual([334, 333, 333]);
      expect(r.splits.reduce((a, s) => a + s.amountMinor, 0)).toBe(1000);
    }
  });

  it("percentuali", () => {
    const r = computeSplits(2000, "percentage", [
      { personId: "a", value: 50 },
      { personId: "b", value: 30 },
      { personId: "c", value: 20 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.splits.map((s) => s.amountMinor)).toEqual([1000, 600, 400]);
  });

  it("percentuali che non sommano a 100 -> errore", () => {
    const r = computeSplits(2000, "percentage", [
      { personId: "a", value: 50 },
      { personId: "b", value: 40 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("percentuali con decimali e resti", () => {
    const r = computeSplits(1000, "percentage", [
      { personId: "a", value: 33.33 },
      { personId: "b", value: 33.33 },
      { personId: "c", value: 33.34 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.splits.reduce((a, s) => a + s.amountMinor, 0)).toBe(1000);
      expect(r.splits.map((s) => s.amountMinor)).toEqual([333, 333, 334]);
    }
  });

  it("quote", () => {
    const r = computeSplits(3000, "shares", [
      { personId: "a", value: 2 },
      { personId: "b", value: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.splits.map((s) => s.amountMinor)).toEqual([2000, 1000]);
  });

  it("quote tutte zero -> errore", () => {
    const r = computeSplits(3000, "shares", [
      { personId: "a", value: 0 },
      { personId: "b", value: 0 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("importi esatti", () => {
    const ok = computeSplits(1500, "exact", [
      { personId: "a", value: 1000 },
      { personId: "b", value: 500 },
    ]);
    expect(ok.ok).toBe(true);
    const ko = computeSplits(1500, "exact", [
      { personId: "a", value: 1000 },
      { personId: "b", value: 400 },
    ]);
    expect(ko.ok).toBe(false);
  });

  it("rifiuta partecipanti vuoti o duplicati", () => {
    expect(computeSplits(100, "equal", []).ok).toBe(false);
    expect(
      computeSplits(100, "equal", [{ personId: "a" }, { personId: "a" }]).ok
    ).toBe(false);
  });
});

describe("validatePayments", () => {
  it("accetta pagamenti che coprono il totale", () => {
    expect(validatePayments(1000, [{ personId: "a", amountMinor: 600 }, { personId: "b", amountMinor: 400 }])).toBeNull();
  });
  it("rifiuta somme diverse", () => {
    expect(validatePayments(1000, [{ personId: "a", amountMinor: 600 }])).not.toBeNull();
    expect(validatePayments(1000, [])).not.toBeNull();
  });
});
