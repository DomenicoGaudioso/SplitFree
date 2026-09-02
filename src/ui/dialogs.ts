import { Alert, Platform } from "react-native";

/** Conferma cross-platform: Alert su nativo, window.confirm su web. */
export function confirm(title: string, message: string, options: { confirmText?: string; destructive?: boolean } = {}): Promise<boolean> {
  if (Platform.OS === "web") {
    const w = globalThis as unknown as { confirm?: (msg: string) => boolean };
    return Promise.resolve(w.confirm ? w.confirm(`${title}\n\n${message}`) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Annulla", style: "cancel", onPress: () => resolve(false) },
      {
        text: options.confirmText ?? "OK",
        style: options.destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}

export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    const w = globalThis as unknown as { alert?: (msg: string) => void };
    w.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
