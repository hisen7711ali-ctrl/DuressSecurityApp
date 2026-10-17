import {
  Camera,
  Folder,
  Ghost,
  Globe,
  Image,
  Mail,
  MessageCircle,
  Music2,
  Phone,
  Play,
  Send,
  Settings,
} from "lucide-react";
import type { DeviceApp } from "@/lib/apps";

const ICONS = {
  chat: MessageCircle,
  send: Send,
  camera: Camera,
  ghost: Ghost,
  globe: Globe,
  image: Image,
  folder: Folder,
  mail: Mail,
  phone: Phone,
  play: Play,
  music: Music2,
  settings: Settings,
};

function safeNativeIconSource(value: string | undefined): string | null {
  if (!value || value.length > 350_000) return null;
  // InstalledAppsPlugin emits only local PNG data. Never accept remote URLs,
  // SVG/HTML, javascript:, or arbitrary MIME types from app metadata.
  if (!value.startsWith("data:image/png;base64,")) return null;
  const payload = value.slice("data:image/png;base64,".length);
  if (!payload || payload.length > 340_000 || !/^[A-Za-z0-9+/=]+$/.test(payload)) return null;
  return value;
}

export function AppGlyph({ app, size = 40 }: { app: DeviceApp; size?: number }) {
  const nativeIcon = safeNativeIconSource(app.iconDataUrl);
  if (nativeIcon) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-lg bg-surface"
        style={{ width: size, height: size }}
      >
        <img
          src={nativeIcon}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="block h-full w-full object-contain"
          referrerPolicy="no-referrer"
        />
      </span>
    );
  }

  const darkGlyph = app.icon === "ghost";
  if (app.icon === "letter") {
    const glyph = (app.nameAr || app.nameEn || "?").trim().charAt(0);
    return (
      <span
        className="grid place-items-center rounded-lg font-bold text-paper"
        style={{ width: size, height: size, background: app.accent, fontSize: size * 0.42 }}
      >
        {glyph}
      </span>
    );
  }
  const Icon = ICONS[app.icon];
  return (
    <span
      className={`grid place-items-center rounded-lg ${darkGlyph ? "text-night" : "text-paper"}`}
      style={{ width: size, height: size, background: app.accent }}
    >
      <Icon className="size-5" />
    </span>
  );
}
