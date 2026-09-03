import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { signOutOfProject, useCloudAuthUser } from "@/cloud/auth";
import type { CloudProject } from "@/domain/types";
import { font, radius, spacing, useTheme } from "../theme";
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
    onUpdate({
      label: label.trim() || project.label,
      googleClientId: googleId.trim() || undefined,
      microsoftClientId: microsoftId.trim() || undefined,
    });
    setEditing(false);
  };

  const isDefault = project.isDefault === true || project.id === "splitfree-default-cloud";

  return (
    <View style={[styles.card, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontSize: font.body }}>
              {project.label}
            </Text>
            {isDefault && (
              <View style={[styles.defaultBadge, { backgroundColor: t.primarySoft }]}>
                <Text style={[styles.defaultBadgeText, { color: t.primary }]}>Zero-Setup</Text>
              </View>
            )}
          </View>
          <Text style={{ color: t.textFaint, fontSize: font.tiny }}>{project.config.projectId}</Text>
        </View>
        <Button
          title={editing ? "Chiudi" : "Modifica"}
          size="sm"
          variant="ghost"
          onPress={() => setEditing((v) => !v)}
        />
      </View>

      {editing ? (
        <View style={styles.editSection}>
          <TextField label="Nome etichetta" value={label} onChangeText={setLabel} />
          <TextField
            label="Google Web Client ID (facoltativo)"
            value={googleId}
            onChangeText={setGoogleId}
            placeholder="xxxx.apps.googleusercontent.com"
            autoCapitalize="none"
          />
          <TextField
            label="Microsoft Application (client) ID (facoltativo)"
            value={microsoftId}
            onChangeText={setMicrosoftId}
            placeholder="Da Azure App registrations"
            autoCapitalize="none"
          />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
            <Button title="Salva modifiche" size="sm" onPress={save} />
            {!isDefault && (
              <Button title="Rimuovi" size="sm" variant="danger" onPress={onRemove} />
            )}
          </View>
        </View>
      ) : null}

      {user === undefined ? (
        <Text style={{ color: t.textFaint, fontSize: font.small }}>Verifica accesso…</Text>
      ) : user ? (
        <View style={[styles.userBox, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Avatar name={user.name} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: font.small }} numberOfLines={1}>
                {user.name}
              </Text>
              {user.provider && (
                <View style={[styles.providerBadge, { backgroundColor: t.surfaceAlt }]}>
                  <Text style={[styles.providerText, { color: t.textMuted }]}>
                    {user.provider === "google"
                      ? "Google"
                      : user.provider === "microsoft"
                      ? "Microsoft"
                      : user.provider === "email"
                      ? "Email"
                      : user.provider === "anonymous"
                      ? "Ospite"
                      : user.provider}
                  </Text>
                </View>
              )}
            </View>
            {user.email && (
              <Text style={{ color: t.textMuted, fontSize: font.tiny }} numberOfLines={1}>
                {user.email}
              </Text>
            )}
          </View>
          <Button
            title="Esci"
            size="sm"
            variant="ghost"
            onPress={() => void signOutOfProject(project.config)}
          />
        </View>
      ) : (
        <View style={{ marginTop: spacing.xs }}>
          <Text style={{ color: t.textMuted, fontSize: font.small, marginBottom: spacing.xs }}>
            Scegli come accedere per sincronizzare in tempo reale:
          </Text>
          <CloudSignInButtons
            config={project.config}
            googleClientId={project.googleClientId}
            microsoftClientId={project.microsoftClientId}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  defaultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  editSection: {
    marginBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  userBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  providerBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  providerText: {
    fontSize: 10,
    fontWeight: "600",
  },
});
