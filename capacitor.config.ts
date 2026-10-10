import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.duresssecurity.app",
  appName: "Duress Security",
  webDir: "dist/client",
  server: { androidScheme: "https" },
};

export default config;
