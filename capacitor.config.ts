import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.xtream.player",
  appName: "Xtream Player",
  webDir: "dist",
  server: {
    // KLJUČNO: Androidu pove, naj ne blokira http:// video streamov.
    cleartext: true,
  },
  android: {
    allowMixedContent: true, // Dovoljuje mešanje https strani in http videa
  },
};

export default config;
