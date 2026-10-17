import { registerPlugin } from "@capacitor/core";

type DeviceInventoryNative = {
  listInstalledApps(): Promise<{ apps: Array<{ packageName: string; label: string; iconDataUrl?: string | null }> }>;
};

const plugin = registerPlugin<DeviceInventoryNative>("InstalledApps");

export async function loadDeviceInventory() {
  try {
    const result = await plugin.listInstalledApps();
    return result.apps.filter((app) => !!app.packageName && !!app.label);
  } catch {
    return null;
  }
}
