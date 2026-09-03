import { useEffect, useState } from "react";
import {
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import type { Expense, GroupCloudLink, Person, Settlement } from "@/domain/types";
import type { ExpenseInput, GroupInput } from "@/store/store";
import { useCloudAuthUser, type CloudAuthUser } from "./auth";
import { firestoreFor } from "./firestore";
import {
  expenseDoc,
  expensesCol,
  groupDoc,
  inviteDoc,
  memberDoc,
  membersCol,
  settlementDoc,
  settlementsCol,
  type CloudGroupDoc,
  type CloudInviteDoc,
  type CloudMemberDoc,
} from "./schema";
import { newInviteCode, type InvitePayload } from "./invites";

function memberToPerson(uid: string, m: CloudMemberDoc, selfUid: string | null): Person {
  return {
    id: uid,
    name: m.name,
    color: m.color,
    isSelf: uid === selfUid,
    archivedAt: null,
    createdAt: m.joinedAt,
    updatedAt: m.joinedAt,
  };
}

export type CloudGroupState = {
  loading: boolean;
  error: "not-signed-in" | "not-found" | "permission" | "other" | null;
  authUser: CloudAuthUser | null | undefined;
  doc: CloudGroupDoc | null;
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
};

const EMPTY: CloudGroupState = {
  loading: false,
  error: null,
  authUser: undefined,
  doc: null,
  people: [],
  expenses: [],
  settlements: [],
};

/**
 * Sottoscrizione in tempo reale a un gruppo condiviso: gruppo, membri, spese
 * e rimborsi arrivano da Firestore e si aggiornano da soli quando qualcuno
 * (anche su un altro telefono) modifica qualcosa.
 */
export function useCloudGroup(link: GroupCloudLink | null | undefined, localGroupId: string): CloudGroupState {
  const authUser = useCloudAuthUser(link?.config ?? null);
  const [state, setState] = useState<CloudGroupState>(EMPTY);

  useEffect(() => {
    if (!link) {
      setState(EMPTY);
      return;
    }
    if (authUser === undefined) {
      setState((s) => ({ ...s, loading: true, authUser }));
      return;
    }
    if (authUser === null) {
      setState({ ...EMPTY, authUser: null, error: "not-signed-in" });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null, authUser }));
    const db = firestoreFor(link.config);
    const uid = authUser.uid;
    const unsubs: Unsubscribe[] = [];

    unsubs.push(
      onSnapshot(
        groupDoc(db, link.remoteId),
        (snap) => {
          if (!snap.exists()) {
            setState((s) => ({ ...s, doc: null, loading: false, error: "not-found" }));
            return;
          }
          setState((s) => ({ ...s, doc: snap.data() as CloudGroupDoc, loading: false, error: null }));
        },
        (err) => setState((s) => ({ ...s, loading: false, error: err.code === "permission-denied" ? "permission" : "other" }))
      )
    );

    unsubs.push(
      onSnapshot(membersCol(db, link.remoteId), (snap) => {
        const people = snap.docs.map((d) => memberToPerson(d.id, d.data() as CloudMemberDoc, uid));
        setState((s) => ({ ...s, people }));
      })
    );

    unsubs.push(
      onSnapshot(query(expensesCol(db, link.remoteId), orderBy("date", "desc")), (snap) => {
        const expenses = snap.docs.map(
          (d) => ({ id: d.id, groupId: localGroupId, ...(d.data() as Omit<Expense, "id" | "groupId">) }) as Expense
        );
        setState((s) => ({ ...s, expenses }));
      })
    );

    unsubs.push(
      onSnapshot(settlementsCol(db, link.remoteId), (snap) => {
        const settlements = snap.docs.map(
          (d) => ({ id: d.id, groupId: localGroupId, ...(d.data() as Omit<Settlement, "id" | "groupId">) }) as Settlement
        );
        setState((s) => ({ ...s, settlements }));
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [link?.remoteId, link?.config.projectId, authUser?.uid, authUser === null, localGroupId]);

  return state;
}

// ---------------------------------------------------------------------------
// Scritture
// ---------------------------------------------------------------------------

export async function cloudAddExpense(link: GroupCloudLink, input: ExpenseInput): Promise<string> {
  const db = firestoreFor(link.config);
  const ref = expenseDoc(db, link.remoteId, cryptoRandomId());
  const now = new Date().toISOString();
  await setDoc(ref, { ...stripGroupId(input), createdAt: now, updatedAt: now });
  return ref.id;
}

export async function cloudUpdateExpense(link: GroupCloudLink, id: string, input: ExpenseInput): Promise<void> {
  const db = firestoreFor(link.config);
  const now = new Date().toISOString();
  await setDoc(expenseDoc(db, link.remoteId, id), { ...stripGroupId(input), updatedAt: now }, { merge: true });
}

export async function cloudDeleteExpense(link: GroupCloudLink, id: string): Promise<void> {
  await deleteDoc(expenseDoc(firestoreFor(link.config), link.remoteId, id));
}

export async function cloudAddSettlement(
  link: GroupCloudLink,
  input: Omit<Settlement, "id" | "createdAt" | "groupId">
): Promise<string> {
  const db = firestoreFor(link.config);
  const ref = settlementDoc(db, link.remoteId, cryptoRandomId());
  await setDoc(ref, { ...input, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function cloudDeleteSettlement(link: GroupCloudLink, id: string): Promise<void> {
  await deleteDoc(settlementDoc(firestoreFor(link.config), link.remoteId, id));
}

export async function cloudUpdateGroupInfo(
  link: GroupCloudLink,
  patch: Partial<Pick<GroupInput, "name" | "emoji" | "description" | "currency">>
): Promise<void> {
  await updateDoc(groupDoc(firestoreFor(link.config), link.remoteId), { ...patch, updatedAt: new Date().toISOString() });
}

export async function cloudArchiveGroup(link: GroupCloudLink, archived: boolean): Promise<void> {
  await updateDoc(groupDoc(firestoreFor(link.config), link.remoteId), {
    archivedAt: archived ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  });
}

/** Esce dal gruppo: rimuove solo la propria scheda membro, spese e rimborsi restano per gli altri. */
export async function cloudLeaveGroup(link: GroupCloudLink, uid: string): Promise<void> {
  await deleteDoc(memberDoc(firestoreFor(link.config), link.remoteId, uid));
}

/**
 * Elimina il gruppo per tutti (solo l'amministratore che lo ha creato può
 * farlo): cancella spese, rimborsi, membri e il documento del gruppo.
 * Best-effort: se un lotto fallisce a metà, il gruppo può restare
 * parzialmente cancellato (Firestore non supporta l'eliminazione ricorsiva
 * lato client in una singola operazione atomica).
 */
export async function cloudDeleteGroupEntirely(link: GroupCloudLink): Promise<void> {
  const db = firestoreFor(link.config);
  const [expenses, settlements, members] = await Promise.all([
    getDocs(expensesCol(db, link.remoteId)),
    getDocs(settlementsCol(db, link.remoteId)),
    getDocs(membersCol(db, link.remoteId)),
  ]);
  const refs = [...expenses.docs, ...settlements.docs, ...members.docs].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
    await batch.commit();
  }
  await deleteDoc(groupDoc(db, link.remoteId));
}

export async function cloudUpdateSelfMember(link: GroupCloudLink, uid: string, patch: { name?: string; color?: string }): Promise<void> {
  await setDoc(memberDoc(firestoreFor(link.config), link.remoteId, uid), patch, { merge: true });
}

/** Crea un nuovo gruppo condiviso: documento gruppo + il creatore come primo membro. */
export async function cloudCreateGroup(
  config: GroupCloudLink["config"],
  ownerUid: string,
  input: GroupInput & { selfName: string; selfColor: string }
): Promise<GroupCloudLink> {
  const db = firestoreFor(config);
  const remoteId = cryptoRandomId();
  const now = new Date().toISOString();
  const groupData: CloudGroupDoc = {
    name: input.name.trim(),
    emoji: input.emoji,
    description: input.description.trim(),
    currency: input.currency,
    ownerUid,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(groupDoc(db, remoteId), groupData);
  await setDoc(memberDoc(db, remoteId, ownerUid), {
    name: input.selfName,
    color: input.selfColor,
    email: null,
    joinedAt: now,
  } satisfies CloudMemberDoc);
  return { config, remoteId, ownerUid };
}

/** Crea (o riusa) un invito attivo per un gruppo, restituendo il payload pronto per il link condivisibile. */
export async function cloudCreateInvite(
  link: GroupCloudLink,
  createdByUid: string,
  groupName: string,
  emoji: string,
  currency: string
): Promise<InvitePayload> {
  const db = firestoreFor(link.config);
  const code = newInviteCode();
  await setDoc(inviteDoc(db, code), {
    groupId: link.remoteId,
    groupName,
    createdByUid,
    createdAt: new Date().toISOString(),
    active: true,
  });
  return {
    v: 1,
    code,
    groupId: link.remoteId,
    groupName,
    emoji,
    currency,
    config: link.config,
    googleClientId: link.googleClientId,
    microsoftClientId: link.microsoftClientId,
  };
}

export type JoinResult =
  | { ok: true; link: GroupCloudLink; group: CloudGroupDoc }
  | { ok: false; error: string };

/** Verifica l'invito ed entra nel gruppo con l'utente già autenticato. */
export async function cloudJoinGroup(payload: InvitePayload, user: CloudAuthUser): Promise<JoinResult> {
  const db = firestoreFor(payload.config);
  const invite = await getDoc(inviteDoc(db, payload.code));
  if (!invite.exists()) {
    return { ok: false, error: "Invito non valido o non più attivo." };
  }
  const inviteData = invite.data() as CloudInviteDoc;
  if (inviteData.active !== true || inviteData.groupId !== payload.groupId) {
    return { ok: false, error: "Invito non valido o non più attivo." };
  }
  const groupSnap = await getDoc(groupDoc(db, payload.groupId));
  if (!groupSnap.exists()) {
    return { ok: false, error: "Il gruppo non esiste più." };
  }
  const groupData = groupSnap.data() as CloudGroupDoc;
  await setDoc(
    memberDoc(db, payload.groupId, user.uid),
    {
      name: user.name,
      color: pickColorFor(user.uid),
      email: user.email,
      joinedAt: new Date().toISOString(),
      usedInviteCode: payload.code,
    },
    { merge: true }
  );
  const link: GroupCloudLink = {
    config: payload.config,
    remoteId: payload.groupId,
    ownerUid: groupData.ownerUid,
    googleClientId: payload.googleClientId,
    microsoftClientId: payload.microsoftClientId,
  };
  return { ok: true, link, group: groupData };
}

const PALETTE = ["#4F46E5", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#14B8A6"];

function pickColorFor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function stripGroupId<T extends { groupId?: string }>(input: T): Omit<T, "groupId"> {
  const { groupId: _groupId, ...rest } = input;
  return rest;
}

function cryptoRandomId(): string {
  const bytes = new Uint8Array(12);
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto?.getRandomValues) g.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
