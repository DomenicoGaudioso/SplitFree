import { describe, expect, it } from "vitest";
import { convertMinor, formatMinor, parseAmount, toMinor } from "@/domain/money";
import { guessFromTitle, iconForExpense } from "@/domain/categories";
import { computeStats } from "@/domain/stats";
import { isValidIsoDate, italianToIso, lastMonths } from "@/domain/dates";
import type { Expense, Group } from "@/domain/types";

describe("parseAmount", () => {
  it("accetta virgola e punto", () => {
    expect(parseAmount("12,50")).toBe(1250);
    expect(parseAmount("12.50")).toBe(1250);
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("€ 12")).toBe(1200);
    expect(parseAmount("12")).toBe(1200);
    expect(parseAmount("0,1")).toBe(10);
  });
  it("valute a zero decimali", () => {
    expect(parseAmount("1500", "JPY")).toBe(1500);
    expect(toMinor(12.4, "JPY")).toBe(12);
  });
  it("rifiuta input non numerici", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(",")).toBeNull();
  });
});

describe("formatMinor", () => {
  it("formatta in italiano", () => {
    const s = formatMinor(1234567, "EUR");
    expect(s).toContain("12.345,67");
    expect(formatMinor(-500, "EUR")).toMatch(/^-/);
    expect(formatMinor(500, "EUR", { signed: true })).toMatch(/^\+/);
  });
});

describe("convertMinor", () => {
  it("applica il tasso con arrotondamento", () => {
    expect(convertMinor(10000, 0.9, "USD", "EUR")).toBe(9000);
    expect(convertMinor(1000, 1, "EUR", "EUR")).toBe(1000);
    expect(convertMinor(100, 160, "EUR", "JPY")).toBe(160);
  });
});

describe("guessFromTitle", () => {
  it("riconosce parole chiave italiane", () => {
    expect(guessFromTitle("Pizza da Gino").icon).toBe("pizza");
    expect(guessFromTitle("Cena al ristorante").icon).toBe("restaurant");
    expect(guessFromTitle("Benzina viaggio").icon).toBe("car");
    expect(guessFromTitle("Biglietti treno Roma").icon).toBe("train");
    expect(guessFromTitle("Hotel Bologna 2 notti").categoryId).toBe("lodging");
    expect(guessFromTitle("Spesa Conad").categoryId).toBe("groceries");
    expect(guessFromTitle("Netflix").icon).toBe("tv");
    expect(guessFromTitle("Regalo di compleanno").icon).toBe("gift");
    expect(guessFromTitle("Farmacia").categoryId).toBe("health");
  });
  it("ignora accenti e maiuscole", () => {
    expect(guessFromTitle("CAFFÈ al bar").icon).toBe("cafe");
  });
  it("ricade sulla categoria scelta", () => {
    const g = guessFromTitle("xyz", "sport");
    expect(g.matched).toBeNull();
    expect(g.categoryId).toBe("sport");
    expect(iconForExpense("xyz", "sport")).toBe("fitness");
  });
});

describe("dates", () => {
  it("valida e converte", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(italianToIso("12/03/2026")).toBe("2026-03-12");
    expect(italianToIso("1/3/26")).toBe("2026-03-01");
    expect(italianToIso("31/02/2026")).toBeNull();
    expect(lastMonths(3, new Date(2026, 0, 15))).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("computeStats", () => {
  const groups: Group[] = [
    { id: "g1", name: "A", emoji: "", description: "", currency: "EUR", memberIds: ["me", "x"], archivedAt: null, createdAt: "", updatedAt: "" },
    { id: "g2", name: "B", emoji: "", description: "", currency: "USD", memberIds: ["me", "x"], archivedAt: null, createdAt: "", updatedAt: "" },
  ];
  const base = { notes: "", exchangeRate: 1, splitMethod: "equal" as const, createdAt: "", updatedAt: "" };
  const expenses: Expense[] = [
    { ...base, id: "e1", groupId: "g1", title: "Pizza", categoryId: "food", date: "2026-01-10", currency: "EUR", amountMinor: 2000, payers: [{ personId: "me", amountMinor: 2000 }], splits: [{ personId: "me", amountMinor: 1000 }, { personId: "x", amountMinor: 1000 }] },
    { ...base, id: "e2", groupId: "g2", title: "Taxi", categoryId: "transport", date: "2026-01-12", currency: "USD", amountMinor: 1000, payers: [{ personId: "x", amountMinor: 1000 }], splits: [{ personId: "me", amountMinor: 500 }, { personId: "x", amountMinor: 500 }] },
  ];
  it("somma solo le valute convertibili e segnala le altre", () => {
    const s = computeStats(expenses, groups, { currency: "EUR", selfId: "me", months: 12 });
    expect(s.totalMinor).toBe(2000);
    expect(s.mineMinor).toBe(1000);
    expect(s.skippedForCurrency).toBe(1);
  });
  it("converte con i tassi in cache", () => {
    const s = computeStats(expenses, groups, {
      currency: "EUR",
      selfId: "me",
      rates: { "USD>EUR": { rate: 0.9 } },
    });
    expect(s.totalMinor).toBe(2900);
    expect(s.categories.find((c) => c.categoryId === "transport")?.totalMinor).toBe(900);
    expect(s.skippedForCurrency).toBe(0);
  });
});
