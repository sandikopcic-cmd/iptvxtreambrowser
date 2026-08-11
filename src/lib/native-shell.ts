import { useEffect, useState } from "react";

/**
 * True when the app runs inside the Android/Fire TV shell (Capacitor WebView).
 * Google sign-in cannot complete there: the provider opens the system browser
 * and the session never comes back into the WebView, so we offer email +
 * password instead.
 */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) return true;
  return /\bwv\b|; wv\)|Capacitor/i.test(window.navigator.userAgent);
}

export function useNativeShell(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeShell()), []);
  return native;
}
