import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { useStore } from "@/store/store";
import { usePeople } from "@/store/selectors";
import { Avatar, Card, EmptyState, Fab, ListRow, Screen, SectionHeader, Tag } from "@/ui/components";
import { useTheme } from "@/ui/theme";

export default function PeopleScreen() {
  const router = useRouter();
  const t = useTheme();
  const people = usePeople();
  const groups = useStore((s) => s.data.groups);

  const groupCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) if (!g.archivedAt) for (const id of g.memberIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [groups]);

  const active = people.filter((p) => !p.archivedAt);
  const archived = people.filter((p) => p.archivedAt);

  const row = (p: (typeof people)[number], last: boolean) => {
    const n = groupCount.get(p.id) ?? 0;
    const groupsLabel = p.isSelf ? "Sei tu" : n === 0 ? "In nessun gruppo" : `In ${n} ${n === 1 ? "gruppo" : "gruppi"}`;
    const subtitle = p.email ? `${p.email} · ${groupsLabel}` : groupsLabel;
    return (
      <ListRow
        key={p.id}
        leading={<Avatar person={p} size={42} />}
        title={p.name}
        subtitle={subtitle}
        trailing={p.isSelf ? <Tag label="tu" color={t.primary} /> : undefined}
        chevron
        onPress={() => router.push({ pathname: "/person/edit", params: { id: p.id } })}
        last={last}
      />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Persone" subtitle="Chi partecipa alle spese" bottomInset={80}>
        {active.length === 0 ? (
          <Card>
            <EmptyState icon="person-add-outline" title="Nessuna persona" message="Aggiungi le persone con cui dividi le spese." actionLabel="Aggiungi" onAction={() => router.push("/person/edit")} />
          </Card>
        ) : (
          <Card padded={false}>{active.map((p, i) => row(p, i === active.length - 1))}</Card>
        )}
        {archived.length > 0 ? (
          <>
            <SectionHeader title="Archiviate" />
            <Card padded={false}>{archived.map((p, i) => row(p, i === archived.length - 1))}</Card>
          </>
        ) : null}
        <Text style={{ color: t.textFaint, fontSize: 12, marginTop: 8 }}>
          Le persone sono schede locali: non serve che abbiano l'app. Una persona usata in spese o rimborsi può essere archiviata ma non eliminata.
        </Text>
      </Screen>
      <Fab label="Persona" icon="person-add" onPress={() => router.push("/person/edit")} />
    </View>
  );
}
