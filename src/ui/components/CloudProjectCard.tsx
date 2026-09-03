import { useState } from "react";
import { Text, View } from "react-native";
import { signOutOfProject, useCloudAuthUser } from "@/cloud/auth";
import type { CloudProject } from "@/domain/types";
import { font, spacing, useTheme } from "../theme";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { CloudSignInButtons } from "./CloudSignIn";
import { TextField } from "./TextField";

type Props = {
  project: CloudProject;
  onUpdate: (patch: Partial<Pick<CloudProject, "label" | "googleClientId" | "microsoftClientId">>) => void;
  onRemove: () => void;
};

export function CloudProjectCard({ project, onUpdate, onRemove }: Props) {
  const t = useTheme();
  const user = useCloudAuthUser(project.config);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(project.label);
  const [googleId, setGoogleId] = useState(project.googleClientId ?? "");
  const [microsoftId, setMicrosoftId] = useState(project.microsoftClientId ?? "");

  const save = () => {
    onUpdate({ label: label.trim() || project.label, googleClientId: googleId.trim() || undefined, microsoftClientId: microsoftId.trim() || undefined });
    setEditing(false);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: font.body }}>{project.label}</Text>
          <Text style={{ color: t.textFaint, fontSize: font.tiny }}>{project.config.projectId}</Text>
        </View>
        <Button title={editing ? "Chiudi" : "Modifica"} size="sm" variant="ghost" onPress={() => setEditing((v) => !v)} />
      </View>

      {editing ? (
        <View style={{ marginBottom: spacing.sm }}>
          <TextField label="Nome" value={label} onChangeText={setLabel} />
          <TextField label="Google Web Client ID (facoltativo)" value={googleId} onChangeText={setGoogleId} placeholder="xxxx.apps.googleusercontent.com" autoCapitalize="none" />
          <TextField label="Microsoft Application (client) ID (facoltativo)" value={microsoftId} onChangeText={setMicrosoftId} placeholder="Da Azure App registrations" autoCapitalize="none" />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title="Salva" size="sm" onPress={save} />
            <Button title="Rimuovi progetto" size="sm" variant="danger" onPress={onRemove} />
          </View>
        </View>
      ) : null}

      {user === undefined ? (
        <Text style={{ color: t.textFaint, fontSize: font.small }}>Verifica accesso…</Text>
      ) : user ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Avatar name={user.name} size={28} />
          <Text style={{ color: t.text, fontSize: font.small, flex: 1 }} numberOfLines={1}>
            Connesso come {user.name}
          </Text>
          <Button title="Esci" size="sm" variant="ghost" onPress={() => void signOutOfProject(project.config)} />
        </View>
      ) : (
        <CloudSignInButtons config={project.config} googleClientId={project.googleClientId} microsoftClientId={project.microsoftClientId} />
      )}
    </View>
  );
}
