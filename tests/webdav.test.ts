import { afterEach, describe, expect, it, vi } from "vitest";
import { activeDataProvider } from "@/cloud/dataSync";
import { buildDoc } from "@/cloud/fileShare/doc";
import { downloadSharedDoc, uploadSharedDoc, webdavSharedPath } from "@/cloud/fileShare/providers";
import { pullSharedGroup, pushSharedGroup, type FileShareSyncDeps } from "@/cloud/fileShare/sync";
import {
  WEBDAV_DIR,
  webdavBasicAuth,
  webdavGet,
  webdavJoinUrl,
  webdavMkcol,
  webdavPropfind,
  webdavPut,
  webdavTestConnection,
  type WebDavConfig,
} from "@/cloud/fileShare/webdav";
import { buildInviteLink, decodeInvite, type FileInvitePayload } from "@/cloud/invites";
import type { FileShareLink, Group, Settings } from "@/domain/types";

const cfg: WebDavConfig = {
  url: "https://ewebdav.pcloud.com",
  username: "tu@esempio.com",
  password: "segreta",
};

const group: Group = {
  id: "g1",
  name: "Vacanza",
  emoji: "🏖️",
  description: "",
  currency: "EUR",
  memberIds: [],
  archivedAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-02T10:00:00.000Z",
};

