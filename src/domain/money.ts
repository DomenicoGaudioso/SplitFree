export type CurrencyInfo = {
  code: string;
  symbol: string;
  name: string;
  decimals: number;
};

export const CURRENCIES: CurrencyInfo[] = [
  { code: "EUR", symbol: "€", name: "Euro", decimals: 2 },
  { code: "USD", symbol: "$", name: "Dollaro USA", decimals: 2 },
  { code: "GBP", symbol: "£", name: "Sterlina", decimals: 2 },
  { code: "CHF", symbol: "CHF", name: "Franco svizzero", decimals: 2 },
  { code: "JPY", symbol: "¥", name: "Yen", decimals: 0 },
  { code: "CAD", symbol: "C$", name: "Dollaro canadese", decimals: 2 },
  { code: "AUD", symbol: "A$", name: "Dollaro australiano", decimals: 2 },
  { code: "SEK", symbol: "kr", name: "Corona svedese", decimals: 2 },
  { code: "NOK", symbol: "kr", name: "Corona norvegese", decimals: 2 },
  { code: "DKK", symbol: "kr", name: "Corona danese", decimals: 2 },
  { code: "PLN", symbol: "zł", name: "Zloty", decimals: 2 },
  { code: "CZK", symbol: "Kč", name: "Corona ceca", decimals: 2 },
  { code: "HUF", symbol: "Ft", name: "Fiorino", decimals: 2 },
  { code: "TRY", symbol: "₺", name: "Lira turca", decimals: 2 },
  { code: "MXN", symbol: "MX$", name: "Peso messicano", decimals: 2 },
  { code: "BRL", symbol: "R$", name: "Real", decimals: 2 },
  { code: "INR", symbol: "₹", name: "Rupia", decimals: 2 },
  { code: "CNY", symbol: "¥", name: "Yuan", decimals: 2 },
  { code: "THB", symbol: "฿", name: "Baht", decimals: 2 },
  { code: "MAD", symbol: "MAD", name: "Dirham", decimals: 2 },
];

export function currencyInfo(code: string): CurrencyInfo {
  return (
    CURRENCIES.find((c) => c.code === code) ?? {
      code,
      symbol: code,
      name: code,
      decimals: 2,
    }
  );
}

export function decimalsOf(code: string): number {
  return currencyInfo(code).decimals;
}

/** Converte un numero decimale (es. 12.5) in unità minori (1250). */
export function toMinor(value: number, currency = "EUR"): number {
  const factor = 10 ** decimalsOf(currency);
  return Math.round(value * factor);
}

/** Converte unità minori in numero decimale. */
export function fromMinor(minor: number, currency = "EUR"): number {
  const factor = 10 ** decimalsOf(currency);
  return minor / factor;
}

/**
 * Interpreta una stringa digitata dall'utente ("12,50", "1.234,56", "12.5", "€ 12")
 * e restituisce le unità minori, oppure null se non è un numero valido.
 */
export function parseAmount(input: string, currency = "EUR"): number | null {
  let s = input.trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Il separatore che compare per ultimo è quello decimale.
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    normalized = s.replace(",", ".");
  } else {
    normalized = s;
  }
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === "." || normalized === "") {
    return null;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const minor = toMinor(value, currency);
  return negative ? -minor : minor;
}

/** Formatta unità minori come stringa locale, es. "1.234,56 €". */
export function formatMinor(
  minor: number,
  currency = "EUR",
  options: { signed?: boolean; compact?: boolean } = {}
): string {
  const info = currencyInfo(currency);
  const value = fromMinor(minor, currency);
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: info.code,
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
      currencyDisplay: "narrowSymbol",
    }).format(Math.abs(value));
  } catch {
    formatted = `${Math.abs(value).toFixed(info.decimals)} ${info.symbol}`;
  }
  if (options.signed) {
    if (minor > 0) return `+${formatted}`;
    if (minor < 0) return `-${formatted}`;
    return formatted;
  }
  return minor < 0 ? `-${formatted}` : formatted;
}

/** Formatta un numero decimale senza simbolo di valuta, es. "12,50". */
export function formatPlain(minor: number, currency = "EUR"): string {
  const info = currencyInfo(currency);
  const value = fromMinor(minor, currency);
  try {
    return new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
    }).format(value);
  } catch {
    return value.toFixed(info.decimals);
  }
}

/** Converte un importo da una valuta a un'altra applicando un tasso, con arrotondamento. */
export function convertMinor(
  minor: number,
  rate: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (rate === 1 && fromCurrency === toCurrency) return minor;
  const value = fromMinor(minor, fromCurrency) * rate;
  return toMinor(value, toCurrency);
}
