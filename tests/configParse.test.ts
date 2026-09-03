import { describe, expect, it } from "vitest";
import { parseFirebaseConfigSnippet } from "@/cloud/configParse";

describe("parseFirebaseConfigSnippet", () => {
  it("legge lo snippet JavaScript copiato dalla console Firebase", () => {
    const snippet = `
      const firebaseConfig = {
        apiKey: "AIzaSyFAKE1234567890",
        authDomain: "splitfree-demo.firebaseapp.com",
        projectId: "splitfree-demo",
        storageBucket: "splitfree-demo.appspot.com",
        messagingSenderId: "123456789012",
        appId: "1:123456789012:web:abcdef1234567890"
      };
    `;
    expect(parseFirebaseConfigSnippet(snippet)).toEqual({
      apiKey: "AIzaSyFAKE1234567890",
      authDomain: "splitfree-demo.firebaseapp.com",
      projectId: "splitfree-demo",
      appId: "1:123456789012:web:abcdef1234567890",
      storageBucket: "splitfree-demo.appspot.com",
      messagingSenderId: "123456789012",
    });
  });

  it("legge anche JSON con virgolette doppie sulle chiavi", () => {
    const json = JSON.stringify({
      apiKey: "k",
      authDomain: "d",
      projectId: "p",
      appId: "a",
    });
    expect(parseFirebaseConfigSnippet(json)).toEqual({
      apiKey: "k",
      authDomain: "d",
      projectId: "p",
      appId: "a",
      storageBucket: undefined,
      messagingSenderId: undefined,
    });
  });

  it("rifiuta testo incompleto", () => {
    expect(parseFirebaseConfigSnippet("apiKey: 'solo questo'")).toBeNull();
    expect(parseFirebaseConfigSnippet("")).toBeNull();
  });
});
