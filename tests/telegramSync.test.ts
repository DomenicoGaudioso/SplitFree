import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDoc } from "@/cloud/fileShare/doc";
import {
  pullSharedGroup,
  pushSharedGroup,
  type FileShareSyncDeps,
} from "@/cloud/fileShare/sync";
import {
  buildSendDocumentBody,
  createGroupInviteLink,
  docCaption,
  extractGroupChats,
  fetchPinnedDoc,
  maxUpdateId,
  parsePinnedDocument,
  publishDoc,
  startGroupUrl,
  TG_DOC_FILENAME,
  tgApiUrl,
  tgFileDownloadUrl,
  waitForNewGroupChat,
  type TelegramShareCreds,
} from "@/cloud/fileShare/telegramSync";
import type { SharedGroupDoc } from "@/cloud/fileShare/types";
import {
  buildInviteLink,
  decodeInvite,
  encodeInvite,
  isFileInvite,
  toBase64Url,
  type FileInvitePayload,
} from "@/cloud/invites";
import type { Expense, FileShareLink, Group, Person } from "@/domain/types";

const NOW = "2026-09-04T12:00:00.000Z";

const creds: TelegramShareCreds = {
  botToken: "123456:ABC-DEF",
  chatId: "-1001234567890",
  messageId: null,
};

const group: Group = {
  id: "g1",
  name: "Vacanza",
  emoji: "🏖️",
  description: "",
  currency: "EUR",
  memberIds: ["p1"],
  archivedAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-02T10:00:00.000Z",
};

const self: Person = {
  id: "p1",
  name: "Anna",
  email: null,
  color: "#4F46E5",
  isSelf: true,
  archivedAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T10:00:00.000Z",
};

