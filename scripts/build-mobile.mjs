import { spawn } from "node:child_process";
import process from "node:process";

// Use TanStack Start SPA mode and omit the Vercel/Nitro server output for the
// WebView bundle. This does not make server-only endpoints available in APK.
const child = spawn(process.execPath, ["scripts/with-app-env.mjs", "vite", "build"], {
  stdio: "inherit",
  env: { ...process.env, MOBILE_BUILD: "1" },
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
