import { describe, expect, it, vi } from "vitest";

// Mock expo-clipboard prima degli altri import
vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(),
  getStringAsync: vi.fn(),
}));

// Mock Firestore
vi.mock("firebase/firestore", () => ({
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    commit: vi.fn(async () => {}),
  })),
  doc: vi.fn(),
  collection: vi.fn(),
}));

vi.mock("@/cloud/firestore", () => ({
  firestoreFor: vi.fn(() => ({})),
}));

vi.mock("@/cloud/schema", () => ({
  memberDoc: vi.fn(),
  expenseDoc: vi.fn(),
  settlementDoc: vi.fn(),
}));

// Mock Firebase dependencies
vi.mock("@/cloud/firebaseClient", () => ({
  initFirebaseApp: vi.fn(() => ({})),
  getCloudFirestore: vi.fn(() => ({})),
  getCloudAuth: vi.fn(() => ({})),
}));

vi.mock("@/cloud/auth", () => ({
  ensureAuthUser: vi.fn(async (_config, name) => ({
    uid: "test-uid-123",
    name: name || "Test User",
    email: "test@example.com",
    provider: "guest",
  })),
  getExistingAuthUser: vi.fn(() => null),
}));

vi.mock("@/cloud/cloudGroup", () => ({
  cloudCreateGroup: vi.fn(async (config, ownerUid, input) => ({
    remoteId: "rem-123",
    role: "admin",
    config,
    ownerUid,
  })),
  cloudCreateInvite: vi.fn(async (link) => ({
    v: 1,
    code: "fakecode123",
    groupId: link.remoteId,
    groupName: "Vacanza",
    emoji: "🏛️",
    currency: "EUR",
    config: link.config,
  })),
}));

vi.mock("react-native", () => ({
  Share: {
    share: vi.fn(async () => ({ action: "sharedAction" })),
  },
  Platform: {
    OS: "ios",
  },
}));

import { shareGroupOneClick } from "@/cloud/oneClickShare";
import type { Group, Person, Expense, Settlement } from "@/domain/types";

describe("shareGroupOneClick", () => {
  const sampleGroup: Group = {
    id: "loc-grp-1",
    name: "Vacanza a Roma",
    emoji: "🏛️",
    description: "",
    currency: "EUR",
    memberIds: ["p1", "p2"],
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const samplePeople: Person[] = [
    {
      id: "p1",
      name: "Mario Rossi",
      email: null,
      color: "#4F46E5",
      isSelf: true,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "p2",
      name: "Luigi Verdi",
      email: null,
      color: "#10B981",
      isSelf: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("converte un gruppo locale in cloud e genera il link di condivisione con 1 click", async () => {
    let linkedRemoteId: string | null = null;
    const res = await shareGroupOneClick({
      group: sampleGroup,
      people: samplePeople,
      expenses: [],
      settlements: [],
      self: samplePeople[0],
      onCloudLinked: (updatedGroup) => {
        linkedRemoteId = updatedGroup.cloud?.remoteId ?? null;
      },
      skipNativeShare: true,
    });

    expect(res.ok).toBe(true);
    expect(res.link?.startsWith("splitfree://join?i=")).toBe(true);
    expect(res.remoteId).toBe("rem-123");
    expect(linkedRemoteId).toBe("rem-123");
  });

  it("permette la condivisione diretta di un gruppo già cloud senza ricrearlo", async () => {
    const cloudGroup: Group = {
      ...sampleGroup,
      cloud: {
        remoteId: "already-cloud-id",
        ownerUid: "test-uid-123",
        config: { apiKey: "k", authDomain: "d", projectId: "p", appId: "a" },
      },
    };

    const res = await shareGroupOneClick({
      group: cloudGroup,
      people: samplePeople,
      expenses: [],
      settlements: [],
      self: samplePeople[0],
      skipNativeShare: true,
    });

    expect(res.ok).toBe(true);
    expect(res.remoteId).toBe("already-cloud-id");
    expect(res.link?.startsWith("splitfree://join?i=")).toBe(true);
  });
});
