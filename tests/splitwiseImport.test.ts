import { describe, expect, it } from "vitest";
import { applyImportOptions, categoryIdFor, parseSplitwiseCsv } from "@/domain/splitwiseImport";

const CSV = [
  "Data,Descrizione,Categorie,Costo,Valuta,Domenico Gaudioso,Cinzia",
  "",
  "2024-01-01,Spese condominiali 1 rata,Generali,481.44,USD,-240.72,240.72",
  "2024-01-24,Scrivania,Generali,265.00,USD,132.50,-132.50",
  '2024-05-01,"Spese varie Amazon, lampade et all",Generali,219.00,USD,109.50,-109.50',
  '2024-02-01,"Cena ""da Mario""",Ristorante,50.00,USD,25.00,-25.00',
  "2024-06-30,Rata 4 110,Generali,2455.75,USD,-1227.87,1227.87",
  "2026-09-04,Bilancio totale, , ,USD,144.93,-144.93",
  "2026-09-04,Bilancio totale, , ,JPY,0.00,0.00",
  "",
  "not-a-date,Spesa,Generali,10.00,USD,-5.00,5.00",
  "2024-01-05,Costo rotto,Generali,abc,USD,-5.00,5.00",
].join("\n");

describe("parseSplitwiseCsv", () => {
  it("legge header e persone", () => {
    const res = parseSplitwiseCsv(CSV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.people).toEqual(["Domenico Gaudioso", "Cinzia"]);
  });

  it("importa le righe valide e salta riepiloghi e righe rotte", () => {
    const res = parseSplitwiseCsv(CSV);
    if (!res.ok) throw new Error(res.error);
    expect(res.rows).toHaveLength(5);
    // 2 "Bilancio totale" + data non valida + costo non numerico
    expect(res.skipped).toBe(4);
  });

  it("ricostruisce payers e splits (pagante unico)", () => {
    const res = parseSplitwiseCsv(CSV);
    if (!res.ok) throw new Error(res.error);
    const r = res.rows[0];
    expect(r.date).toBe("2024-01-01");
    expect(r.title).toBe("Spese condominiali 1 rata");
    expect(r.category).toBe("Generali");
    expect(r.currency).toBe("USD");
    expect(r.amountMinor).toBe(48144);
    expect(r.payers).toEqual([{ name: "Cinzia", amountMinor: 48144 }]);
    expect(r.splits).toEqual([
      { name: "Domenico Gaudioso", amountMinor: 24072 },
      { name: "Cinzia", amountMinor: 24072 },
    ]);
    // Pagante alternato: qui paga Domenico.
    expect(res.rows[1].payers).toEqual([{ name: "Domenico Gaudioso", amountMinor: 26500 }]);
  });

  it("gestisce campi fra virgolette con virgole e doppi apici escaped", () => {
    const res = parseSplitwiseCsv(CSV);
    if (!res.ok) throw new Error(res.error);
    expect(res.rows[2].title).toBe("Spese varie Amazon, lampade et all");
    expect(res.rows[3].title).toBe('Cena "da Mario"');
  });

  it("arrotonda in centesimi con somme esatte", () => {
    const res = parseSplitwiseCsv(CSV);
    if (!res.ok) throw new Error(res.error);
    const r = res.rows[4]; // 2455.75 non divisibile equamente
    expect(r.amountMinor).toBe(245575);
    for (const row of res.rows) {
      expect(row.payers.reduce((a, p) => a + p.amountMinor, 0)).toBe(row.amountMinor);
      expect(row.splits.reduce((a, s) => a + s.amountMinor, 0)).toBe(row.amountMinor);
    }
    // Il resto va sul contributo più grande (Cinzia ha il netto più alto).
    expect(r.splits).toEqual([
      { name: "Domenico Gaudioso", amountMinor: 122787 },
      { name: "Cinzia", amountMinor: 122788 },
    ]);
    expect(r.payers).toEqual([{ name: "Cinzia", amountMinor: 245575 }]);
  });

  it("rifiuta file vuoti o senza intestazione Splitwise", () => {
    expect(parseSplitwiseCsv("").ok).toBe(false);
    expect(parseSplitwiseCsv("   \n  ").ok).toBe(false);
    expect(parseSplitwiseCsv("foo,bar\n1,2").ok).toBe(false);
    expect(parseSplitwiseCsv("Data,Descrizione,Categorie,Costo,Valuta").ok).toBe(false);
  });
});

const CSV_UNBALANCED = [
  "Data,Descrizione,Categorie,Costo,Valuta,Domenico Gaudioso,Cinzia",
  "2024-01-02,Bus,Autobus/treno,36.00,USD,-36.00,36.00",
].join("\n");

const CSV_THREE = [
  "Data,Descrizione,Categorie,Costo,Valuta,Anna,Bruno,Carla",
  "2024-03-01,Cena,Ristorante,90.00,EUR,80.00,-50.00,-30.00",
].join("\n");

