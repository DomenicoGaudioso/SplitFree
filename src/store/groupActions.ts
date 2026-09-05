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
  formatExpenseMessage,
  formatSettlementMessage,
  sendTelegramMessage,
} from "@/cloud/telegram";
import { pushSharedGroup } from "@/cloud/fileShare/sync";
import { useStore, type ExpenseInput, type GroupInput } from "./store";

/** Invia una notifica Telegram in fire-and-forget: mai bloccare l'UI, mai propagare errori. */
function notifyTelegram(text: string): void {
  const tg = useStore.getState().data.settings.telegram;
  if (!tg) return;
  void sendTelegramMessage(tg, text).catch(() => {});
}

/** Nome di chi esegue l'azione (la persona marcata isSelf). */
function selfName(): string {
  const d = useStore.getState().data;
  return d.people.find((p) => p.isSelf)?.name || d.settings.ownerName || "Io";
}

function personName(id: string): string {
  return useStore.getState().data.people.find((p) => p.id === id)?.name ?? "?";
}

export type GroupActions = {
  addExpense: (input: ExpenseInput) => Promise<string>;
  updateExpense: (id: string, input: ExpenseInput) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
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
    const notifyExpense = (input: ExpenseInput) =>
      notifyTelegram(
        formatExpenseMessage({
          actorName: selfName(),
          title: input.title.trim(),
          amountMinor: input.amountMinor,
          currency: input.currency,
          groupName,
        })
      );
    const notifySettlement = (input: Omit<Settlement, "id" | "createdAt" | "groupId">) =>
      notifyTelegram(
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
          notifyExpense(input);
          return id;
        },
        updateExpense: (id, input) => cloudUpdateExpense(cloud, id, input),
        deleteExpense: (id) => cloudDeleteExpense(cloud, id),
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
          notifyExpense(input);
          sync();
          return id;
        },
        updateExpense: async (id, input) => {
          updateExpenseLocal(id, input);
          sync();
        },
        deleteExpense: async (id) => {
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
        notifyExpense(input);
        return id;
      },
      updateExpense: async (id, input) => updateExpenseLocal(id, input),
      deleteExpense: async (id) => deleteExpenseLocal(id),
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
