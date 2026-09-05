import { describe, expect, it, vi } from "vitest";
import { applySharedDocToData } from "@/cloud/fileShare/apply";
import { buildDoc } from "@/cloud/fileShare/doc";
import {
  getLastSyncError,
  isHttpConflict,
  pullSharedGroup,
  pushSharedGroup,
  type FileShareSyncDeps,
} from "@/cloud/fileShare/sync";
import type { SharedGroupDoc } from "@/cloud/fileShare/types";
import type { Expense, FileShareLink, Group, Person, Settlement } from "@/domain/types";
import { emptyData } from "@/store/dataDefaults";

const NOW = "2026-09-04T12:00:00.000Z";

const link: FileShareLink = {
  provider: "onedrive",
  fileId: "ITEM-1",
  shareUrl: "https://1drv.ms/u/s!xyz",
  ownerName: "Anna",
  lastSyncedAt: null,
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
  fileShare: link,
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

const settlement: Settlement = {
  id: "s1",
  groupId: "g1",
  fromPersonId: "p1",
  toPersonId: "p2",
  amountMinor: 500,
  date: "2026-01-11",
  note: "",
  createdAt: "2026-01-11T09:00:00.000Z",
};

describe("applySharedDocToData", () => {
  it("upsert persone/spese/rimborsi del gruppo, preserva isSelf e gli altri gruppi", () => {
    const local = emptyData();
    local.people = [self];
    local.groups = [
      group,
      { ...group, id: "g2", name: "Altro", fileShare: null },
    ];
    const otherExpense = { ...expense("e9", "Altro gruppo", "2026-01-10T10:00:00.000Z"), groupId: "g2" };
    local.expenses = [expense("e1", "Vecchia", "2026-01-01T10:00:00.000Z"), otherExpense];

    const doc = buildDoc(group, [self], [expense("e2", "Nuova", "2026-02-01T10:00:00.000Z")], [settlement]);
    const next = applySharedDocToData(local, "g1", doc, NOW);

    // La persona esiste già: campi aggiornati ma isSelf preservato.
    const p1 = next.people.find((p) => p.id === "p1");
    expect(p1?.isSelf).toBe(true);
    expect(p1?.name).toBe("Anna");
    // Spese del gruppo sostituite dal doc; quelle di g2 intatte.
    expect(next.expenses.filter((e) => e.groupId === "g1").map((e) => e.id)).toEqual(["e2"]);
    expect(next.expenses.filter((e) => e.groupId === "g2").map((e) => e.id)).toEqual(["e9"]);
    expect(next.settlements.map((s) => s.id)).toEqual(["s1"]);
    // Gruppo aggiornato, lastSyncedAt valorizzato; l'altro gruppo non toccato.
    const g1 = next.groups.find((g) => g.id === "g1");
    expect(g1?.fileShare?.lastSyncedAt).toBe(NOW);
    expect(next.groups.find((g) => g.id === "g2")?.name).toBe("Altro");
  });

  it("i record tombstonati spariscono dal gruppo", () => {
    const local = emptyData();
    local.people = [self];
    local.groups = [group];
    local.expenses = [expense("e1", "Da cancellare", "2026-01-01T10:00:00.000Z")];

    // Il doc remoto non contiene più e1 (tombstonata) ma ha e2.
    const doc = buildDoc(group, [self], [expense("e2", "Sopravvissuta", "2026-02-01T10:00:00.000Z")], []);
    doc.tombstones = { e1: "2026-02-02T10:00:00.000Z" };

    const next = applySharedDocToData(local, "g1", doc, NOW);
    expect(next.expenses.map((e) => e.id)).toEqual(["e2"]);
  });

  it("gruppo inesistente: dati invariati", () => {
    const local = emptyData();
    const doc = buildDoc(group, [self], [], []);
    expect(applySharedDocToData(local, "gX", doc, NOW)).toBe(local);
  });
});

describe("pullSharedGroup / pushSharedGroup", () => {
  function makeDeps(overrides: Partial<FileShareSyncDeps>, slices?: { people: Person[]; expenses: Expense[]; settlements: Settlement[] }) {
    const applied: SharedGroupDoc[] = [];
    const deps: FileShareSyncDeps = {
      getGroup: vi.fn(() => group),
      getSlices: vi.fn(() => slices ?? { people: [self], expenses: [expense("e1", "Locale", "2026-03-01T10:00:00.000Z")], settlements: [] }),
      applyDoc: vi.fn((_g, doc) => applied.push(doc)),
      getToken: vi.fn(async () => "token-valido"),
      download: vi.fn(async () => buildDoc(group, [self], [], [])),
      upload: vi.fn(async () => ({ fileId: link.fileId })),
      ...overrides,
    };
    return { deps, applied };
  }

  it("pull: fonde remoto e locale e applica il risultato", async () => {
    const remote = buildDoc(group, [self], [expense("eR", "Remota", "2026-03-02T10:00:00.000Z")], []);
    const { deps, applied } = makeDeps({ download: vi.fn(async () => remote) });

    const res = await pullSharedGroup("g1", deps);
    expect(res.ok).toBe(true);
    expect(applied).toHaveLength(1);
    // Il merge contiene sia la spesa locale sia quella remota.
    expect(Object.keys(applied[0].expenses).sort()).toEqual(["e1", "eR"]);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("pull: gruppo senza fileShare -> errore", async () => {
    const { deps } = makeDeps({ getGroup: vi.fn(() => ({ ...group, fileShare: null })) });
    const res = await pullSharedGroup("g1", deps);
    expect(res.ok).toBe(false);
  });

  it("pull: errore di rete -> ok:false, mai eccezioni", async () => {
    const { deps } = makeDeps({ download: vi.fn(async () => { throw new Error("HTTP 500"); }) });
    const res = await pullSharedGroup("g1", deps);
    expect(res).toEqual({ ok: false, error: "HTTP 500" });
  });

  it("push: scarica, fonde, carica e applica il documento fuso", async () => {
    const remote = buildDoc(group, [self], [expense("eR", "Remota", "2026-03-02T10:00:00.000Z")], []);
    const { deps, applied } = makeDeps({ download: vi.fn(async () => remote) });

    const res = await pushSharedGroup("g1", deps);
    expect(res).toEqual({ ok: true });
    expect(deps.upload).toHaveBeenCalledTimes(1);
    const uploadedDoc = vi.mocked(deps.upload).mock.calls[0][3];
    expect(Object.keys(uploadedDoc.expenses).sort()).toEqual(["e1", "eR"]);
    expect(applied).toHaveLength(1);
    expect(getLastSyncError("g1")).toEqual({ readOnly: false, error: null });
  });

  it("push senza token -> readOnly, nessun upload", async () => {
    const { deps } = makeDeps({
      getToken: vi.fn(async () => { throw new Error("Account OneDrive scaduto: riconnettilo dalle Impostazioni."); }),
    });
    const res = await pushSharedGroup("g1", deps);
    expect(res.ok).toBe(false);
    expect(res.readOnly).toBe(true);
    expect(deps.upload).not.toHaveBeenCalled();
    expect(getLastSyncError("g1")?.readOnly).toBe(true);
  });

  it("push: su conflitto 409 rilegge il remoto e riprova una volta", async () => {
    const remote = buildDoc(group, [self], [expense("eR", "Remota", "2026-03-02T10:00:00.000Z")], []);
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error("Errore durante il salvataggio su OneDrive: 409"))
      .mockResolvedValueOnce({ fileId: link.fileId });
    const { deps } = makeDeps({ upload, download: vi.fn(async () => remote) });

    const res = await pushSharedGroup("g1", deps);
    expect(res).toEqual({ ok: true });
    expect(upload).toHaveBeenCalledTimes(2);
    // Il secondo upload contiene la spesa remota riletta dopo il conflitto.
    expect(Object.keys(upload.mock.calls[1][3].expenses).sort()).toEqual(["e1", "eR"]);
  });

  it("push: errore non di conflitto -> ok:false senza retry", async () => {
    const upload = vi.fn(async () => { throw new Error("Errore durante il salvataggio su OneDrive: 403"); });
    const { deps } = makeDeps({ upload });
    const res = await pushSharedGroup("g1", deps);
    expect(res.ok).toBe(false);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("isHttpConflict", () => {
  it("riconosce 409 e 412, ignora gli altri", () => {
    expect(isHttpConflict(new Error("Errore: 409"))).toBe(true);
    expect(isHttpConflict(new Error("412 Precondition Failed"))).toBe(true);
    expect(isHttpConflict(new Error("HTTP 500"))).toBe(false);
    expect(isHttpConflict("rete assente")).toBe(false);
  });
});
