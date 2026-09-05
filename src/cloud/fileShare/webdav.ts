import type { WebDavConfig } from "@/domain/types";

export type { WebDavConfig } from "@/domain/types";

/**
 * Client WebDAV generico (pCloud, Koofr, Nextcloud…), Node-safe: solo fetch,
 * nessun import dello store né di moduli Expo, così è testabile con vitest
 * mockando `fetch`.
 *
 * Autenticazione HTTP Basic (username + password): nessuna registrazione app
 * né flusso OAuth. Si consiglia sempre una app-password dedicata.
 * Tutti gli errori tornano come Error con messaggi in italiano, mai stack tecnici.
 */

/** Timeout di ogni richiesta: oltre i 10s il server si considera irraggiungibile. */
export const WEBDAV_TIMEOUT_MS = 10_000;

/** Cartella remota che ospita i file di SplitFree. */
export const WEBDAV_DIR = "/SplitFree";

// ---------------------------------------------------------------------------
// Helper puri (esportati per i test)
// ---------------------------------------------------------------------------

/** Header Authorization Basic per le credenziali date. */
export function webdavBasicAuth(cfg: WebDavConfig): string {
  return `Basic ${btoa(`${cfg.username}:${cfg.password}`)}`;
}

/**
 * Compone l'URL completo di una risorsa: normalizza gli slash fra URL base e
 * percorso (che inizia sempre con "/", es. `/SplitFree/splitfree_data.json`).
 */
export function webdavJoinUrl(cfg: WebDavConfig, path: string): string {
  const base = cfg.url.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

// ---------------------------------------------------------------------------
// HTTP interno
// ---------------------------------------------------------------------------

function webdavErrorForStatus(status: number, context: string): Error {
  if (status === 401 || status === 403) {
    return new Error(`WebDAV: credenziali errate o accesso negato (${context}). Controlla username e password.`);
  }
  if (status === 404) {
    return new Error(`WebDAV: risorsa non trovata (${context}).`);
  }
  if (status === 507) {
    return new Error("WebDAV: spazio esaurito sul server.");
  }
  return new Error(`WebDAV: errore del server (HTTP ${status}) durante ${context}.`);
}

type FetchOptions = {
  method: string;
  body?: string;
  headers?: Record<string, string>;
};

async function webdavFetch(cfg: WebDavConfig, path: string, opts: FetchOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBDAV_TIMEOUT_MS);
  try {
    return await fetch(webdavJoinUrl(cfg, path), {
      method: opts.method,
      headers: { Authorization: webdavBasicAuth(cfg), ...opts.headers },
      body: opts.body,
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new Error(
      aborted
        ? "WebDAV: il server non risponde (timeout). Controlla la connessione e riprova."
        : "WebDAV: server irraggiungibile. Controlla l'indirizzo del server e la connessione."
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Operazioni
// ---------------------------------------------------------------------------

/** Crea una cartella remota (MKCOL). 405 (esiste già) e 409 gestito dal chiamante non sono errori qui. */
export async function webdavMkcol(cfg: WebDavConfig, dirPath: string): Promise<void> {
  const res = await webdavFetch(cfg, dirPath, { method: "MKCOL" });
  // 201 = creata; 405 = esiste già; 409 = manca la cartella padre (ci pensa webdavPut).
  if (res.ok || res.status === 405 || res.status === 409) return;
  throw webdavErrorForStatus(res.status, `la creazione della cartella ${dirPath}`);
}

/**
 * Scrive (o sovrascrive) un file. Se il server risponde 409 (cartella padre
 * mancante) crea le cartelle intermedie con MKCOL e riprova una volta.
 */
export async function webdavPut(cfg: WebDavConfig, path: string, content: string): Promise<void> {
  let res = await webdavFetch(cfg, path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: content,
  });

  if (res.status === 409) {
    // Crea le cartelle padre una alla volta, dalla radice verso il file.
    const segments = path.split("/").filter(Boolean);
    segments.pop(); // il nome del file non è una cartella
    let current = "";
    for (const segment of segments) {
      current += `/${segment}`;
      await webdavMkcol(cfg, current);
    }
    res = await webdavFetch(cfg, path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: content,
    });
  }

  if (!res.ok) throw webdavErrorForStatus(res.status, `il salvataggio di ${path}`);
}

export type WebDavFile = {
  text: string;
  /** ISO dell'ultima modifica remota (header Last-Modified, o Date come fallback). */
  modifiedTime: string;
};

/** Scarica un file; ritorna null se non esiste (404). */
export async function webdavGet(cfg: WebDavConfig, path: string): Promise<WebDavFile | null> {
  const res = await webdavFetch(cfg, path, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw webdavErrorForStatus(res.status, `la lettura di ${path}`);
  const text = await res.text();
  const lastModified = res.headers.get("Last-Modified");
  const parsed = lastModified ? Date.parse(lastModified) : NaN;
  return {
    text,
    modifiedTime: Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString(),
  };
}

/**
 * Data di ultima modifica di una risorsa senza scaricarla (PROPFIND Depth: 0,
 * parsing di <getlastmodified>). Se il PROPFIND fallisce, ripiega su una GET.
 * Ritorna null se la risorsa non esiste.
 */
export async function webdavPropfind(cfg: WebDavConfig, path: string): Promise<string | null> {
  try {
    const res = await webdavFetch(cfg, path, {
      method: "PROPFIND",
      headers: { Depth: "0", "Content-Type": "application/xml" },
      body: `<?xml version="1.0" encoding="utf-8" ?>\n<propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>`,
    });
    if (res.status === 404) return null;
    if (!res.ok && res.status !== 207) throw webdavErrorForStatus(res.status, `la verifica di ${path}`);
    const xml = await res.text();
    const match = xml.match(/<[^>]*getlastmodified[^>]*>([^<]+)<\//i);
    if (match) {
      const parsed = Date.parse(match[1].trim());
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
    return null;
  } catch (err) {
    // Fallback: una GET fornisce comunque la Last-Modified dell'header.
    if (err instanceof Error && /non trovata/.test(err.message)) return null;
    const file = await webdavGet(cfg, path);
    return file ? file.modifiedTime : null;
  }
}

/**
 * Verifica la connessione (pulsante "verifica" nelle Impostazioni / onboarding):
 * PROPFIND sulla root del server. Mai eccezioni: { ok, error? }.
 */
export async function webdavTestConnection(cfg: WebDavConfig): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.url || !cfg.username || !cfg.password) {
    return { ok: false, error: "Compila server, username e password prima di verificare." };
  }
  try {
    const res = await webdavFetch(cfg, "/", {
      method: "PROPFIND",
      headers: { Depth: "0" },
    });
    if (res.ok || res.status === 207) return { ok: true };
    return { ok: false, error: webdavErrorForStatus(res.status, "la verifica della connessione").message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
