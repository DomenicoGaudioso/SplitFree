import { useMemo } from "react";
import type { Group, Settlement } from "@/domain/types";
import {
  cloudAddExpense,
  cloudAddSettlement,
  cloudArchiveGroup,
  cloudDeleteExpense,
  cloudDeleteSettlement,
  cloudUpdateExpense,
  cloudUpdateGroupInfo,
} from "@/cloud/cloudGroup";
import {
  formatExpenseDeletedMessage,
  formatExpenseEditedMessage,
  formatExpenseMessage,
  formatSettlementMessage,
  resolveNotifyTarget,
  sendTelegramMessage,
} from "@/cloud/telegram";
import { pushSharedGroup } from "@/cloud/fileShare/sync";
import { useStore, type ExpenseInput, type GroupInput } from "./store";

/**
 * Invia una notifica Telegram in fire-and-forget: mai bloccare l'UI, mai propagare errori.
 * La destinazione la decide resolveNotifyTarget: gruppo Telegram del gruppo condiviso
 * se esiste, altrimenti la chat globale delle Impostazioni.
 */
function notifyTelegram(group: Group | undefined | null, text: string): void {
  const target = resolveNotifyTarget(group, useStore.getState().data.settings.telegram);
  if (!target) return;
  void sendTelegramMessage(target, text).catch(() => {});
}

/** Nome di chi esegue l'azione (la persona marcata isSelf). */
function selfName(): string {
  const d = useStore.getState().data;
  return d.people.find((p) => p.isSelf)?.name || d.settings.ownerName || "Io";
}

function personName(id: string): string {
  return useStore.getState().data.people.find((p) => p.id === id)?.name ?? "?";
}

/** Nomi delle persone dagli id, deduplicati preservando l'ordine. */
function personNames(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(personName(id));
  }
  return out;
}

export type GroupActions = {
  addExpense: (input: ExpenseInput) => Promise<string>;
  updateExpense: (id: string, input: ExpenseInput) => Promise<void>;
  /** `title` (facoltativo) viene dal chiamante per la notifica di eliminazione; se manca si cerca nello store. */
  deleteExpense: (id: string, title?: string) => Promise<void>;
  addSettlement: (input: Omit<Settlement, "id" | "createdAt" | "groupId">) => Promise<string>;
  deleteSettlement: (id: string) => Promise<void>;
  updateInfo: (patch: Partial<Pick<GroupInput, "name" | "emoji" | "description" | "currency">>) => Promise<void>;
  archive: (archived: boolean) => Promise<void>;
};

/**
 * Azioni di scrittura per UN gruppo, indirizzate automaticamente allo store
 * locale o a Firestore a seconda che il gruppo sia locale o condiviso.
 * Così le schermate (form spesa, rimborso, dettaglio gruppo) non devono
 * sapere quale dei due stanno usando.
 */
