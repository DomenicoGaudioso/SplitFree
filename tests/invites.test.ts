import { describe, expect, it } from "vitest";
import { buildInviteLink, decodeInvite, encodeInvite, fromBase64Url, newInviteCode, toBase64Url, type InvitePayload } from "@/cloud/invites";

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
