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
import { useStore, type ExpenseInput, type GroupInput } from "./store";

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
  const groupId = group?.id;

  return useMemo<GroupActions>(() => {
    if (cloud) {
      return {
        addExpense: (input) => cloudAddExpense(cloud, input),
        updateExpense: (id, input) => cloudUpdateExpense(cloud, id, input),
        deleteExpense: (id) => cloudDeleteExpense(cloud, id),
        addSettlement: (input) => cloudAddSettlement(cloud, input),
        deleteSettlement: (id) => cloudDeleteSettlement(cloud, id),
        updateInfo: (patch) => cloudUpdateGroupInfo(cloud, patch),
        archive: (archived) => cloudArchiveGroup(cloud, archived),
      };
    }
    return {
      addExpense: async (input) => addExpenseLocal(input).id,
      updateExpense: async (id, input) => updateExpenseLocal(id, input),
      deleteExpense: async (id) => deleteExpenseLocal(id),
      addSettlement: async (input) => addSettlementLocal({ ...input, groupId: groupId! }).id,
      deleteSettlement: async (id) => deleteSettlementLocal(id),
      updateInfo: async (patch) => updateGroupLocal(groupId!, patch),
      archive: async (archived) => archiveGroupLocal(groupId!, archived),
    };
  }, [
    cloud,
    groupId,
    addExpenseLocal,
    updateExpenseLocal,
    deleteExpenseLocal,
    addSettlementLocal,
    deleteSettlementLocal,
    updateGroupLocal,
    archiveGroupLocal,
  ]);
}
