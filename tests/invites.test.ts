import { describe, expect, it } from "vitest";
import {
  buildInviteLink,
  decodeInvite,
  encodeInvite,
  fromBase64Url,
  isFileInvite,
  newInviteCode,
  toBase64Url,
  type FileInvitePayload,
  type InvitePayload,
} from "@/cloud/invites";

const config = {
  apiKey: "AIzaFakeKey123",
  authDomain: "esempio.firebaseapp.com",
  projectId: "esempio",
  appId: "1:123:web:abc",
};

function samplePayload(): InvitePayload {
  return {
    v: 1,
    code: newInviteCode(),
    groupId: "g1",
    groupName: "Vacanza in Sardegna 🏖️",
    emoji: "🏖️",
    currency: "EUR",
    config,
    googleClientId: "123.apps.googleusercontent.com",
  };
}

function sampleFilePayload(): FileInvitePayload {
  return {
    v: 2,
    provider: "onedrive",
    fileId: "ABC123!456",
    shareUrl: "https://1drv.ms/u/s!Aq3f9example",
    groupId: "g9",
    groupName: "Casa condivisa 🏠",
    emoji: "🏠",
    currency: "EUR",
    ownerName: "Anna",
  };
}

describe("base64url", () => {
  it("va e torna su testo con accenti ed emoji", () => {
    const text = "Ciao è già più único 🏖️🎉 {\"a\":1}";
    expect(fromBase64Url(toBase64Url(text))).toBe(text);
  });
  it("non produce +, / o = (sicuro nelle query string)", () => {
    const encoded = toBase64Url("????////++++====");
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("invite payload", () => {
  it("codifica e decodifica un invito completo", () => {
    const payload = samplePayload();
    const link = buildInviteLink(payload);
    expect(link.startsWith("splitfree://join?i=")).toBe(true);
    const decoded = decodeInvite(link);
    expect(decoded).toEqual(payload);
  });

  it("decodifica anche il solo blocco incollato senza link", () => {
    const payload = samplePayload();
    const blob = encodeInvite(payload);
    expect(decodeInvite(blob)).toEqual(payload);
  });

  it("rifiuta testo non valido o incompleto", () => {
    expect(decodeInvite("non è un invito")).toBeNull();
    expect(decodeInvite("")).toBeNull();
    expect(decodeInvite(toBase64Url(JSON.stringify({ v: 1 })))).toBeNull();
  });

  it("genera codici invito distinti", () => {
    const codes = new Set(Array.from({ length: 20 }, () => newInviteCode()));
    expect(codes.size).toBe(20);
    expect([...codes].every((c) => /^[0-9a-f]{16}$/.test(c))).toBe(true);
  });
});

describe("invite v2 (condivisione via file)", () => {
  it("round-trip: link -> decode restituisce il payload identico", () => {
    const payload = sampleFilePayload();
    const link = buildInviteLink(payload);
    expect(link.startsWith("splitfree://join?i=")).toBe(true);
    expect(decodeInvite(link)).toEqual(payload);
  });

  it("decodifica anche il solo blocco incollato, shareUrl null incluso", () => {
    const payload: FileInvitePayload = { ...sampleFilePayload(), provider: "gdrive", shareUrl: null };
    expect(decodeInvite(encodeInvite(payload))).toEqual(payload);
  });

  it("isFileInvite discrimina v1 e v2", () => {
    expect(isFileInvite(sampleFilePayload())).toBe(true);
    expect(isFileInvite(samplePayload())).toBe(false);
    expect(isFileInvite(null)).toBe(false);
    expect(isFileInvite(undefined)).toBe(false);
    expect(isFileInvite(decodeInvite(buildInviteLink(sampleFilePayload())))).toBe(true);
    expect(isFileInvite(decodeInvite(buildInviteLink(samplePayload())))).toBe(false);
  });

  it("rifiuta inviti v2 malformati", () => {
    expect(decodeInvite(toBase64Url(JSON.stringify({ v: 2 })))).toBeNull();
    expect(decodeInvite(toBase64Url(JSON.stringify({ ...sampleFilePayload(), provider: "dropbox" })))).toBeNull();
    expect(decodeInvite(toBase64Url(JSON.stringify({ ...sampleFilePayload(), fileId: "" })))).toBeNull();
    expect(decodeInvite(toBase64Url(JSON.stringify({ ...sampleFilePayload(), shareUrl: 42 })))).toBeNull();
  });
});
