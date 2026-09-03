import { useEffect, useMemo, useRef } from "react";
import { useStore } from "./store";
import type { Expense, Group, Person, PersonBalance, Settlement, Transfer } from "@/domain/types";
import { computeBalances, computePairwiseDebts } from "@/domain/balances";
import { simplifyDebts } from "@/domain/simplify";
import { useCloudGroup, type CloudGroupState } from "@/cloud/cloudGroup";
import type { CloudAuthUser } from "@/cloud/auth";

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

export function useGroupFinance(group: Group | undefined, expenses: Expense[], settlements: Settlement[]): GroupFinance {
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

export type ResolvedGroup = {
  /** Il gruppo con i campi "live": per un gruppo condiviso, nome/emoji/valuta arrivano da Firestore. */
  group: Group | undefined;
  people: Map<string, Person>;
  expenses: Expense[];
  settlements: Settlement[];
  /** Solo per i gruppi condivisi: stato del caricamento/della connessione. */
  loading: boolean;
  error: CloudGroupState["error"];
  /** Solo per i gruppi condivisi: utente autenticato sul progetto (undefined = in corso, null = non collegato). */
  authUser: CloudAuthUser | null | undefined;
};

/**
 * Punto di accesso unico ai dati di UN gruppo, locale o condiviso.
 * Per i gruppi condivisi legge in tempo reale da Firestore; per quelli
 * locali si comporta come i selettori esistenti.
 */
export function useResolvedGroup(id: string | undefined): ResolvedGroup {
  const localGroup = useGroup(id);
  const isCloud = !!localGroup?.cloud;
  const cloud = useCloudGroup(localGroup?.cloud ?? null, id ?? "");
  const localExpenses = useGroupExpenses(isCloud ? undefined : id);
  const localSettlements = useGroupSettlements(isCloud ? undefined : id);
  const localPeople = usePeopleMap();

  return useMemo<ResolvedGroup>(() => {
    if (!localGroup) {
      return { group: undefined, people: new Map(), expenses: [], settlements: [], loading: false, error: null, authUser: undefined };
    }
    if (!localGroup.cloud) {
      return {
        group: localGroup,
        people: localPeople,
        expenses: localExpenses,
        settlements: localSettlements,
        loading: false,
        error: null,
        authUser: undefined,
      };
    }
    const mergedGroup: Group = cloud.doc
      ? {
          ...localGroup,
          name: cloud.doc.name,
          emoji: cloud.doc.emoji,
          description: cloud.doc.description,
          currency: cloud.doc.currency,
          archivedAt: cloud.doc.archivedAt,
          updatedAt: cloud.doc.updatedAt,
          memberIds: cloud.people.map((p) => p.id),
        }
      : { ...localGroup, memberIds: cloud.people.map((p) => p.id) };
    return {
      group: mergedGroup,
      people: new Map(cloud.people.map((p) => [p.id, p])),
      expenses: cloud.expenses,
      settlements: cloud.settlements,
      loading: cloud.loading,
      error: cloud.error,
      authUser: cloud.authUser,
    };
  }, [localGroup, cloud, localExpenses, localSettlements, localPeople]);
}

/**
 * Tiene aggiornato il puntatore locale di un gruppo condiviso (nome, emoji,
 * numero di membri...) ogni volta che questa schermata legge dati freschi da
 * Firestore, così le liste (Home, Gruppi) restano ragionevolmente aggiornate
 * anche se non si collegano direttamente al cloud.
 */
export function useSyncCloudPointer(resolved: ResolvedGroup): void {
  const lastWritten = useRef<string | null>(null);
  useEffect(() => {
    const group = resolved.group;
    if (!group?.cloud) return;
    const signature = JSON.stringify({ name: group.name, emoji: group.emoji, description: group.description, currency: group.currency, memberIds: group.memberIds, archivedAt: group.archivedAt });
    if (signature === lastWritten.current) return;
    lastWritten.current = signature;
    useStore.getState().upsertCloudGroupPointer(group);
  }, [resolved.group]);
}

export function useExpenseAttachments(expenseId: string | undefined) {
  const all = useStore((s) => s.data.attachments);
  return useMemo(() => (expenseId ? all.filter((a) => a.expenseId === expenseId) : []), [all, expenseId]);
}
