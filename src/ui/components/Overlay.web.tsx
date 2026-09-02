import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
};

/**
 * Versione web dello strato modale: un portale su `document.body` con un
 * contenitore a posizione fissa. Serve perché ogni View di react-native-web
 * crea un proprio contesto di stacking (z-index 0), quindi un overlay annidato
 * in una card non potrebbe coprire il resto della pagina; e `Modal` di
 * react-native-web resta semitrasparente e non riceve i click.
 */
export function Overlay({ visible, onRequestClose, children }: Props) {
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [visible, onRequestClose]);

  if (!visible || typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, display: "flex", flexDirection: "column" }}>{children}</div>,
    document.body
  );
}
