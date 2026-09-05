import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatExpenseDeletedMessage,
  formatExpenseEditedMessage,
  formatExpenseMessage,
  formatNameList,
  formatSettlementMessage,
  resolveNotifyTarget,
  sendTelegramMessage,
  type TelegramSettings,
} from "@/cloud/telegram";
import type { Group } from "@/domain/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Intl.NumberFormat inserisce spazi speciali (NBSP / narrow NBSP) fra importo e simbolo.
const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("formatExpenseMessage", () => {
  it("formatta importi in centesimi come valuta italiana", () => {
    expect(
      norm(formatExpenseMessage({
        actorName: "Domenico",
        title: "Spesa coop",
        amountMinor: 1350,
        currency: "EUR",
      }))
    ).toBe('💸 Domenico ha aggiunto "Spesa coop" · 13,50 €');
  });

  it("aggiunge la riga con paganti e partecipanti quando ci sono i nomi", () => {
    expect(
      norm(formatExpenseMessage({
        actorName: "Domenico",
        title: "Spesa coop",
        amountMinor: 1350,
        currency: "EUR",
        payerNames: ["Domenico"],
        participantNames: ["Domenico", "Cinzia"],
      }))
    ).toBe('💸 Domenico ha aggiunto "Spesa coop" · 13,50 €\nPagato da: Domenico · Diviso fra: Domenico, Cinzia');
  });

  it("gestisce valute senza decimali (JPY)", () => {
    expect(
      norm(formatExpenseMessage({
        actorName: "Mario",
        title: "Ramen",
        amountMinor: 1200,
        currency: "JPY",
      }))
    ).toBe('💸 Mario ha aggiunto "Ramen" · 1200 ¥');
  });
});

describe("formatNameList", () => {
  it("fino a 4 nomi li mostra tutti", () => {
    expect(formatNameList(["A", "B"])).toBe("A, B");
    expect(formatNameList(["A", "B", "C", "D"])).toBe("A, B, C, D");
  });

  it("oltre 4 nomi: primi due + conteggio dei restanti", () => {
    expect(formatNameList(["Domenico", "Cinzia", "Paolo", "Sara", "Luca"])).toBe("Domenico, Cinzia +3");
    expect(formatNameList(["A", "B", "C", "D", "E", "F"])).toBe("A, B +4");
  });

  it("ignora nomi vuoti", () => {
    expect(formatNameList(["A", " ", ""])).toBe("A");
  });
});

describe("formatExpenseEditedMessage / formatExpenseDeletedMessage", () => {
  it("modifica: matita con titolo e importo", () => {
    expect(
      norm(formatExpenseEditedMessage({ actorName: "Domenico", title: "Spesa coop", amountMinor: 1350, currency: "EUR" }))
    ).toBe('✏️ Domenico ha modificato "Spesa coop" · 13,50 €');
  });

  it("eliminazione: cestino col titolo", () => {
    expect(formatExpenseDeletedMessage({ actorName: "Domenico", title: "Spesa coop" })).toBe(
      '🗑️ Domenico ha eliminato "Spesa coop"',
    );
  });
});

describe("resolveNotifyTarget", () => {
  const settings: TelegramSettings = { enabled: true, botToken: "TOK-GLOBALE", chatId: "-100999" };

  const telegramGroup: Group = {
    id: "g1",
    name: "Vacanza",
    emoji: "🏖️",
    description: "",
    currency: "EUR",
    memberIds: [],
    archivedAt: null,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-02T10:00:00.000Z",
    fileShare: {
      provider: "telegram",
      fileId: "-1001234567890",
      shareUrl: null,
      ownerName: "Anna",
      lastSyncedAt: null,
      telegram: { botToken: "TOK-GRUPPO", chatId: "-1001234567890", messageId: 42 },
    },
  };

  it("gruppo condiviso via Telegram -> credenziali del gruppo, anche con enabled=false globale", () => {
    const target = resolveNotifyTarget(telegramGroup, { ...settings, enabled: false });
    expect(target).toEqual({ enabled: true, botToken: "TOK-GRUPPO", chatId: "-1001234567890" });
  });

  it("gruppo normale -> settings globali (flag enabled incluso)", () => {
    const plain: Group = { ...telegramGroup, fileShare: null };
    expect(resolveNotifyTarget(plain, settings)).toBe(settings);
  });

  it("gruppo senza fileShare telegram e senza settings -> null", () => {
    const plain: Group = { ...telegramGroup, fileShare: null };
    expect(resolveNotifyTarget(plain, undefined)).toBeNull();
    expect(resolveNotifyTarget(undefined, undefined)).toBeNull();
  });
});

describe("formatSettlementMessage", () => {
  it("formatta un rimborso con destinatario e importo", () => {
    expect(
      norm(formatSettlementMessage({
        actorName: "Mario",
        toName: "Luigi",
        amountMinor: 2000,
        currency: "EUR",
        groupName: "Casa",
      }))
    ).toBe('💶 Mario ha rimborsato 20,00 € a Luigi nel gruppo "Casa".');
  });
});

describe("sendTelegramMessage", () => {
  const fetchMock = () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    return mock;
  };

  it("non chiama la rete se disabilitato", async () => {
    const mock = fetchMock();
    const res = await sendTelegramMessage(
      { enabled: false, botToken: "tok", chatId: "123" },
      "ciao"
    );
    expect(res).toEqual({ ok: false, error: "not-configured" });
    expect(mock).not.toHaveBeenCalled();
  });

  it("non chiama la rete se token o chatId mancano", async () => {
    const mock = fetchMock();
    const base: TelegramSettings = { enabled: true, botToken: "", chatId: "123" };
    expect(await sendTelegramMessage(base, "ciao")).toEqual({ ok: false, error: "not-configured" });
    expect(await sendTelegramMessage({ ...base, botToken: "tok", chatId: "  " }, "ciao")).toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(mock).not.toHaveBeenCalled();
  });

  it("invia il messaggio con fetch e ritorna ok", async () => {
    const mock = fetchMock();
    mock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const settings: TelegramSettings = { enabled: true, botToken: "TOKEN", chatId: "-1001" };
    const res = await sendTelegramMessage(settings, "testo prova");
    expect(res).toEqual({ ok: true });
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: "-1001", text: "testo prova" });
  });

  it("riporta la description di Telegram sulle risposte di errore", async () => {
    const mock = fetchMock();
    mock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, description: "Bad Request: chat not found" }),
    });
    const res = await sendTelegramMessage(
      { enabled: true, botToken: "TOKEN", chatId: "999" },
      "ciao"
    );
    expect(res).toEqual({ ok: false, error: "Bad Request: chat not found" });
  });

  it("usa lo status HTTP se il corpo non è JSON", async () => {
    const mock = fetchMock();
    mock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });
    const res = await sendTelegramMessage(
      { enabled: true, botToken: "TOKEN", chatId: "999" },
      "ciao"
    );
    expect(res).toEqual({ ok: false, error: "HTTP 502" });
  });

  it("non lancia eccezioni su errore di rete", async () => {
    const mock = fetchMock();
    mock.mockRejectedValue(new Error("Network down"));
    const res = await sendTelegramMessage(
      { enabled: true, botToken: "TOKEN", chatId: "999" },
      "ciao"
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Network down");
  });
});
