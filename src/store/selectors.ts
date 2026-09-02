import { useMemo } from "react";
import { useStore } from "./store";
import type { Expense, Group, Person, PersonBalance, Settlement, Transfer } from "@/domain/types";
import { computeBalances, computePairwiseDebts } from "@/domain/balances";
import { simplifyDebts } from "@/domain/simplify";

export function usePeople(): Person[] {
  return useStore((s) => s.data.people);
}

export function usePeopleMap(): Map<string, Person> {
  const people = usePeople();
  return useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
}

export function useSelf(): Person | undefined {
  return useStore((s) => s.data.people.find((p) => p.isSelf));
}

export function useGroups(): Group[] {
  return useStore((s) => s.data.groups);
}

export function useGroup(id: string | undefined): Group | undefined {
  return useStore((s) => (id ? s.data.groups.find((g) => g.id === id) : undefined));
}

export function useExpenses(): Expense[] {
  return useStore((s) => s.data.expenses);
}

export function useExpense(id: string | undefined): Expense | undefined {
  return useStore((s) => (id ? s.data.expenses.find((e) => e.id === id) : undefined));
}

export function useGroupExpenses(groupId: string | undefined): Expense[] {
  const all = useExpenses();
  return useMemo(
    () =>
      groupId
        ? all.filter((e) => e.groupId === groupId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt)))
        : [],
    [all, groupId]
  );
}

export function useGroupSettlements(groupId: string | undefined): Settlement[] {
  const all = useStore((s) => s.data.settlements);
  return useMemo(
    () => (groupId ? all.filter((s) => s.groupId === groupId).sort((a, b) => (a.date < b.date ? 1 : -1)) : []),
    [all, groupId]
  );
}

export type GroupFinance = {
  balances: PersonBalance[];
  simplified: Transfer[];
  pairwise: Transfer[];
  totalMinor: number;
};

export function useGroupFinance(group: Group | undefined): GroupFinance {
  const expenses = useGroupExpenses(group?.id);
  const settlements = useGroupSettlements(group?.id);
  return useMemo(() => {
    if (!group) return { balances: [], simplified: [], pairwise: [], totalMinor: 0 };
    const balances = computeBalances(group, expenses, settlements);
    return {
      balances,
      simplified: simplifyDebts(balances),
      pairwise: computePairwiseDebts(group, expenses, settlements),
      totalMinor: balances.reduce((a, b) => a + b.owedMinor, 0),
    };
  }, [group, expenses, settlements]);
}

/** Per ogni gruppo attivo, il bilancio netto dell'utente (nella valuta del gruppo). */
export function useMyBalancesByGroup(): { group: Group; netMinor: number; simplified: Transfer[] }[] {
  const groups = useGroups();
  const expenses = useExpenses();
  const settlements = useStore((s) => s.data.settlements);
  const self = useSelf();
  return useMemo(() => {
    if (!self) return [];
    return groups
      .filter((g) => !g.archivedAt)
      .map((group) => {
        const balances = computeBalances(group, expenses, settlements);
        const mine = balances.find((b) => b.personId === self.id);
        return { group, netMinor: mine?.netMinor ?? 0, simplified: simplifyDebts(balances) };
      });
  }, [groups, expenses, settlements, self]);
}

export function useExpenseAttachments(expenseId: string | undefined) {
  const all = useStore((s) => s.data.attachments);
  return useMemo(() => (expenseId ? all.filter((a) => a.expenseId === expenseId) : []), [all, expenseId]);
}
