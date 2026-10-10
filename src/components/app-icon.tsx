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

export function AppGlyph({ app, size = 40 }: { app: DeviceApp; size?: number }) {
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
