import type { ReactNode } from "react";
import { useEffect } from "react";
import { Modal, Platform, StyleSheet, View } from "react-native";

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
};

/**
 * Strato modale cross-platform.
 * Su nativo usa `Modal`; su web (dove `Modal` di react-native-web resta
 * semitrasparente e blocca i click) disegna un contenitore a posizione fissa
 * sopra tutta la pagina e chiude con il tasto Esc.
 */
export function Overlay({ visible, onRequestClose, children }: Props) {
  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, onRequestClose]);

  if (Platform.OS !== "web") {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
        {children}
      </Modal>
    );
  }
  if (!visible) return null;
  return <View style={[StyleSheet.absoluteFill, styles.fixed]}>{children}</View>;
}

const styles = StyleSheet.create({
  fixed: { position: "fixed", zIndex: 10000 } as object,
});