export function useGroupActions(group: Group | undefined): GroupActions {
  const addExpenseLocal = useStore((s) => s.addExpense);
  const updateExpenseLocal = useStore((s) => s.updateExpense);
  const deleteExpenseLocal = useStore((s) => s.deleteExpense);
  const addSettlementLocal = useStore((s) => s.addSettlement);
  const deleteSettlementLocal = useStore((s) => s.deleteSettlement);
  const updateGroupLocal = useStore((s) => s.updateGroup);
  const archiveGroupLocal = useStore((s) => s.archiveGroup);

  const cloud = group?.cloud ?? null;
  const fileShare = group?.fileShare ?? null;
  const groupId = group?.id;
  const groupName = group?.name ?? "";
  const groupCurrency = group?.currency ?? "EUR";

  return useMemo<GroupActions>(() => {
    const notifyExpenseAdded = (input: ExpenseInput) =>
      notifyTelegram(
        group,
        formatExpenseMessage({
          actorName: selfName(),
          title: input.title.trim(),
          amountMinor: input.amountMinor,
          currency: input.currency,
          payerNames: personNames(input.payers.map((p) => p.personId)),
          participantNames: personNames(input.splits.map((s) => s.personId)),
        })
      );
    const notifyExpenseEdited = (input: ExpenseInput) =>
      notifyTelegram(
        group,
        formatExpenseEditedMessage({
          actorName: selfName(),
          title: input.title.trim(),
          amountMinor: input.amountMinor,
          currency: input.currency,
        })
      );
    /** Il titolo serve dopo la cancellazione: lo passa il chiamante o si legge dallo store prima di eliminare. */
    const notifyExpenseDeleted = (id: string, title?: string) => {
      const resolved = title ?? useStore.getState().data.expenses.find((e) => e.id === id)?.title ?? "la spesa";
      notifyTelegram(group, formatExpenseDeletedMessage({ actorName: selfName(), title: resolved }));
    };
    const notifySettlement = (input: Omit<Settlement, "id" | "createdAt" | "groupId">) =>
      notifyTelegram(
        group,
        formatSettlementMessage({
          actorName: selfName(),
          toName: personName(input.toPersonId),
          amountMinor: input.amountMinor,
          currency: groupCurrency,
          groupName,
        })
      );

    if (cloud) {
      return {
        addExpense: async (input) => {
          const id = await cloudAddExpense(cloud, input);
          notifyExpenseAdded(input);
          return id;
        },
        updateExpense: async (id, input) => {
          await cloudUpdateExpense(cloud, id, input);
          notifyExpenseEdited(input);
        },
        deleteExpense: async (id, title) => {
          notifyExpenseDeleted(id, title);
          await cloudDeleteExpense(cloud, id);
        },
        addSettlement: async (input) => {
          const id = await cloudAddSettlement(cloud, input);
          notifySettlement(input);
          return id;
        },
        deleteSettlement: (id) => cloudDeleteSettlement(cloud, id),
        updateInfo: (patch) => cloudUpdateGroupInfo(cloud, patch),
        archive: (archived) => cloudArchiveGroup(cloud, archived),
      };
    }
    if (fileShare) {
      // Gruppo condiviso via file: le scritture vanno allo store locale (cache
      // offline), poi un push debounced le sincronizza sul file condiviso.
      const sync = () => void pushSharedGroup(groupId!);
      return {
        addExpense: async (input) => {
          const id = addExpenseLocal(input).id;
          notifyExpenseAdded(input);
          sync();
          return id;
        },
        updateExpense: async (id, input) => {
          updateExpenseLocal(id, input);
          notifyExpenseEdited(input);
          sync();
        },
        deleteExpense: async (id, title) => {
          notifyExpenseDeleted(id, title);
          await deleteExpenseLocal(id);
          sync();
        },
        addSettlement: async (input) => {
          const id = addSettlementLocal({ ...input, groupId: groupId! }).id;
          notifySettlement(input);
          sync();
          return id;
        },
        deleteSettlement: async (id) => {
          deleteSettlementLocal(id);
          sync();
        },
        updateInfo: async (patch) => {
          updateGroupLocal(groupId!, patch);
          sync();
        },
        archive: async (archived) => {
          archiveGroupLocal(groupId!, archived);
          sync();
        },
      };
    }
    return {
      addExpense: async (input) => {
        const id = addExpenseLocal(input).id;
        notifyExpenseAdded(input);
        return id;
      },
      updateExpense: async (id, input) => {
        updateExpenseLocal(id, input);
        notifyExpenseEdited(input);
      },
      deleteExpense: async (id, title) => {
        notifyExpenseDeleted(id, title);
        await deleteExpenseLocal(id);
      },
      addSettlement: async (input) => {
        const id = addSettlementLocal({ ...input, groupId: groupId! }).id;
        notifySettlement(input);
        return id;
      },
      deleteSettlement: async (id) => deleteSettlementLocal(id),
      updateInfo: async (patch) => updateGroupLocal(groupId!, patch),
      archive: async (archived) => archiveGroupLocal(groupId!, archived),
    };
  }, [
    cloud,
    fileShare,
    group,
    groupId,
    groupName,
    groupCurrency,
    addExpenseLocal,
    updateExpenseLocal,
    deleteExpenseLocal,
    addSettlementLocal,
    deleteSettlementLocal,
    updateGroupLocal,
    archiveGroupLocal,
  ]);
}
