import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDoc } from "@/cloud/fileShare/doc";
import {
  downloadSharedDoc,
  driveDownloadUrl,
  driveUploadUrl,
  makeShared,
  oneDriveShareDownloadUrl,
  oneDriveUploadUrl,
  sharedFileName,
  uploadSharedDoc,
} from "@/cloud/fileShare/providers";
import { toBase64Url } from "@/cloud/invites";
import type { FileShareLink, Group } from "@/domain/types";

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

const doc = buildDoc(group, [], [], []);
const linkDrive: FileShareLink = { provider: "gdrive", fileId: "file123", shareUrl: null, ownerName: "Anna", lastSyncedAt: null };
const linkOneDrive: FileShareLink = {
  provider: "onedrive",
  fileId: "ABC!123",
  shareUrl: "https://1drv.ms/u/s!Aq3f9example",
  ownerName: "Anna",
  lastSyncedAt: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("builder di URL puri", () => {
  it("nome file condiviso per gruppo", () => {
    expect(sharedFileName("g1")).toBe("splitfree_group_g1.json");
  });

  it("download anonimo Google Drive", () => {
    expect(driveDownloadUrl("file123")).toBe("https://drive.google.com/uc?export=download&id=file123");
    expect(driveDownloadUrl("a b&c")).toBe("https://drive.google.com/uc?export=download&id=a%20b%26c");
  });

  it("upload Drive: PATCH col fileId, multipart create senza", () => {
    expect(driveUploadUrl("file123")).toBe("https://www.googleapis.com/upload/drive/v3/files/file123?uploadType=media");
    expect(driveUploadUrl(null)).toBe("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart");
  });

  it("upload OneDrive a percorso fisso nella cartella /SplitFree", () => {
    expect(oneDriveUploadUrl("g1")).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root:/SplitFree/splitfree_group_g1.json:/content",
    );
  });

  it("download OneDrive via shares API: base64url senza padding con prefisso u!", () => {
    const url = oneDriveShareDownloadUrl("https://1drv.ms/u/s!Aq3f9example");
    expect(url.startsWith("https://api.onedrive.com/v1.0/shares/u!")).toBe(true);
    expect(url.endsWith("/driveItem/content")).toBe(true);
    const token = url.slice("https://api.onedrive.com/v1.0/shares/u!".length, -"/driveItem/content".length);
    expect(token).toBe(toBase64Url("https://1drv.ms/u/s!Aq3f9example"));
    expect(token).not.toMatch(/[+/=]/);
  });
});

describe("uploadSharedDoc", () => {
  it("Drive con fileId noto: PATCH media sul file esistente", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ id: "file123" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await uploadSharedDoc("gdrive", "tok", { fileId: "file123" }, doc);
    expect(res).toEqual({ fileId: "file123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(driveUploadUrl("file123"));
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("Drive senza fileId: multipart create, fileId dalla risposta", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ id: "nuovo-id" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await uploadSharedDoc("gdrive", "tok", null, doc);
    expect(res).toEqual({ fileId: "nuovo-id" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(driveUploadUrl(null));
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("splitfree_group_g1.json");
  });

  it("OneDrive: PUT a percorso fisso, fileId dal campo id", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ id: "ITEM-ID-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await uploadSharedDoc("onedrive", "tok", null, doc);
    expect(res).toEqual({ fileId: "ITEM-ID-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(oneDriveUploadUrl("g1"));
    expect(init.method).toBe("PUT");
  });

  it("errore HTTP -> eccezione in italiano", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 403)));
    await expect(uploadSharedDoc("onedrive", "tok", null, doc)).rejects.toThrow("OneDrive: 403");
  });
});

describe("makeShared", () => {
  it("Drive: permesso anyone/writer, shareUrl null", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const res = await makeShared("gdrive", "tok", "file123");
    expect(res).toEqual({ shareUrl: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/drive/v3/files/file123/permissions");
    expect(JSON.parse(String(init.body))).toEqual({ role: "writer", type: "anyone" });
  });

  it("OneDrive: link anonimo di modifica, shareUrl dal webUrl", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ link: { webUrl: "https://1drv.ms/u/s!xyz" } }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await makeShared("onedrive", "tok", "ITEM-ID-1");
    expect(res).toEqual({ shareUrl: "https://1drv.ms/u/s!xyz" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/ITEM-ID-1/createLink");
    expect(JSON.parse(String(init.body))).toEqual({ type: "edit", scope: "anonymous" });
  });
});

describe("downloadSharedDoc (anonimo)", () => {
  it("Drive: scarica e valida il documento", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse(doc));
    vi.stubGlobal("fetch", fetchMock);

    const res = await downloadSharedDoc("gdrive", linkDrive);
    expect(res).toEqual(doc);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(driveDownloadUrl("file123"));
    // Nessun token: download anonimo.
    expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
  });

  it("OneDrive: usa la shares API sullo shareUrl", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse(doc));
    vi.stubGlobal("fetch", fetchMock);

    const res = await downloadSharedDoc("onedrive", linkOneDrive);
    expect(res).toEqual(doc);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(oneDriveShareDownloadUrl(linkOneDrive.shareUrl!));
  });

  it("404 -> file eliminato dall'amministratore", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 404)));
    await expect(downloadSharedDoc("gdrive", linkDrive)).rejects.toThrow(
      "Il file del gruppo è stato eliminato dall'amministratore.",
    );
  });

  it("altri errori HTTP -> messaggio chiaro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    await expect(downloadSharedDoc("gdrive", linkDrive)).rejects.toThrow("HTTP 500");
  });

  it("documento non valido -> errore esplicito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ciao: 1 })));
    await expect(downloadSharedDoc("gdrive", linkDrive)).rejects.toThrow("non è un documento di gruppo SplitFree valido");
  });

  it("OneDrive senza shareUrl -> errore senza chiamata di rete", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadSharedDoc("onedrive", { ...linkOneDrive, shareUrl: null })).rejects.toThrow("link di condivisione");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
