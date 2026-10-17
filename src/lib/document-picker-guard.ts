const DOCUMENT_PICKER_MAX_WAIT_MS = 10 * 60_000;

type DocumentPickerWindow = Window & {
  __duressSecurityDocumentPickerUntil?: number;
};

/** Mark an Android-owned file/gallery picker as an intentional, short-lived foreground round-trip. */
export function beginDocumentPicker(): void {
  if (typeof window === "undefined") return;
  (window as DocumentPickerWindow).__duressSecurityDocumentPickerUntil = Date.now() + DOCUMENT_PICKER_MAX_WAIT_MS;
}

export function hasDocumentPickerMarker(): boolean {
  if (typeof window === "undefined") return false;
  const until = (window as DocumentPickerWindow).__duressSecurityDocumentPickerUntil;
  return typeof until === "number" && until > 0;
}

export function isDocumentPickerPending(): boolean {
  if (typeof window === "undefined") return false;
  const until = (window as DocumentPickerWindow).__duressSecurityDocumentPickerUntil;
  return typeof until === "number" && until > Date.now();
}

export function clearDocumentPicker(): void {
  if (typeof window === "undefined") return;
  delete (window as DocumentPickerWindow).__duressSecurityDocumentPickerUntil;
}
