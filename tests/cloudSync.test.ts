import { describe, expect, it, vi } from "vitest";
import { isTokenUsable } from "@/cloud/cloudTokens";
import {
  activeDataProvider,
  isRemoteNewer,
  pullAppDataIfNewer,
  type PullDeps,
  type RemoteAppData,
} from "@/cloud/dataSync";
import { emptyData } from "@/store/dataDefaults";
import type { AppData, Settings } from "@/domain/types";

const NOW = Date.parse("2026-09-04T12:00:00.000Z");

function settingsWith(cloudStorage: Settings["cloudStorage"]): Pick<Settings, "cloudStorage"> {
  return { cloudStorage };
}

describe("isTokenUsable", () => {
  it("rifiuta un servizio senza access token", () => {
    expect(isTokenUsable(undefined, NOW)).toBe(false);
    expect(isTokenUsable({ accessToken: null }, NOW)).toBe(false);
  });

  it("accetta un token senza data di scadenza (flusso implicit legacy)", () => {
    expect(isTokenUsable({ accessToken: "tok", expiresAt: null }, NOW)).toBe(true);
  });

  it("accetta un token con scadenza nel futuro oltre il margine di 60s", () => {
    expect(isTokenUsable({ accessToken: "tok", expiresAt: "2026-09-04T13:00:00.000Z" }, NOW)).toBe(true);
  });

  it("considera scaduto un token che scade entro il margine di 60s", () => {
    expect(isTokenUsable({ accessToken: "tok", expiresAt: "2026-09-04T12:00:30.000Z" }, NOW)).toBe(false);
  });

  it("considera scaduto un token con scadenza nel passato", () => {
    expect(isTokenUsable({ accessToken: "tok", expiresAt: "2026-09-04T10:00:00.000Z" }, NOW)).toBe(false);
  });
});

describe("activeDataProvider", () => {
  it("ritorna null senza servizi connessi", () => {
    expect(activeDataProvider(settingsWith(undefined))).toBeNull();
    expect(
      activeDataProvider(
        settingsWith({ googleDrive: { connected: false }, oneDrive: { connected: false } })
      )
    ).toBeNull();
  });

  it("ignora un servizio connesso ma senza access token (connessione rapida solo-email)", () => {
    expect(
      activeDataProvider(
        settingsWith({ googleDrive: { connected: true, accessToken: null } })
      )
    ).toBeNull();
  });

  it("sceglie l'unico provider connesso con token", () => {
    expect(
      activeDataProvider(
        settingsWith({ oneDrive: { connected: true, accessToken: "tok" } })
      )
    ).toBe("onedrive");
  });

  it("con entrambi connessi preferisce quello con lastSync più recente", () => {
    const settings = settingsWith({
      googleDrive: { connected: true, accessToken: "g", lastSync: "2026-09-01T10:00:00.000Z" },
      oneDrive: { connected: true, accessToken: "o", lastSync: "2026-09-03T10:00:00.000Z" },
    });
    expect(activeDataProvider(settings)).toBe("onedrive");

    const inverted = settingsWith({
      googleDrive: { connected: true, accessToken: "g", lastSync: "2026-09-04T10:00:00.000Z" },
      oneDrive: { connected: true, accessToken: "o", lastSync: "2026-09-03T10:00:00.000Z" },
    });
    expect(activeDataProvider(inverted)).toBe("gdrive");
  });

  it("senza lastSync su nessuno dei due, sceglie in modo deterministico Google Drive", () => {
    const settings = settingsWith({
      googleDrive: { connected: true, accessToken: "g" },
      oneDrive: { connected: true, accessToken: "o" },
    });
    expect(activeDataProvider(settings)).toBe("gdrive");
  });
});

describe("isRemoteNewer", () => {
  it("senza lastSync il remoto è sempre più recente", () => {
    expect(isRemoteNewer("2026-09-01T00:00:00.000Z", null)).toBe(true);
    expect(isRemoteNewer("2026-09-01T00:00:00.000Z", undefined)).toBe(true);
  });

  it("confronta le date di modifica", () => {
    expect(isRemoteNewer("2026-09-04T12:00:00.000Z", "2026-09-04T11:00:00.000Z")).toBe(true);
    expect(isRemoteNewer("2026-09-04T10:00:00.000Z", "2026-09-04T11:00:00.000Z")).toBe(false);
  });
});

describe("pullAppDataIfNewer", () => {
  function makeDeps(overrides: Partial<PullDeps>, localData?: AppData) {
    const data = localData ?? emptyData();
    const deps: PullDeps = {
      getToken: vi.fn(async () => "token-valido"),
      download: vi.fn(async () => null),
      upload: vi.fn(async () => "2026-09-04T12:00:00.000Z"),
      getData: () => data,
      replaceAllData: vi.fn(),
      updateLastSync: vi.fn(),
      ...overrides,
    };
    return { deps, data };
  }

  it("se il file remoto non esiste, carica i dati locali e aggiorna lastSync", async () => {
    const { deps, data } = makeDeps({});
    const result = await pullAppDataIfNewer("gdrive", deps);
    expect(result).toBe("uploaded");
    expect(deps.upload).toHaveBeenCalledWith("gdrive", "token-valido", data);
    expect(deps.replaceAllData).not.toHaveBeenCalled();
    expect(deps.updateLastSync).toHaveBeenCalledWith("gdrive", "2026-09-04T12:00:00.000Z");
  });

  it("senza lastSync locale scarica e sostituisce i dati con quelli remoti", async () => {
    const remoteData = { ...emptyData(), people: [{ id: "p1" }] } as unknown as AppData;
    const remote: RemoteAppData = { data: remoteData, modifiedTime: "2026-09-04T12:00:00.000Z" };
    const { deps } = makeDeps({ download: vi.fn(async () => remote) });
    const result = await pullAppDataIfNewer("onedrive", deps);
    expect(result).toBe("pulled");
    expect(deps.replaceAllData).toHaveBeenCalledWith(remoteData);
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.updateLastSync).toHaveBeenCalledWith("onedrive", "2026-09-04T12:00:00.000Z");
  });

  it("se il remoto è più vecchio dell'ultima sync locale, non tocca nulla", async () => {
    const local = emptyData();
    local.settings.cloudStorage = {
      googleDrive: { connected: true, accessToken: "g", lastSync: "2026-09-04T12:00:00.000Z" },
    };
    const remote: RemoteAppData = { data: emptyData(), modifiedTime: "2026-09-03T08:00:00.000Z" };
    const { deps } = makeDeps({ download: vi.fn(async () => remote) }, local);
    const result = await pullAppDataIfNewer("gdrive", deps);
    expect(result).toBe("skipped");
    expect(deps.replaceAllData).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.updateLastSync).not.toHaveBeenCalled();
  });

  it("se il remoto è più recente dell'ultima sync locale, scarica e sostituisce", async () => {
    const local = emptyData();
    local.settings.cloudStorage = {
      oneDrive: { connected: true, accessToken: "o", lastSync: "2026-09-01T08:00:00.000Z" },
    };
    const remote: RemoteAppData = { data: emptyData(), modifiedTime: "2026-09-04T08:00:00.000Z" };
    const { deps } = makeDeps({ download: vi.fn(async () => remote) }, local);
    const result = await pullAppDataIfNewer("onedrive", deps);
    expect(result).toBe("pulled");
    expect(deps.replaceAllData).toHaveBeenCalledTimes(1);
  });
});
