export type AppIconId =
  | "chat"
  | "send"
  | "camera"
  | "ghost"
  | "globe"
  | "image"
  | "folder"
  | "mail"
  | "phone"
  | "play"
  | "music"
  | "settings"
  | "letter";

export type DeviceApp = {
  id: string;
  packageName: string;
  nameAr: string;
  nameEn: string;
  accent: string;
  icon: AppIconId;
};

export const APP_SUGGESTIONS: DeviceApp[] = [
  { id: "whatsapp", packageName: "com.whatsapp", nameAr: "واتساب", nameEn: "WhatsApp", accent: "#25d366", icon: "chat" },
  { id: "telegram", packageName: "org.telegram.messenger", nameAr: "تيليجرام", nameEn: "Telegram", accent: "#2aabee", icon: "send" },
  { id: "instagram", packageName: "com.instagram.android", nameAr: "إنستغرام", nameEn: "Instagram", accent: "#e1306c", icon: "camera" },
  { id: "snapchat", packageName: "com.snapchat.android", nameAr: "سناب شات", nameEn: "Snapchat", accent: "#fffc00", icon: "ghost" },
  { id: "facebook", packageName: "com.facebook.katana", nameAr: "فيسبوك", nameEn: "Facebook", accent: "#1877f2", icon: "globe" },
  { id: "messenger", packageName: "com.facebook.orca", nameAr: "ماسنجر", nameEn: "Messenger", accent: "#006aff", icon: "chat" },
  { id: "tiktok", packageName: "com.zhiliaoapp.musically", nameAr: "تيك توك", nameEn: "TikTok", accent: "#fe2c55", icon: "play" },
  { id: "x", packageName: "com.twitter.android", nameAr: "إكس", nameEn: "X", accent: "#111111", icon: "globe" },
  { id: "chrome", packageName: "com.android.chrome", nameAr: "كروم", nameEn: "Chrome", accent: "#4285f4", icon: "globe" },
  { id: "youtube", packageName: "com.google.android.youtube", nameAr: "يوتيوب", nameEn: "YouTube", accent: "#ff3b30", icon: "play" },
  { id: "gmail", packageName: "com.google.android.gm", nameAr: "جيميل", nameEn: "Gmail", accent: "#ea4335", icon: "mail" },
  { id: "messages", packageName: "com.google.android.apps.messaging", nameAr: "الرسائل", nameEn: "Messages", accent: "#34d399", icon: "mail" },
  { id: "dialer", packageName: "com.android.dialer", nameAr: "الهاتف", nameEn: "Phone", accent: "#22c55e", icon: "phone" },
  { id: "photos", packageName: "com.google.android.apps.photos", nameAr: "الصور", nameEn: "Photos", accent: "#fbbc04", icon: "image" },
  { id: "gallery", packageName: "com.android.gallery3d", nameAr: "المعرض", nameEn: "Gallery", accent: "#64748b", icon: "image" },
  { id: "files", packageName: "com.android.documentsui", nameAr: "الملفات", nameEn: "Files", accent: "#38bdf8", icon: "folder" },
  { id: "drive", packageName: "com.google.android.apps.docs", nameAr: "درايف", nameEn: "Drive", accent: "#1a73e8", icon: "folder" },
  { id: "maps", packageName: "com.google.android.apps.maps", nameAr: "الخرائط", nameEn: "Maps", accent: "#34a853", icon: "globe" },
  { id: "camera", packageName: "com.android.camera", nameAr: "الكاميرا", nameEn: "Camera", accent: "#0ea5e9", icon: "camera" },
  { id: "music", packageName: "com.google.android.apps.youtube.music", nameAr: "الموسيقى", nameEn: "YT Music", accent: "#ff0000", icon: "music" },
  { id: "settings", packageName: "com.android.settings", nameAr: "إعدادات النظام", nameEn: "Settings", accent: "#64748b", icon: "settings" },
  { id: "playstore", packageName: "com.android.vending", nameAr: "متجر بلاي", nameEn: "Play Store", accent: "#01875f", icon: "play" },
  { id: "signal", packageName: "org.thoughtcrime.securesms", nameAr: "سيجنال", nameEn: "Signal", accent: "#3a76f0", icon: "chat" },
  { id: "viber", packageName: "com.viber.voip", nameAr: "فايبر", nameEn: "Viber", accent: "#7360f2", icon: "phone" },
];

export const APP_CATALOG = APP_SUGGESTIONS;

const ACCENTS = ["#25d366", "#2aabee", "#e1306c", "#0ea5e9", "#22c55e", "#f59e0b", "#8b5cf6", "#14b8a6"];

export function hashAccent(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function makeCustomApp(name: string): DeviceApp {
  const trimmed = name.trim();
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32);
  const id = crypto.randomUUID();
  return {
    id,
    packageName: `app.user.${slug || id.slice(0, 8)}`,
    nameAr: trimmed,
    nameEn: trimmed,
    accent: hashAccent(trimmed),
    icon: "letter",
  };
}

export function appLabel(app: DeviceApp, lang: "ar" | "en") {
  return lang === "ar" ? app.nameAr : app.nameEn;
}

export function findApp(apps: DeviceApp[], packageName: string) {
  return apps.find((a) => a.packageName === packageName) ?? APP_SUGGESTIONS.find((a) => a.packageName === packageName);
}
