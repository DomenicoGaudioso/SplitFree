/**
 * Categorie di spesa e riconoscimento automatico dell'icona dal titolo.
 * Le icone sono nomi del set Ionicons (@expo/vector-icons).
 */

export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

export const CATEGORIES: Category[] = [
  { id: "food", name: "Ristoranti", icon: "restaurant", color: "#F97316" },
  { id: "groceries", name: "Spesa", icon: "cart", color: "#84CC16" },
  { id: "drinks", name: "Bar e drink", icon: "beer", color: "#EAB308" },
  { id: "transport", name: "Trasporti", icon: "bus", color: "#3B82F6" },
  { id: "fuel", name: "Carburante", icon: "car", color: "#0EA5E9" },
  { id: "travel", name: "Viaggi", icon: "airplane", color: "#8B5CF6" },
  { id: "lodging", name: "Alloggio", icon: "bed", color: "#A855F7" },
  { id: "home", name: "Casa", icon: "home", color: "#22C55E" },
  { id: "utilities", name: "Bollette", icon: "flash", color: "#F59E0B" },
  { id: "entertainment", name: "Svago", icon: "film", color: "#EC4899" },
  { id: "shopping", name: "Shopping", icon: "bag-handle", color: "#F43F5E" },
  { id: "health", name: "Salute", icon: "medkit", color: "#EF4444" },
  { id: "sport", name: "Sport", icon: "fitness", color: "#14B8A6" },
  { id: "gifts", name: "Regali", icon: "gift", color: "#D946EF" },
  { id: "education", name: "Istruzione", icon: "school", color: "#6366F1" },
  { id: "pets", name: "Animali", icon: "paw", color: "#A16207" },
  { id: "tech", name: "Tecnologia", icon: "laptop", color: "#64748B" },
  { id: "other", name: "Altro", icon: "receipt", color: "#94A3B8" },
];

export const DEFAULT_CATEGORY_ID = "other";

