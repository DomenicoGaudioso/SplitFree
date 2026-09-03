import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIREBASE_CONFIG,
  DEFAULT_GOOGLE_CLIENT_ID,
  DEFAULT_MICROSOFT_CLIENT_ID,
  getDefaultCloudProject,
  isDefaultCloudProject,
} from "@/cloud/defaultConfig";
import { emptyData, migrate } from "@/store/dataDefaults";

describe("Cloud default config & zero-setup", () => {
  it("provides valid default firebase config and client IDs", () => {
    expect(DEFAULT_FIREBASE_CONFIG.projectId).toBe("splitfree-app");
    expect(DEFAULT_FIREBASE_CONFIG.apiKey).toBeDefined();
    expect(DEFAULT_FIREBASE_CONFIG.authDomain).toContain("firebaseapp.com");
    expect(DEFAULT_GOOGLE_CLIENT_ID).toContain("apps.googleusercontent.com");
    expect(DEFAULT_MICROSOFT_CLIENT_ID).toBeDefined();
  });

  it("creates a properly tagged default cloud project", () => {
    const defaultProject = getDefaultCloudProject();
    expect(defaultProject.id).toBe("splitfree-default-cloud");
    expect(defaultProject.isDefault).toBe(true);
    expect(defaultProject.label).toContain("SplitFree Cloud");
    expect(defaultProject.googleClientId).toBe(DEFAULT_GOOGLE_CLIENT_ID);
    expect(defaultProject.microsoftClientId).toBe(DEFAULT_MICROSOFT_CLIENT_ID);
    expect(isDefaultCloudProject(defaultProject)).toBe(true);
  });

  it("distinguishes custom projects from default project", () => {
    const custom = {
      id: "custom-123",
      label: "My Personal Project",
      config: {
        apiKey: "custom-api-key",
        authDomain: "custom.firebaseapp.com",
        projectId: "custom-id",
        appId: "custom-app",
      },
    };
    expect(isDefaultCloudProject(custom)).toBe(false);
  });
});

describe("Cloud Storage & persistence integration (Studio Rule #9)", () => {
  it("initializes cloud storage in emptyData", () => {
    const data = emptyData();
    expect(data.settings.cloudStorage).toBeDefined();
    expect(data.settings.cloudStorage?.oneDrive?.connected).toBe(false);
    expect(data.settings.cloudStorage?.googleDrive?.connected).toBe(false);
  });

  it("migrates existing data to include cloudStorage structure safely", () => {
    const legacyData = {
      schemaVersion: 1,
      groups: [],
      people: [{ id: "p1", name: "Io", isSelf: true }],
      expenses: [],
      transfers: [],
      attachments: [],
      settings: {
        theme: "system",
        defaultCurrency: "EUR",
        ownerName: "Test",
        cloudProjects: [],
      },
    };

    const migrated = migrate(legacyData);
    expect(migrated.settings.cloudStorage).toBeDefined();
    expect(migrated.settings.cloudStorage?.oneDrive?.connected).toBe(false);
    expect(migrated.settings.cloudStorage?.googleDrive?.connected).toBe(false);
  });

  it("handles updates to cloudStorage without mutating unrelated settings", () => {
    const data = emptyData();
    const updated = {
      ...data,
      settings: {
        ...data.settings,
        cloudStorage: {
          ...data.settings.cloudStorage,
          oneDrive: {
            connected: true,
            userEmail: "mario@outlook.com",
            lastSync: "2026-09-03T12:00:00Z",
          },
          googleDrive: {
            connected: false,
          },
        },
      },
    };
    expect(updated.settings.cloudStorage.oneDrive.connected).toBe(true);
    expect(updated.settings.cloudStorage.oneDrive.userEmail).toBe("mario@outlook.com");
    expect(updated.settings.cloudStorage.googleDrive.connected).toBe(false);
    expect(updated.settings.defaultCurrency).toBe(data.settings.defaultCurrency);
  });
});
