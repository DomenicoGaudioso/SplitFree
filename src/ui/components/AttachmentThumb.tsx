import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { isImageMime, resolveAttachmentUri } from "@/store/attachments";
import { font, radius, useTheme } from "../theme";

export type ThumbSource = {
  key: string;
  fileName: string;
  mimeType: string;
  /** URI già risolta (per allegati appena scelti, non ancora salvati). */
  uri?: string;
  storageKey?: string;
};

type Props = {
  source: ThumbSource;
  size?: number;
  onPress?: (uri: string | null) => void;
  onRemove?: () => void;
};

/** Anteprima di un allegato: immagine, oppure icona per PDF/altro. */
export function AttachmentThumb({ source, size = 84, onPress, onRemove }: Props) {
  const t = useTheme();
  const [uri, setUri] = useState<string | null>(source.uri ?? null);

  useEffect(() => {
    let active = true;
    if (source.uri) {
      setUri(source.uri);
      return;
    }
    if (source.storageKey) {
      resolveAttachmentUri(source.storageKey).then((u) => {
        if (active) setUri(u);
      });
    }
    return () => {
      active = false;
    };
  }, [source.uri, source.storageKey]);

  const image = isImageMime(source.mimeType) && uri;
  return (
    <Pressable onPress={() => onPress?.(uri)} style={[styles.box, { width: size, height: size, backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
      {image ? (
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <View style={{ alignItems: "center", justifyContent: "center", flex: 1, padding: 6 }}>
          <Ionicons name={source.mimeType === "application/pdf" ? "document-text" : "document"} size={26} color={t.primary} />
          <Text style={{ color: t.textMuted, fontSize: font.tiny, marginTop: 4, textAlign: "center" }} numberOfLines={2}>
            {source.fileName}
          </Text>
        </View>
      )}
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} style={[styles.remove, { backgroundColor: t.negative }]}>
          <Ionicons name="close" size={14} color="#fff" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, overflow: "hidden", borderWidth: 1, marginRight: 10, marginBottom: 10 },
  remove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