export function categoryById(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

type Rule = { icon: string; categoryId: string; keywords: string[] };

/**
 * Regole in ordine di priorità: la prima parola chiave trovata nel titolo
 * decide icona e categoria. Le parole chiave sono confrontate senza accenti,
 * in minuscolo e come prefisso di parola ("pizz" trova "pizza", "pizzeria").
 */
const RULES: Rule[] = [
  { icon: "pizza", categoryId: "food", keywords: ["pizz"] },
  { icon: "fast-food", categoryId: "food", keywords: ["burger", "hamburger", "mcdonald", "kebab", "panin", "fast food", "hot dog", "patatin"] },
  { icon: "ice-cream", categoryId: "food", keywords: ["gelat", "ice cream", "gelateria"] },
  { icon: "cafe", categoryId: "drinks", keywords: ["caff", "cappuccin", "colazion", "breakfast", "coffee", "bar ", "te ", "tea"] },
  { icon: "beer", categoryId: "drinks", keywords: ["birr", "beer", "pub", "aperitiv", "spritz", "drink", "cocktail", "happy hour"] },
  { icon: "wine", categoryId: "drinks", keywords: ["vin", "wine", "enotec", "prosecc", "champagne", "cantina"] },
  { icon: "restaurant", categoryId: "food", keywords: ["ristor", "restaurant", "cena", "pranz", "trattor", "osteri", "sushi", "cibo", "food", "mangiar", "tavola", "brunch", "dinner", "lunch", "pesce", "carne", "grigli", "bbq", "barbecue", "pasta", "delivery", "glovo", "deliveroo", "just eat", "takeaway", "asporto", "pizzata"] },
  { icon: "cart", categoryId: "groceries", keywords: ["spesa", "supermerc", "conad", "coop", "esselunga", "lidl", "carrefour", "eurospin", "pam", "despar", "grocer", "alimentar", "mercato", "market", "aldi", "iper", "md "] },
  { icon: "nutrition", categoryId: "groceries", keywords: ["frutta", "verdur", "ortofrutt", "pane", "forno", "panific", "macell", "pescheri"] },
  { icon: "car", categoryId: "fuel", keywords: ["benzin", "carburant", "gasolio", "diesel", "rifornim", "fuel", "gas station", "eni", "q8", "esso", "ip ", "tamoil", "autostrad", "pedagg", "casello", "telepass", "parcheggi", "parking", "park", "autonoleggi", "rent a car", "noleggio auto", "auto", "macchina", "car "] },
  { icon: "train", categoryId: "transport", keywords: ["treno", "train", "trenitalia", "italo", "frecc", "regionale", "stazione", "metro", "subway"] },
  { icon: "bus", categoryId: "transport", keywords: ["bus", "pullman", "autobus", "flixbus", "tram", "atac", "atm", "navett", "trasport", "biglietto"] },
  { icon: "car-sport", categoryId: "transport", keywords: ["taxi", "uber", "bolt", "ncc", "lyft", "freenow", "cabify"] },
  { icon: "boat", categoryId: "transport", keywords: ["traghett", "nave", "ferry", "barca", "boat", "vaporett", "aliscaf", "crocier"] },
  { icon: "bicycle", categoryId: "transport", keywords: ["bici", "bike", "monopatt", "scooter", "lime", "e-bike"] },
  { icon: "airplane", categoryId: "travel", keywords: ["volo", "aereo", "flight", "ryanair", "easyjet", "wizz", "ita airways", "lufthansa", "aeroport", "airport", "vueling", "bagagli"] },
  { icon: "bed", categoryId: "lodging", keywords: ["hotel", "albergo", "airbnb", "booking", "b&b", "bnb", "ostello", "hostel", "pernott", "camera", "resort", "villaggio", "campeggi", "agriturism", "casa vacanz", "appartament", "alloggio", "soggiorn"] },
  { icon: "map", categoryId: "travel", keywords: ["viaggio", "vacanz", "trip", "travel", "escursion", "tour", "gita", "weekend", "musei", "museo", "guida", "ingress", "visita"] },
  { icon: "home", categoryId: "home", keywords: ["affitto", "rent", "casa", "condomini", "mutuo", "spese condom", "ikea", "arred", "mobili", "trasloc", "pulizi", "detersiv", "lavander"] },
  { icon: "flash", categoryId: "utilities", keywords: ["bollett", "luce", "elettric", "enel", "energia", "corrente", "utenz"] },
  { icon: "flame", categoryId: "utilities", keywords: ["gas ", "gas", "riscald", "metano", "gpl"] },
  { icon: "water", categoryId: "utilities", keywords: ["acqua", "idric", "water"] },
  { icon: "wifi", categoryId: "utilities", keywords: ["internet", "wifi", "fibra", "tim", "vodafone", "iliad", "wind", "fastweb", "telefon", "ricarica", "sim", "cellular", "abbonament"] },
  { icon: "tv", categoryId: "entertainment", keywords: ["netflix", "spotify", "disney", "prime video", "dazn", "sky", "now tv", "apple tv", "youtube", "streaming", "hbo", "paramount"] },
  { icon: "film", categoryId: "entertainment", keywords: ["cinema", "film", "movie", "teatro", "theater", "spettacol", "uci", "multisala"] },
  { icon: "musical-notes", categoryId: "entertainment", keywords: ["concert", "musica", "music", "festival", "disco", "club", "serata", "dj", "karaoke"] },
  { icon: "game-controller", categoryId: "entertainment", keywords: ["videogioc", "playstation", "ps5", "xbox", "nintendo", "steam", "game", "gioc", "bowling", "biliard", "escape", "lasertag", "luna park", "gardaland"] },
  { icon: "ticket", categoryId: "entertainment", keywords: ["bigliett", "ticket", "evento", "event", "partita", "stadio", "mostra"] },
  { icon: "fitness", categoryId: "sport", keywords: ["palestr", "gym", "fitness", "allenam", "crossfit", "yoga", "pilates", "piscin", "nuoto", "corsa", "running", "marat"] },
  { icon: "football", categoryId: "sport", keywords: ["calcio", "calcett", "football", "soccer", "padel", "tennis", "basket", "volley", "pallavol", "sci", "ski", "snowboard", "skipass", "trekking", "arrampic", "golf", "sport"] },
  { icon: "medkit", categoryId: "health", keywords: ["farmac", "pharma", "medic", "dottor", "dentist", "visita", "ospedal", "analisi", "ticket sanit", "salute", "health", "ottic", "occhial", "lenti", "cerott"] },
  { icon: "gift", categoryId: "gifts", keywords: ["regal", "gift", "complean", "birthday", "natale", "christmas", "festa", "party", "anniversar", "laurea", "matrimon", "wedding", "fiori", "bouquet", "torta"] },
  { icon: "bag-handle", categoryId: "shopping", keywords: ["shopping", "vestit", "abbigl", "scarp", "zara", "h&m", "amazon", "acquist", "negozi", "outlet", "borsa", "giacc", "maglia", "jeans", "decathlon", "profum", "cosmet", "sephora", "trucc"] },
  { icon: "school", categoryId: "education", keywords: ["libr", "book", "scuol", "univers", "corso", "lezion", "tasse univ", "esame", "master", "cancell", "quadern"] },
  { icon: "paw", categoryId: "pets", keywords: ["cane", "gatto", "veterinar", "croccantin", "pet", "animal", "toelett"] },
  { icon: "laptop", categoryId: "tech", keywords: ["computer", "laptop", "pc", "notebook", "iphone", "smartphone", "telefono", "cuffie", "cavo", "caric", "software", "app ", "licenz", "cloud", "google", "icloud", "dropbox", "chatgpt", "elettronic", "mediaworld", "unieuro", "tv ", "televis"] },
  { icon: "cut", categoryId: "other", keywords: ["parrucch", "barbier", "estetist", "taglio", "unghie", "massagg", "spa ", "terme", "beauty"] },
  { icon: "cash", categoryId: "other", keywords: ["prelievo", "contant", "cash", "bancomat", "prestito", "anticipo", "rimborso", "banca", "commission"] },
  { icon: "construct", categoryId: "home", keywords: ["riparaz", "idraulic", "elettricist", "manutenz", "ferrament", "brico", "leroy", "attrezz", "lavori"] },
  { icon: "shield-checkmark", categoryId: "other", keywords: ["assicura", "insurance", "polizza", "bollo", "revision", "tassa", "multa", "tributi", "imu", "tari"] },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type TitleGuess = { icon: string; categoryId: string; matched: string | null };

/**
 * Deduce icona e categoria dal titolo di una spesa.
 * Se il titolo non contiene parole chiave note, usa la categoria indicata
 * (o "altro").
 */
export function guessFromTitle(title: string, fallbackCategoryId = DEFAULT_CATEGORY_ID): TitleGuess {
  const text = ` ${normalize(title)} `;
  if (text.trim().length > 0) {
    for (const rule of RULES) {
      for (const kw of rule.keywords) {
        const k = normalize(kw);
        // Prefisso di parola: deve essere preceduto da inizio o spazio/punteggiatura.
        const idx = text.indexOf(k);
        if (idx < 0) continue;
        const before = text[idx - 1] ?? " ";
        if (/[a-z0-9]/.test(before)) {
          // La chiave compare dentro un'altra parola: cerchiamo un'altra occorrenza.
          const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(k)}`);
          if (!re.test(text)) continue;
        }
        return { icon: rule.icon, categoryId: rule.categoryId, matched: kw.trim() };
      }
    }
  }
  const cat = categoryById(fallbackCategoryId);
  return { icon: cat.icon, categoryId: cat.id, matched: null };
}

/** Icona da mostrare per una spesa: dedotta dal titolo, altrimenti quella della categoria. */
export function iconForExpense(title: string, categoryId: string): string {
  const guess = guessFromTitle(title, categoryId);
  return guess.matched ? guess.icon : categoryById(categoryId).icon;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
