import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatExpenseMessage,
  formatSettlementMessage,
  sendTelegramMessage,
  type TelegramSettings,
} from "@/cloud/telegram";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Intl.NumberFormat inserisce spazi speciali (NBSP / narrow NBSP) fra importo e simbolo.
const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("formatExpenseMessage", () => {
  it("formatta importi in centesimi come valuta italiana", () => {
    expect(
      norm(formatExpenseMessage({
        actorName: "Mario",
        title: "Spesa coop",
        amountMinor: 1350,
        currency: "EUR",
        groupName: "Casa",
      }))
    ).toBe('💸 Mario ha aggiunto "Spesa coop" (13,50 €) nel gruppo "Casa".');
  });

  it("gestisce valute senza decimali (JPY)", () => {
    expect(
      norm(formatExpenseMessage({
        actorName: "Mario",
        title: "Ramen",
        amountMinor: 1200,
        currency: "JPY",
        groupName: "Viaggio",
      }))
    ).toBe('💸 Mario ha aggiunto "Ramen" (1200 ¥) nel gruppo "Viaggio".');
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
