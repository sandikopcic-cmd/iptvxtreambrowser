import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android / Fire TV (Firestick) build.
 *
 * The app is a full-stack web app (its stream proxy and Xtream API calls run
 * on the server), so the native shell loads the published site instead of a
 * static bundle. Point `server.url` at your own published URL if it changes.
 */
const config: CapacitorConfig = {
  appId: "app.lovable.streamdeck",
  appName: "Streamdeck IPTV",
  webDir: "dist/client",
  android: {
    allowMixedContent: true,
  },
  server: {
    url: "https://iptvxtreambrowser.lovable.app",
    cleartext: true,
    androidScheme: "https",
  },
};

export default config;
