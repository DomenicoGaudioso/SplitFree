import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatAuthError,
  getPersistedAuthUser,
  signInAsGuest,
  signInWithGoogleAccount,
  signInWithMicrosoftAccount,
  signOutOfProject,
} from "@/cloud/auth";
import type { FirebaseWebConfig } from "@/domain/types";

// Mock AsyncStorage in-memory
const mockStorage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
    setItem: vi.fn((key: string, val: string) => {
      mockStorage.set(key, val);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      mockStorage.delete(key);
      return Promise.resolve();
    }),
  },
}));

// Mock Firebase
vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  initializeAuth: vi.fn(() => ({})),
  getReactNativePersistence: vi.fn(() => ({})),
  signInAnonymously: vi.fn(() => Promise.reject(new Error("auth/invalid-api-key"))),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
  onAuthStateChanged: vi.fn(() => () => {}),
  updateProfile: vi.fn(() => Promise.resolve()),
}));

describe("Social & 1-Click Authentication (Google & Microsoft)", () => {
  const dummyConfig: FirebaseWebConfig = {
    apiKey: "test-api-key",
    authDomain: "splitfree-test.firebaseapp.com",
    projectId: "test-project-123",
    appId: "test-app-id",
  };

  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  it("successfully signs in with Google account and persists session", async () => {
    const user = await signInWithGoogleAccount(dummyConfig, "mario.rossi@gmail.com", "Mario Rossi");

    expect(user.email).toBe("mario.rossi@gmail.com");
    expect(user.name).toBe("Mario Rossi");
    expect(user.provider).toBe("google");
    expect(user.uid).toMatch(/^google_/);
    expect(user.isAnonymous).toBe(false);

    // Persisted in storage
    const persisted = await getPersistedAuthUser(dummyConfig);
    expect(persisted).not.toBeNull();
    expect(persisted?.email).toBe("mario.rossi@gmail.com");
    expect(persisted?.provider).toBe("google");
  });

  it("successfully signs in with Microsoft account and persists session", async () => {
    const user = await signInWithMicrosoftAccount(
      dummyConfig,
      "ing.gaudioso@outlook.it",
      "Domenico Gaudioso"
    );

    expect(user.email).toBe("ing.gaudioso@outlook.it");
    expect(user.name).toBe("Domenico Gaudioso");
    expect(user.provider).toBe("microsoft");
    expect(user.uid).toMatch(/^(ms_|microsoft_)/);
    expect(user.isAnonymous).toBe(false);

    const persisted = await getPersistedAuthUser(dummyConfig);
    expect(persisted?.email).toBe("ing.gaudioso@outlook.it");
    expect(persisted?.provider).toBe("microsoft");
  });

  it("clears local persisted session when signing out", async () => {
    await signInWithGoogleAccount(dummyConfig, "test@gmail.com", "Tester");
    expect(await getPersistedAuthUser(dummyConfig)).not.toBeNull();

    await signOutOfProject(dummyConfig);
    expect(await getPersistedAuthUser(dummyConfig)).toBeNull();
  });

  it("falls back gracefully on guest sign in even when firebase API key is invalid", async () => {
    const guestUser = await signInAsGuest(dummyConfig, "Ospite 1");

    expect(guestUser.name).toBe("Ospite 1");
    expect(guestUser.provider).toBe("anonymous");
    expect(guestUser.isAnonymous).toBe(true);

    const persisted = await getPersistedAuthUser(dummyConfig);
    expect(persisted?.name).toBe("Ospite 1");
  });

  it("formats auth errors to friendly user-facing messages in Italian", () => {
    expect(formatAuthError({ code: "auth/invalid-api-key" })).toContain("Chiave di accesso al cloud");
    expect(formatAuthError(new Error("invalid_client"))).toContain("Client ID");
    expect(formatAuthError(new Error("AADSTS700016"))).toContain("Client ID");
    expect(formatAuthError({ code: "auth/unauthorized-domain" })).toBeDefined();
  });
});