describe("parseSplitwiseCsv — split non equi (water-filling)", () => {
  it("riga Bus: quota interamente su Domenico, paga Cinzia", () => {
    const res = parseSplitwiseCsv(CSV_UNBALANCED);
    if (!res.ok) throw new Error(res.error);
    expect(res.rows).toHaveLength(1);
    const r = res.rows[0];
    expect(r.amountMinor).toBe(3600);
    expect(r.payers).toEqual([{ name: "Cinzia", amountMinor: 3600 }]);
    expect(r.splits).toEqual([
      { name: "Domenico Gaudioso", amountMinor: 3600 },
      { name: "Cinzia", amountMinor: 0 },
    ]);
  });

  it("tre persone con uno sbilanciato", () => {
    const res = parseSplitwiseCsv(CSV_THREE);
    if (!res.ok) throw new Error(res.error);
    const r = res.rows[0];
    expect(r.amountMinor).toBe(9000);
    expect(r.payers).toEqual([{ name: "Anna", amountMinor: 9000 }]);
    expect(r.splits).toEqual([
      { name: "Anna", amountMinor: 1000 },
      { name: "Bruno", amountMinor: 5000 },
      { name: "Carla", amountMinor: 3000 },
    ]);
  });

  it("preserva i netti esatti del CSV (paid - share = net)", () => {
    for (const [csv, nets] of [
      [CSV_UNBALANCED, { "Domenico Gaudioso": -3600, Cinzia: 3600 }],
      [CSV_THREE, { Anna: 8000, Bruno: -5000, Carla: -3000 }],
    ] as const) {
      const res = parseSplitwiseCsv(csv);
      if (!res.ok) throw new Error(res.error);
      const r = res.rows[0];
      for (const [name, net] of Object.entries(nets)) {
        const paid = r.payers.find((p) => p.name === name)?.amountMinor ?? 0;
        const share = r.splits.find((s) => s.name === name)?.amountMinor ?? 0;
        expect(paid - share).toBe(net);
      }
    }
  });
});

describe("categoryIdFor", () => {
  it("mappa le categorie Splitwise sugli id interni", () => {
    expect(categoryIdFor("Alimentari", "Spesa coop")).toBe("groceries");
    expect(categoryIdFor("Ristorante", "Pizza")).toBe("food");
    expect(categoryIdFor("Autobus/treno", "Bus")).toBe("transport");
    expect(categoryIdFor("Carburante", "Gas")).toBe("fuel");
    expect(categoryIdFor("TV/Telefono/Internet", "Wifi")).toBe("utilities");
    expect(categoryIdFor("Riscaldamento/gas", "Gas febbraio")).toBe("utilities");
    expect(categoryIdFor("Casa", "Affitto")).toBe("home");
    expect(categoryIdFor("Hotel", "Hotel villafranca")).toBe("lodging");
    expect(categoryIdFor("Regali", "Regalo elia")).toBe("gifts");
    expect(categoryIdFor("Intrattenimento - Altro", "Museo del futuro")).toBe("entertainment");
  });

  it("categoria generica o sconosciuta: deduce dal titolo, poi other", () => {
    expect(categoryIdFor("Generali", "Spese condominiali 1 rata")).toBe("home");
    expect(categoryIdFor("Generali", "Pizza con amici")).toBe("food");
    expect(categoryIdFor("Sconosciuta", "xyzzy qwerty")).toBe("other");
    expect(categoryIdFor("", "xyzzy qwerty")).toBe("other");
  });
});


describe("applyImportOptions", () => {
  const baseRows = () => {
    const res = parseSplitwiseCsv(CSV);
    if (!res.ok) throw new Error(res.error);
    return res.rows;
  };

  it("senza opzioni: righe invariate", () => {
    const rows = baseRows();
    const res = applyImportOptions(rows, "EUR");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toBe(rows);
    expect(res.skippedByDate).toBe(0);
  });

  it("filtro data: salta le righe precedenti e le conta in skippedByDate", () => {
    const res = applyImportOptions(baseRows(), "USD", { fromDate: "2024-05-01", currencyMode: "keep" });
    if (!res.ok) throw new Error(res.error);
    expect(res.skippedByDate).toBe(3); // 2024-01-01, 2024-01-24 e 2024-02-01
    expect(res.rows.every((r) => r.date >= "2024-05-01")).toBe(true);
    expect(res.rows).toHaveLength(2);
  });

  it("fromDate non valida → errore", () => {
    const res = applyImportOptions(baseRows(), "USD", { fromDate: "01/05/2024", currencyMode: "keep" });
    expect(res.ok).toBe(false);
  });

  it("convert: tasso nel verso della cache (1 EUR = 2 USD), centesimi esatti", () => {
    const rows = baseRows();
    const res = applyImportOptions(rows, "EUR", { currencyMode: "convert", rates: { USD: 2 } });
    if (!res.ok) throw new Error(res.error);
    const r = res.rows[0]; // 481.44 USD → 240.72 EUR
    expect(r.currency).toBe("EUR");
    expect(r.amountMinor).toBe(24072);
    // Somme payers/splits preservate sul totale convertito.
    for (const row of res.rows) {
      expect(row.currency).toBe("EUR");
      expect(row.payers.reduce((a, p) => a + p.amountMinor, 0)).toBe(row.amountMinor);
      expect(row.splits.reduce((a, s) => a + s.amountMinor, 0)).toBe(row.amountMinor);
    }
  });

  it("convert: errore se manca il tasso di una valuta presente", () => {
    const csv = [
      "Data,Descrizione,Categorie,Costo,Valuta,A,B",
      "2024-01-01,Uno,Generali,10.00,USD,10.00,-10.00",
      "2024-01-02,Due,Generali,1000.00,JPY,1000.00,-1000.00",
    ].join("\n");
    const parsed = parseSplitwiseCsv(csv);
    if (!parsed.ok) throw new Error(parsed.error);
    const res = applyImportOptions(parsed.rows, "EUR", { currencyMode: "convert", rates: { USD: 1.08 } });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("JPY");
  });

  it("relabel: importi identici, cambia solo la valuta", () => {
    const rows = baseRows();
    const res = applyImportOptions(rows, "EUR", { currencyMode: "relabel" });
    if (!res.ok) throw new Error(res.error);
    res.rows.forEach((r, i) => {
      expect(r.currency).toBe("EUR");
      expect(r.amountMinor).toBe(rows[i].amountMinor);
      expect(r.payers).toEqual(rows[i].payers);
      expect(r.splits).toEqual(rows[i].splits);
    });
  });
});
