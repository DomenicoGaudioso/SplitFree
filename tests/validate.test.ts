import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail } from "@/domain/validate";

describe("isValidEmail", () => {
  it("accetta indirizzi validi", () => {
    expect(isValidEmail("giulia@esempio.com")).toBe(true);
    expect(isValidEmail("  a.b+c@sotto.dominio.it  ")).toBe(true);
  });
  it("rifiuta indirizzi non validi", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("non-una-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@dominio.com")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("toglie spazi e minuscolizza", () => {
    expect(normalizeEmail("  Giulia@ESEMPIO.com ")).toBe("giulia@esempio.com");
  });
});