const linkWebdav: FileShareLink = {
  provider: "webdav",
  fileId: "/SplitFree/splitfree_group_g1.json",
  shareUrl: null,
  ownerName: "Anna",
  lastSyncedAt: null,
  webdav: cfg,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOnce(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("helper puri", () => {
  it("basic auth: base64 di username:password", () => {
    expect(webdavBasicAuth(cfg)).toBe(`Basic ${btoa("tu@esempio.com:segreta")}`);
  });

  it("join URL: normalizza gli slash fra base e percorso", () => {
    expect(webdavJoinUrl(cfg, "/SplitFree/splitfree_data.json")).toBe(
      "https://ewebdav.pcloud.com/SplitFree/splitfree_data.json"
    );
    expect(webdavJoinUrl({ ...cfg, url: "https://dav.koofr.net/" }, "/a/b.json")).toBe(
      "https://dav.koofr.net/a/b.json"
    );
    expect(webdavJoinUrl(cfg, "senza-slash.json")).toBe("https://ewebdav.pcloud.com/senza-slash.json");
  });

  it("percorso predefinito del file di gruppo", () => {
    expect(webdavSharedPath("g1")).toBe("/SplitFree/splitfree_group_g1.json");
  });
});

describe("webdavPut", () => {
  it("PUT riuscita: nessuna eccezione, header Authorization e body corretti", async () => {
    const fetchMock = mockFetchOnce(async () => new Response(null, { status: 201 }));
    await webdavPut(cfg, "/SplitFree/splitfree_data.json", "{}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ewebdav.pcloud.com/SplitFree/splitfree_data.json");
    expect(init?.method).toBe("PUT");
    expect((init?.headers as Record<string, string>).Authorization).toBe(webdavBasicAuth(cfg));
  });

  it("su 409 crea le cartelle padre con MKCOL e riprova il PUT", async () => {
    const calls: { method?: string; url: string }[] = [];
    mockFetchOnce(async (url, init) => {
      calls.push({ method: init?.method, url });
      if (init?.method === "PUT" && calls.filter((c) => c.method === "PUT").length === 1) {
        return new Response(null, { status: 409 });
      }
      return new Response(null, { status: 201 });
    });

    await webdavPut(cfg, "/SplitFree/splitfree_data.json", "{}");
    expect(calls.map((c) => c.method)).toEqual(["PUT", "MKCOL", "PUT"]);
    expect(calls[1].url).toBe("https://ewebdav.pcloud.com/SplitFree");
  });

  it("401: errore in italiano sulle credenziali", async () => {
    mockFetchOnce(async () => new Response(null, { status: 401 }));
    await expect(webdavPut(cfg, "/x.json", "{}")).rejects.toThrow(/credenziali errate/);
  });
});

describe("webdavGet", () => {
  it("ritorna testo e Last-Modified convertita in ISO", async () => {
    mockFetchOnce(
      async () =>
        new Response("{\"ok\":true}", {
          status: 200,
          headers: { "Last-Modified": "Fri, 04 Sep 2026 10:00:00 GMT" },
        })
    );
    const file = await webdavGet(cfg, "/SplitFree/splitfree_data.json");
    expect(file?.text).toBe("{\"ok\":true}");
    expect(file?.modifiedTime).toBe("2026-09-04T10:00:00.000Z");
  });

  it("senza Last-Modified usa la data corrente come fallback", async () => {
    mockFetchOnce(async () => new Response("{}", { status: 200 }));
    const file = await webdavGet(cfg, "/x.json");
    expect(file?.modifiedTime).toBeTruthy();
    expect(Number.isNaN(Date.parse(file!.modifiedTime))).toBe(false);
  });

  it("404: ritorna null senza errori", async () => {
    mockFetchOnce(async () => new Response(null, { status: 404 }));
    expect(await webdavGet(cfg, "/x.json")).toBeNull();
  });
});

describe("webdavMkcol / webdavPropfind / webdavTestConnection", () => {
  it("MKCOL: 405 (esiste già) non è un errore", async () => {
    mockFetchOnce(async () => new Response(null, { status: 405 }));
    await expect(webdavMkcol(cfg, WEBDAV_DIR)).resolves.toBeUndefined();
  });

  it("PROPFIND: estrae getlastmodified dalla risposta multistatus", async () => {
    const xml = `<?xml version="1.0"?>
      <d:multistatus xmlns:d="DAV:">
        <d:response><d:propstat><d:prop>
          <d:getlastmodified>Fri, 04 Sep 2026 12:30:00 GMT</d:getlastmodified>
        </d:prop></d:propstat></d:response>
      </d:multistatus>`;
    mockFetchOnce(async () => new Response(xml, { status: 207 }));
    expect(await webdavPropfind(cfg, "/SplitFree/splitfree_data.json")).toBe("2026-09-04T12:30:00.000Z");
  });

  it("PROPFIND fallito: ripiega su GET", async () => {
    const calls: string[] = [];
    mockFetchOnce(async (_url, init) => {
      calls.push(init?.method ?? "GET");
      if (init?.method === "PROPFIND") return new Response(null, { status: 500 });
      return new Response("{}", {
        status: 200,
        headers: { "Last-Modified": "Fri, 04 Sep 2026 09:00:00 GMT" },
      });
    });
    expect(await webdavPropfind(cfg, "/x.json")).toBe("2026-09-04T09:00:00.000Z");
    expect(calls).toEqual(["PROPFIND", "GET"]);
  });

  it("test connessione: ok su 207, errore su 401, errore se mancano campi", async () => {
    mockFetchOnce(async () => new Response(null, { status: 207 }));
    expect(await webdavTestConnection(cfg)).toEqual({ ok: true });

    mockFetchOnce(async () => new Response(null, { status: 401 }));
    const ko = await webdavTestConnection(cfg);
    expect(ko.ok).toBe(false);
    expect(ko.error).toMatch(/credenziali errate/);

    const empty = await webdavTestConnection({ url: "", username: "", password: "" });
    expect(empty.ok).toBe(false);
  });
});

describe("invito v2 con provider webdav", () => {
  function sampleWebdavPayload(): FileInvitePayload {
    return {
      v: 2,
      provider: "webdav",
      fileId: "/SplitFree/splitfree_group_g9.json",
      shareUrl: null,
      groupId: "g9",
      groupName: "Casa condivisa 🏠",
      emoji: "🏠",
      currency: "EUR",
      ownerName: "Anna",
      webdav: cfg,
    };
  }

  it("round-trip: il link porta le credenziali e torna identico", () => {
    const payload = sampleWebdavPayload();
    const decoded = decodeInvite(buildInviteLink(payload));
    expect(decoded).toEqual(payload);
  });

  it("rifiuta un invito webdav senza credenziali", () => {
    const senza = { ...sampleWebdavPayload(), webdav: undefined };
    expect(decodeInvite(buildInviteLink(senza as FileInvitePayload))).toBeNull();
    const parziali = { ...sampleWebdavPayload(), webdav: { url: cfg.url, username: "", password: "" } };
    expect(decodeInvite(buildInviteLink(parziali))).toBeNull();
  });
});

describe("activeDataProvider con webdav", () => {
  function settings(patch: Partial<Settings>): Pick<Settings, "cloudStorage" | "webdav"> {
    return { cloudStorage: patch.cloudStorage, webdav: patch.webdav };
  }

  it("sceglie webdav se connesso con credenziali complete", () => {
    expect(
      activeDataProvider(settings({ webdav: { ...cfg, connected: true } }))
    ).toBe("webdav");
  });

  it("ignora webdav senza credenziali o non connesso", () => {
    expect(
      activeDataProvider(settings({ webdav: { url: cfg.url, username: "", password: "", connected: true } }))
    ).toBeNull();
    expect(
      activeDataProvider(settings({ webdav: { ...cfg, connected: false } }))
    ).toBeNull();
  });

  it("con più provider vince il lastSync più recente", () => {
    const s = settings({
      cloudStorage: { googleDrive: { connected: true, accessToken: "g", lastSync: "2026-09-03T10:00:00.000Z" } },
      webdav: { ...cfg, connected: true, lastSync: "2026-09-04T10:00:00.000Z" },
    });
    expect(activeDataProvider(s)).toBe("webdav");
  });
});

describe("documenti di gruppo via webdav", () => {
  it("uploadSharedDoc: PUT al percorso del link, fileId = percorso", async () => {
    const fetchMock = mockFetchOnce(async () => new Response(null, { status: 204 }));
    const doc = buildDoc(group, [], [], []);
    const res = await uploadSharedDoc("webdav", "", { fileId: linkWebdav.fileId, webdav: cfg }, doc);
    expect(res.fileId).toBe("/SplitFree/splitfree_group_g1.json");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ewebdav.pcloud.com/SplitFree/splitfree_group_g1.json");
    expect(init?.method).toBe("PUT");
  });

  it("uploadSharedDoc senza credenziali nel link: errore chiaro", async () => {
    const doc = buildDoc(group, [], [], []);
    await expect(
      uploadSharedDoc("webdav", "", { fileId: linkWebdav.fileId }, doc)
    ).rejects.toThrow(/Credenziali WebDAV mancanti/);
  });

  it("downloadSharedDoc: GET + validazione del documento", async () => {
    const doc = buildDoc(group, [], [], []);
    mockFetchOnce(async () => new Response(JSON.stringify(doc), { status: 200 }));
    const downloaded = await downloadSharedDoc("webdav", linkWebdav);
    expect(downloaded.groupId).toBe("g1");
  });

  it("downloadSharedDoc: 404 = file eliminato dall'amministratore", async () => {
    mockFetchOnce(async () => new Response(null, { status: 404 }));
    await expect(downloadSharedDoc("webdav", linkWebdav)).rejects.toThrow(/eliminato dall'amministratore/);
  });
});

describe("pull/push gruppo via webdav (DI)", () => {
  function makeDeps(overrides: Partial<FileShareSyncDeps>) {
    const applied: unknown[] = [];
    const deps: FileShareSyncDeps = {
      getGroup: vi.fn(() => ({ ...group, fileShare: linkWebdav })),
      getSlices: vi.fn(() => ({ people: [], expenses: [], settlements: [] })),
      applyDoc: vi.fn((_g, doc) => applied.push(doc)),
      getToken: vi.fn(async () => "webdav"),
      download: vi.fn(async () => buildDoc(group, [], [], [])),
      upload: vi.fn(async () => ({ fileId: linkWebdav.fileId })),
      ...overrides,
    };
    return { deps, applied };
  }

  it("pull: usa il link webdav e applica il documento fuso", async () => {
    const { deps, applied } = makeDeps({});
    const res = await pullSharedGroup("g1", deps);
    expect(res.ok).toBe(true);
    expect(applied).toHaveLength(1);
    expect(deps.download).toHaveBeenCalledWith("webdav", expect.objectContaining({ provider: "webdav" }));
  });

  it("push: senza credenziali webdav il gruppo resta in sola lettura", async () => {
    const { deps } = makeDeps({
      getToken: vi.fn(async () => {
        throw new Error("Credenziali WebDAV mancanti: chiedi all'amministratore un nuovo invito.");
      }),
    });
    const res = await pushSharedGroup("g1", deps);
    expect(res.ok).toBe(false);
    expect(res.readOnly).toBe(true);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("push: con credenziali carica il documento fuso, nessun readOnly", async () => {
    const { deps, applied } = makeDeps({});
    const res = await pushSharedGroup("g1", deps);
    expect(res).toEqual({ ok: true });
    expect(deps.upload).toHaveBeenCalledWith(
      "webdav",
      "webdav",
      expect.objectContaining({ fileId: linkWebdav.fileId }),
      expect.objectContaining({ groupId: "g1" })
    );
    expect(applied).toHaveLength(1);
  });
});
