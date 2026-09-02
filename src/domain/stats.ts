import { convertMinor } from "./money";
import { lastMonths, monthKey } from "./dates";
import type { Expense, Group } from "./types";

export type MonthPoint = {
  month: string;
  totalMinor: number;
  mineMinor: number;
};

export type CategoryPoint = {
  categoryId: string;
  totalMinor: number;
  mineMinor: number;
  count: number;
  share: number; // 0..1 sul totale
};

export type PersonPoint = {
  personId: string;
  paidMinor: number;
  owedMinor: number;
  share: number;
};

export type StatsSummary = {
  currency: string;
  totalMinor: number;
  mineMinor: number;
  count: number;
  averageMinor: number;
  monthly: MonthPoint[];
  categories: CategoryPoint[];
  people: PersonPoint[];
  skippedForCurrency: number;
};

export type StatsOptions = {
  /** Valuta di output; le spese di gruppi in altra valuta vengono convertite con `rates` (chiave "FROM>TO"). */
  currency: string;
  rates?: Record<string, { rate: number }>;
  selfId: string | null;
  months?: number;
  /** Filtra per gruppo; null = tutti. */
  groupId?: string | null;
  /** Filtra per intervallo di date ISO (inclusivo). */
  fromDate?: string;
  toDate?: string;
};

export function computeStats(
  expenses: Expense[],
  groups: Group[],
  options: StatsOptions
): StatsSummary {
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const months = lastMonths(options.months ?? 12);
  const monthMap = new Map<string, MonthPoint>(
    months.map((m) => [m, { month: m, totalMinor: 0, mineMinor: 0 }])
  );
  const catMap = new Map<string, CategoryPoint>();
  const peopleMap = new Map<string, PersonPoint>();
  let total = 0;
  let mine = 0;
  let count = 0;
  let skipped = 0;

  for (const e of expenses) {
    if (options.groupId && e.groupId !== options.groupId) continue;
    if (options.fromDate && e.date < options.fromDate) continue;
    if (options.toDate && e.date > options.toDate) continue;
    const group = groupsById.get(e.groupId);
    if (!group) continue;

    // Prima verso la valuta del gruppo, poi verso la valuta di output.
    const toGroup = (minor: number) =>
      convertMinor(minor, e.exchangeRate, e.currency, group.currency);
    let toOut: (minor: number) => number;
    if (group.currency === options.currency) {
      toOut = toGroup;
    } else {
      const entry = options.rates?.[`${group.currency}>${options.currency}`];
      if (!entry) {
        skipped += 1;
        continue;
      }
      toOut = (minor) => convertMinor(toGroup(minor), entry.rate, group.currency, options.currency);
    }

    const amount = toOut(e.amountMinor);
    const mineSplit = options.selfId
      ? e.splits.find((s) => s.personId === options.selfId)
      : undefined;
    const mineAmount = mineSplit ? toOut(mineSplit.amountMinor) : 0;

    total += amount;
    mine += mineAmount;
    count += 1;

    const mk = monthKey(e.date);
    const mp = monthMap.get(mk);
    if (mp) {
      mp.totalMinor += amount;
      mp.mineMinor += mineAmount;
    }

    const cp = catMap.get(e.categoryId) ?? {
      categoryId: e.categoryId,
      totalMinor: 0,
      mineMinor: 0,
      count: 0,
      share: 0,
    };
    cp.totalMinor += amount;
    cp.mineMinor += mineAmount;
    cp.count += 1;
    catMap.set(e.categoryId, cp);

    for (const p of e.payers) {
      const pp = peopleMap.get(p.personId) ?? {
        personId: p.personId,
        paidMinor: 0,
        owedMinor: 0,
        share: 0,
      };
      pp.paidMinor += toOut(p.amountMinor);
      peopleMap.set(p.personId, pp);
    }
    for (const s of e.splits) {
      const pp = peopleMap.get(s.personId) ?? {
        personId: s.personId,
        paidMinor: 0,
        owedMinor: 0,
        share: 0,
      };
      pp.owedMinor += toOut(s.amountMinor);
      peopleMap.set(s.personId, pp);
    }
  }

  const categories = [...catMap.values()]
    .map((c) => ({ ...c, share: total > 0 ? c.totalMinor / total : 0 }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
  const people = [...peopleMap.values()]
    .map((p) => ({ ...p, share: total > 0 ? p.owedMinor / total : 0 }))
    .sort((a, b) => b.owedMinor - a.owedMinor);

  return {
    currency: options.currency,
    totalMinor: total,
    mineMinor: mine,
    count,
    averageMinor: count > 0 ? Math.round(total / count) : 0,
    monthly: months.map((m) => monthMap.get(m)!),
    categories,
    people,
    skippedForCurrency: skipped,
  };
}