const doc = buildDoc(group, [self], [], []);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Mock di fetch che smista sul metodo Bot API presente nell'URL. */
function mockTelegramApi(handlers: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    for (const [method, handler] of Object.entries(handlers)) {
      if (url.includes(`/${method}`)) return handler(init);
    }
    throw new Error(`URL non gestita nel mock: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("helper puri", () => {
  it("tgApiUrl e tgFileDownloadUrl costruiscono gli URL della Bot API", () => {
    expect(tgApiUrl("TOK", "getMe")).toBe("https://api.telegram.org/botTOK/getMe");
    expect(tgFileDownloadUrl("TOK", "documents/file_1.json")).toBe(
      "https://api.telegram.org/file/botTOK/documents/file_1.json",
    );
  });

  it("docCaption riporta la revisione del documento", () => {
    expect(docCaption({ ...doc, revision: 7 })).toBe("SplitFree · revisione 7");
  });

  it("parsePinnedDocument: document pinnato -> fileId e messageId", () => {
    const result = {
      id: -1001234567890,
      pinned_message: { message_id: 42, document: { file_id: "FILE_ABC", file_name: TG_DOC_FILENAME } },
    };
    expect(parsePinnedDocument(result)).toEqual({ fileId: "FILE_ABC", messageId: 42 });
  });

  it("parsePinnedDocument: nessun pinned o pinned senza document -> null", () => {
    expect(parsePinnedDocument({ id: 1 })).toBeNull();
    expect(parsePinnedDocument({ pinned_message: { message_id: 42, text: "ciao" } })).toBeNull();
    expect(parsePinnedDocument({ pinned_message: { message_id: "42", document: { file_id: "F" } } })).toBeNull();
    expect(parsePinnedDocument(null)).toBeNull();
    expect(parsePinnedDocument("x")).toBeNull();
  });

  it("buildSendDocumentBody: multipart con chat_id, caption e file JSON", () => {
    const body = buildSendDocumentBody({
      boundary: "B",
      chatId: creds.chatId,
      caption: "SplitFree · revisione 1",
      fileName: TG_DOC_FILENAME,
      json: '{"v":1}',
    });
    expect(body).toContain(`name="chat_id"\r\n\r\n${creds.chatId}`);
    expect(body).toContain('name="caption"\r\n\r\nSplitFree · revisione 1');
    expect(body).toContain(`name="document"; filename="${TG_DOC_FILENAME}"`);
    expect(body).toContain("Content-Type: application/json");
    expect(body).toContain('{"v":1}');
    expect(body.startsWith("--B\r\n")).toBe(true);
    expect(body.endsWith("--B--")).toBe(true);
  });
});

describe("fetchPinnedDoc", () => {
  it("pinned con document: scarica e valida il documento", async () => {
    const { calls } = mockTelegramApi({
      getChat: () =>
        jsonResponse({ ok: true, result: { pinned_message: { message_id: 42, document: { file_id: "FILE_ABC" } } } }),
      getFile: () => jsonResponse({ ok: true, result: { file_path: "documents/file_1.json" } }),
      "file/bot": () => jsonResponse(doc),
    });

    const res = await fetchPinnedDoc(creds);
    expect(res).not.toBeNull();
    expect(res!.messageId).toBe(42);
    expect(res!.doc).toEqual(doc);
    // Sequenza: getChat -> getFile -> download del file.
    expect(calls.map((c) => c.url)).toEqual([
      tgApiUrl(creds.botToken, "getChat"),
      tgApiUrl(creds.botToken, "getFile"),
      tgFileDownloadUrl(creds.botToken, "documents/file_1.json"),
    ]);
  });

  it("pinned senza document o assente -> null", async () => {
    mockTelegramApi({
      getChat: () => jsonResponse({ ok: true, result: { pinned_message: { message_id: 42, text: "ciao" } } }),
    });
    expect(await fetchPinnedDoc(creds)).toBeNull();

    mockTelegramApi({
      getChat: () => jsonResponse({ ok: true, result: { id: -1001234567890 } }),
    });
    expect(await fetchPinnedDoc(creds)).toBeNull();
  });

  it("401 -> errore italiano sul token del bot", async () => {
    mockTelegramApi({
      getChat: () => jsonResponse({ ok: false, description: "Unauthorized" }, 401),
    });
    await expect(fetchPinnedDoc(creds)).rejects.toThrow("Token del bot non valido.");
  });

  it("403 -> errore italiano su bot non nel gruppo / chat id errata", async () => {
    mockTelegramApi({
      getChat: () => jsonResponse({ ok: false, description: "Forbidden" }, 403),
    });
    await expect(fetchPinnedDoc(creds)).rejects.toThrow(
      "Il bot non è nel gruppo Telegram o la chat ID è errata.",
    );
  });

  it("documento scaricato non valido -> errore italiano", async () => {
    mockTelegramApi({
      getChat: () =>
        jsonResponse({ ok: true, result: { pinned_message: { message_id: 42, document: { file_id: "FILE_ABC" } } } }),
      getFile: () => jsonResponse({ ok: true, result: { file_path: "documents/file_1.json" } }),
      "file/bot": () => jsonResponse({ qualcosa: "altro" }),
    });
    await expect(fetchPinnedDoc(creds)).rejects.toThrow(
      "Il documento pinnato non è un documento di gruppo SplitFree valido.",
    );
  });
});

describe("publishDoc", () => {
  it("sendDocument multipart poi pinChatMessage, ritorna il messageId", async () => {
    const { calls } = mockTelegramApi({
      sendDocument: () => jsonResponse({ ok: true, result: { message_id: 77 } }),
      pinChatMessage: () => jsonResponse({ ok: true, result: true }),
    });

    const messageId = await publishDoc(creds, doc);
    expect(messageId).toBe(77);

    expect(calls).toHaveLength(2);
    // 1) sendDocument: multipart col JSON del gruppo e la caption di revisione.
    const [send, pin] = calls;
    expect(send.url).toBe(tgApiUrl(creds.botToken, "sendDocument"));
    const contentType = (send.init?.headers as Record<string, string>)["Content-Type"];
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    const body = String(send.init?.body);
    expect(body).toContain(`name="chat_id"\r\n\r\n${creds.chatId}`);
    expect(body).toContain(`name="caption"\r\n\r\nSplitFree · revisione ${doc.revision}`);
    expect(body).toContain(`name="document"; filename="${TG_DOC_FILENAME}"`);
    expect(body).toContain('"groupId": "g1"');
    // 2) pinChatMessage DOPO sendDocument, silenzioso, sul nuovo messaggio.
    expect(pin.url).toBe(tgApiUrl(creds.botToken, "pinChatMessage"));
    expect(JSON.parse(String(pin.init?.body))).toEqual({
      chat_id: creds.chatId,
      message_id: 77,
      disable_notification: true,
    });
  });

  it("pin fallito -> errore (i lettori vedrebbero la versione vecchia)", async () => {
    mockTelegramApi({
      sendDocument: () => jsonResponse({ ok: true, result: { message_id: 77 } }),
      pinChatMessage: () => jsonResponse({ ok: false, description: "not enough rights" }, 403),
    });
    await expect(publishDoc(creds, doc)).rejects.toThrow(
      "Il bot non è nel gruppo Telegram o la chat ID è errata.",
    );
  });
});

describe("invito v2 telegram", () => {
  function telegramPayload(): FileInvitePayload {
    return {
      v: 2,
      provider: "telegram",
      fileId: creds.chatId,
      shareUrl: null,
      groupId: "g9",
      groupName: "Casa condivisa 🏠",
      emoji: "🏠",
      currency: "EUR",
      ownerName: "Anna",
      telegram: { botToken: creds.botToken, chatId: creds.chatId },
    };
  }

  it("round-trip: link -> decode restituisce il payload identico (messageId escluso)", () => {
    const payload = telegramPayload();
    const link = buildInviteLink(payload);
    expect(link.startsWith("splitfree://join?i=")).toBe(true);
    const decoded = decodeInvite(link);
    expect(decoded).toEqual(payload);
    expect(isFileInvite(decoded)).toBe(true);
    // Il messageId non viaggia mai nell'invito.
    expect(JSON.stringify(payload)).not.toContain("messageId");
  });

  it("decodifica anche il solo blocco incollato", () => {
    const payload = telegramPayload();
    expect(decodeInvite(encodeInvite(payload))).toEqual(payload);
  });

  it("rifiuta inviti telegram senza credenziali", () => {
    const { telegram: _omit, ...noCreds } = telegramPayload();
    expect(decodeInvite(toBase64Url(JSON.stringify(noCreds)))).toBeNull();
    expect(
      decodeInvite(toBase64Url(JSON.stringify({ ...telegramPayload(), telegram: { botToken: "", chatId: creds.chatId } }))),
    ).toBeNull();
    expect(
      decodeInvite(toBase64Url(JSON.stringify({ ...telegramPayload(), telegram: { botToken: creds.botToken } }))),
    ).toBeNull();
  });
});

describe("pull/push di un gruppo telegram (DI)", () => {
  const link: FileShareLink = {
    provider: "telegram",
    fileId: creds.chatId,
    shareUrl: null,
    ownerName: "Anna",
    lastSyncedAt: null,
    telegram: creds,
  };
  const tgGroup: Group = { ...group, fileShare: link };

  function expense(id: string, title: string, updatedAt: string): Expense {
    return {
      id,
      groupId: "g1",
      title,
      notes: "",
      categoryId: "other",
      date: "2026-01-10",
      currency: "EUR",
      amountMinor: 1000,
      exchangeRate: 1,
      splitMethod: "equal",
      payers: [{ personId: "p1", amountMinor: 1000 }],
      splits: [{ personId: "p1", amountMinor: 1000 }],
      createdAt: updatedAt,
      updatedAt,
    };
  }

  function makeDeps(overrides: Partial<FileShareSyncDeps>) {
    const applied: SharedGroupDoc[] = [];
    const messageIds: number[] = [];
    const deps: FileShareSyncDeps = {
      getGroup: vi.fn(() => tgGroup),
      getSlices: vi.fn(() => ({ people: [self], expenses: [expense("e1", "Locale", NOW)], settlements: [] })),
      applyDoc: vi.fn((_g, d) => applied.push(d)),
      getToken: vi.fn(async () => creds.botToken),
      download: vi.fn(async () => buildDoc(tgGroup, [self], [], [])),
      upload: vi.fn(async () => ({ fileId: creds.chatId, messageId: 99 })),
      updateTelegramMessageId: vi.fn((_g, mid) => messageIds.push(mid)),
      ...overrides,
    };
    return { deps, applied, messageIds };
  }

  it("pull: scarica il pinned, fonde e applica", async () => {
    const remote = buildDoc(tgGroup, [self], [expense("eR", "Remota", "2026-03-02T10:00:00.000Z")], []);
    const { deps, applied } = makeDeps({ download: vi.fn(async () => remote) });

    const res = await pullSharedGroup("g1", deps);
    expect(res.ok).toBe(true);
    expect(deps.download).toHaveBeenCalledWith("telegram", link);
    expect(Object.keys(applied[0].expenses).sort()).toEqual(["e1", "eR"]);
  });

  it("push: upload con le creds telegram del link e messageId salvato", async () => {
    const { deps, messageIds } = makeDeps({});

    const res = await pushSharedGroup("g1", deps);
    expect(res).toEqual({ ok: true });
    expect(deps.getToken).toHaveBeenCalledWith("telegram", link);
    // L'upload riceve il link con fileId + credenziali telegram.
    expect(deps.upload).toHaveBeenCalledWith(
      "telegram",
      creds.botToken,
      { fileId: creds.chatId, webdav: undefined, telegram: creds },
      expect.anything(),
    );
    // Il nuovo messageId del documento pinnato viene salvato nel gruppo.
    expect(messageIds).toEqual([99]);
  });

  it("push: provider non telegram -> updateTelegramMessageId mai chiamato", async () => {
    const odLink: FileShareLink = {
      provider: "onedrive",
      fileId: "ITEM-1",
      shareUrl: "https://1drv.ms/u/s!xyz",
      ownerName: "Anna",
      lastSyncedAt: null,
    };
    const { deps, messageIds } = makeDeps({
      getGroup: vi.fn(() => ({ ...tgGroup, fileShare: odLink })),
      upload: vi.fn(async () => ({ fileId: "ITEM-1" })),
    });

    const res = await pushSharedGroup("g1", deps);
    expect(res.ok).toBe(true);
    expect(messageIds).toEqual([]);
  });
});

describe("wizard: scoperta del gruppo Telegram", () => {
  it("startGroupUrl costruisce il deep link del bot", () => {
    expect(startGroupUrl("SplitFreeBot")).toBe("https://t.me/SplitFreeBot?startgroup=1");
  });

  it("extractGroupChats: riconosce group_chat_created, new_chat_members e my_chat_member", () => {
    const updates = [
      { update_id: 1, message: { chat: { id: -100111, type: "group", title: "Vacanza 🏖️" }, group_chat_created: true } },
      { update_id: 2, message: { chat: { id: -100222, type: "supergroup", title: "Casa" }, new_chat_members: [{ id: 999 }] } },
      {
        update_id: 3,
        my_chat_member: { chat: { id: -100333, type: "supergroup", title: "Amici" }, new_chat_member: { status: "administrator" } },
      },
    ];
    expect(extractGroupChats(updates)).toEqual([
      { chatId: "-100111", title: "Vacanza 🏖️" },
      { chatId: "-100222", title: "Casa" },
      { chatId: "-100333", title: "Amici" },
    ]);
  });

  it("extractGroupChats: ignora chat private, update irrilevanti e chat già note", () => {
    const updates = [
      { update_id: 1, message: { chat: { id: 555, type: "private", title: undefined }, new_chat_members: [{ id: 1 }] } },
      { update_id: 2, message: { chat: { id: -100111, type: "group", title: "Vecchio" }, text: "ciao" } },
      {
        update_id: 3,
        my_chat_member: { chat: { id: -100222, type: "group", title: "Uscito" }, new_chat_member: { status: "kicked" } },
      },
      { update_id: 4, message: { chat: { id: -100333, type: "group", title: "Nota" }, group_chat_created: true } },
      { update_id: 5, message: { chat: { id: -100444, type: "group", title: "Nuovo" }, group_chat_created: true } },
      // Duplicato della stessa chat: una sola volta.
      { update_id: 6, message: { chat: { id: -100444, type: "group", title: "Nuovo" }, new_chat_members: [{ id: 1 }] } },
    ];
    expect(extractGroupChats(updates, ["-100333"])).toEqual([{ chatId: "-100444", title: "Nuovo" }]);
    expect(extractGroupChats(null)).toEqual([]);
    expect(extractGroupChats({})).toEqual([]);
  });

  it("maxUpdateId: il prossimo offset è max+1", () => {
    expect(maxUpdateId([{ update_id: 3 }, { update_id: 9 }, { update_id: 5 }])).toBe(9);
    expect(maxUpdateId([])).toBeNull();
    expect(maxUpdateId("x")).toBeNull();
  });

  it("waitForNewGroupChat: trova il gruppo al secondo poll, con offset crescente", async () => {
    const bodies: Record<string, unknown>[] = [];
    let call = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      call += 1;
      if (call === 1) return jsonResponse({ ok: true, result: [{ update_id: 10, message: { chat: { id: 1, type: "private" }, text: "ciao" } }] });
      return jsonResponse({
        ok: true,
        result: [{ update_id: 11, message: { chat: { id: -100777, type: "supergroup", title: "Vacanza" }, group_chat_created: true } }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const chat = await waitForNewGroupChat(creds.botToken, { excludeChatIds: ["-100333"] });
    expect(chat).toEqual({ chatId: "-100777", title: "Vacanza" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Primo poll senza offset, secondo con offset = update_id + 1 e long polling a 5s.
    expect(bodies[0]).toEqual({ timeout: 5, allowed_updates: ["message", "my_chat_member"] });
    expect(bodies[1].offset).toBe(11);
  });

  it("waitForNewGroupChat: timeout -> errore italiano", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true, result: [] })));
    await expect(waitForNewGroupChat(creds.botToken, { timeoutMs: 30 })).rejects.toThrow(
      "Non ho visto il gruppo: assicurati di aver aggiunto il bot e riprova.",
    );
  });

  it("waitForNewGroupChat: annullabile via AbortSignal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true, result: [] })));
    const controller = new AbortController();
    controller.abort();
    await expect(waitForNewGroupChat(creds.botToken, { signal: controller.signal })).rejects.toThrow("Attesa annullata.");
  });

  it("createGroupInviteLink: ritorna l'invite_link della chat", async () => {
    const { calls } = mockTelegramApi({
      createChatInviteLink: () => jsonResponse({ ok: true, result: { invite_link: "https://t.me/+AbCdEfGh" } }),
    });
    const link = await createGroupInviteLink(creds.botToken, creds.chatId);
    expect(link).toBe("https://t.me/+AbCdEfGh");
    expect(calls[0].url).toBe(tgApiUrl(creds.botToken, "createChatInviteLink"));
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ chat_id: creds.chatId });
  });
});

describe("invito v2 telegram con tgInviteLink", () => {
  it("round-trip con il link d'invito Telegram allegato", () => {
    const payload: FileInvitePayload = {
      v: 2,
      provider: "telegram",
      fileId: creds.chatId,
      shareUrl: null,
      groupId: "g9",
      groupName: "Casa condivisa 🏠",
      emoji: "🏠",
      currency: "EUR",
      ownerName: "Anna",
      telegram: { botToken: creds.botToken, chatId: creds.chatId, tgInviteLink: "https://t.me/+AbCdEfGh" },
    };
    expect(decodeInvite(buildInviteLink(payload))).toEqual(payload);
  });

  it("rifiuta tgInviteLink non stringa", () => {
    const payload: FileInvitePayload = {
      v: 2,
      provider: "telegram",
      fileId: creds.chatId,
      shareUrl: null,
      groupId: "g9",
      groupName: "Casa",
      emoji: "🏠",
      currency: "EUR",
      ownerName: "Anna",
      telegram: { botToken: creds.botToken, chatId: creds.chatId },
    };
    const bad = { ...payload, telegram: { ...payload.telegram!, tgInviteLink: 42 } };
    expect(decodeInvite(toBase64Url(JSON.stringify(bad)))).toBeNull();
  });
});
