import { useEffect, useState, type FormEvent } from "react";
import { Download, FileText, Image as ImageIcon, LockKeyhole, Plus, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { deleteEncryptedAttachment, openEncryptedAttachment, persistEncryptedAttachment } from "@/lib/vault-crypto";

export function FilesScreen() {
  const { t, lang } = useCopy();
  const vault = useAppStore((s) => s.vault);
  const vaultOpen = useAppStore((s) => s.vaultOpen);
  const vaultEncrypted = useAppStore((s) => s.vaultEncrypted);
  const vaultMigrationRequired = useAppStore((s) => s.vaultMigrationRequired);
  const vaultCryptoReady = useAppStore((s) => s.vaultCryptoReady);
  const unlockEncryptedVault = useAppStore((s) => s.unlockEncryptedVault);
  const setVaultOpen = useAppStore((s) => s.setVaultOpen);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const addFile = useAppStore((s) => s.addFile);
  const updateFile = useAppStore((s) => s.updateFile);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState("");
  const [passphraseBusy, setPassphraseBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [preview, setPreview] = useState<{ title: string; url: string; mimeType: string } | null>(null);

  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview?.url]);

  async function importPickedFile(input: HTMLInputElement) {
    const picked = input.files?.[0];
    input.value = "";
    if (!picked || !vaultCryptoReady) return;
    if (picked.size === 0) { setAttachmentError(lang === "ar" ? "الملف فارغ." : "The selected file is empty."); return; }
    if (picked.size > 512 * 1024 * 1024) { setAttachmentError(lang === "ar" ? "حجم الملف يتجاوز الحد المدعوم (512 ميغابايت)." : "The file exceeds the supported 512 MB limit."); return; }
    setAttachmentBusy(true);
    setAttachmentError("");
    const attachmentId = crypto.randomUUID();
    try {
      await persistEncryptedAttachment(attachmentId, picked, picked.type || "application/octet-stream");
      const saved = await addFile(picked.name, `vault-file-v1:${attachmentId}`);
      if (!saved) {
        await deleteEncryptedAttachment(attachmentId).catch(() => undefined);
        setAttachmentError(lang === "ar" ? "تعذّر حفظ مرجع الملف المشفّر داخل الخزنة." : "Could not save the encrypted file reference in the vault.");
      }
    } catch {
      await deleteEncryptedAttachment(attachmentId).catch(() => undefined);
      setAttachmentError(lang === "ar" ? "تعذّر تشفير الملف أو حفظه. تحقق من مساحة التخزين وحاول مجددًا." : "Could not encrypt or store the file. Check available storage and try again.");
    } finally { setAttachmentBusy(false); }
  }
  async function openAttachment(file: { title: string; body: string }) {
    const match = file.body.match(/^vault-file-v1:([^:]+)$/);
    if (!match) return;
    setAttachmentBusy(true);
    setAttachmentError("");
    try { const opened = await openEncryptedAttachment(match[1]!); const url = URL.createObjectURL(opened.blob); setPreview({ title: file.title, url, mimeType: opened.mimeType }); }
    catch { setAttachmentError(lang === "ar" ? "تعذّر فك تشفير الملف. قد تكون الخزنة مغلقة أو بيانات الملف تالفة." : "Could not decrypt the file. The vault may be locked or the attachment may be damaged."); }
    finally { setAttachmentBusy(false); }
  }

  if (!vaultOpen) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="grid size-16 place-items-center rounded-xl bg-surface text-cyan">
          <FileText className="size-7" />
        </span>
        <h1 className="text-xl font-bold">{t.vaultLocked}</h1>
        <p className="text-sm text-muted">{t.sensitiveHint}</p>
        <button
          type="button"
          onClick={() =>
            openOverlay({
              kind: "confirm",
              action: { type: "open-vault" },
              title: t.enterMasterConfirm,
            })
          }
          className="h-12 w-full max-w-xs rounded-md bg-cyan font-semibold text-night"
        >
          {t.openVault}
        </button>
      </div>
    );
  }

  async function submitVaultPassphrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPassphraseError("");
    if (!vaultEncrypted && passphrase !== confirmPassphrase) {
      setPassphraseError(lang === "ar" ? "كلمتا المرور غير متطابقتين." : "Passphrases do not match.");
      return;
    }
    if (!vaultEncrypted && passphrase.length < 12) {
      setPassphraseError(lang === "ar" ? "استخدم كلمة مرور للخزنة من 12 محرفًا على الأقل، وليست رمز PIN." : "Choose a vault passphrase of at least 12 characters; do not reuse your PIN.");
      return;
    }
    setPassphraseBusy(true);
    const result = await unlockEncryptedVault(passphrase);
    setPassphraseBusy(false);
    if (result.ok) {
      setPassphrase("");
      setConfirmPassphrase("");
      setPassphraseError("");
      return;
    }
    const message = result.reason === "PASSPHRASE_OR_INTEGRITY_ERROR" || result.reason === "VAULT_PASSPHRASE_OR_INTEGRITY_ERROR"
      ? (lang === "ar" ? "كلمة المرور غير صحيحة أو أن بيانات الخزنة تالفة." : "Incorrect passphrase or damaged vault data.")
      : result.reason === "WEBCRYPTO_UNAVAILABLE"
        ? (lang === "ar" ? "التشفير غير متاح هنا. افتح الموقع عبر HTTPS أو شغّل نسخة APK." : "Cryptography is unavailable. Use HTTPS or the APK build.")
        : result.reason === "VAULT_RECORD_MISSING"
          ? (lang === "ar" ? "سجل الخزنة المشفّر غير موجود. أوقفنا الدخول حتى لا نبدّل كلمة المرور أو ننشئ خزنة فارغة فوق بيانات مفقودة." : "The encrypted vault record is missing. Access is stopped rather than replacing it with an empty vault.")
          : (lang === "ar" ? "تعذّر فتح الخزنة المشفّرة. لم يتم حفظ بيانات غير مشفّرة." : "Could not open the encrypted vault. No plaintext fallback was used.");
    setPassphraseError(message);
  }

  if (!vaultCryptoReady) {
    const creating = !vaultEncrypted;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-3 py-8">
        <span className="grid size-16 place-items-center rounded-2xl bg-surface text-cyan"><LockKeyhole className="size-7" /></span>
        <div className="text-center">
          <h1 className="text-xl font-bold">{creating ? (lang === "ar" ? "إنشاء كلمة مرور للخزنة" : "Create vault passphrase") : (lang === "ar" ? "فتح الخزنة المشفّرة" : "Unlock encrypted vault")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{creating
            ? (lang === "ar" ? "ستُشفّر الملفات محليًا باستخدام AES-GCM ومفتاح مشتق من كلمة مرور قوية. لا يمكن استعادة الملفات إذا نسيت كلمة المرور." : "Files are encrypted locally with AES-GCM and a key derived from a strong passphrase. Files cannot be recovered if you forget it.")
            : (lang === "ar" ? "أدخل كلمة مرور الخزنة. لا تُحفظ كلمة المرور نفسها ولا يوجد رجوع إلى تخزين نصي غير مشفّر." : "Enter the vault passphrase. The passphrase itself is not stored, and plaintext fallback is disabled.")}</p>
        </div>
        {creating && vaultMigrationRequired && vault.length > 0 ? (
          <p role="alert" className="w-full rounded-lg border border-danger/40 bg-danger-bg p-3 text-sm leading-6 text-danger">
            {lang === "ar" ? "وجدنا ملفات قديمة لم تكن مشفّرة. يتم الاحتفاظ بها في الذاكرة لهذه الجلسة فقط؛ اختر كلمة مرور وأكمل التشفير قبل إغلاق التطبيق حتى لا تفقدها." : "Legacy files were found without vault encryption. They are kept in memory for this session only; choose a passphrase and finish encryption before closing the app."}
          </p>
        ) : null}
        {creating && vaultMigrationRequired && vault.length === 0 ? (
          <p role="alert" className="w-full rounded-lg border border-danger/40 bg-danger-bg p-3 text-sm leading-6 text-danger">
            {lang === "ar" ? "علامة الترحيل القديمة موجودة، لكن محتوى الملفات القديمة غير متاح في هذه الجلسة. لن نخترع بيانات بديلة؛ يمكنك إنشاء خزنة مشفّرة جديدة." : "A legacy migration marker exists, but the old file contents are not available in this session. No replacement data will be invented; you can create a new encrypted vault."}
          </p>
        ) : null}
        <form onSubmit={(event) => void submitVaultPassphrase(event)} className="w-full rounded-xl border border-line bg-surface p-4">
          <label className="mb-2 block text-sm text-muted">{lang === "ar" ? "كلمة مرور الخزنة" : "Vault passphrase"}</label>
          <input type="password" autoComplete={creating ? "new-password" : "current-password"} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} minLength={creating ? 12 : 1} required className="h-12 w-full rounded-lg bg-navy px-3 text-sm outline-none ring-cyan/40 focus:ring-2" />
          {creating ? <>
            <label className="mb-2 mt-4 block text-sm text-muted">{lang === "ar" ? "تأكيد كلمة المرور" : "Confirm passphrase"}</label>
            <input type="password" autoComplete="new-password" value={confirmPassphrase} onChange={(e) => setConfirmPassphrase(e.target.value)} minLength={12} required className="h-12 w-full rounded-lg bg-navy px-3 text-sm outline-none ring-cyan/40 focus:ring-2" />
          </> : null}
          {passphraseError ? <p role="alert" className="mt-3 text-sm text-danger">{passphraseError}</p> : null}
          <button type="submit" disabled={passphraseBusy} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cyan font-semibold text-night disabled:opacity-50">
            <ShieldCheck className="size-4" />
            {passphraseBusy ? (lang === "ar" ? "جارٍ التحقق والتشفير…" : "Verifying and encrypting…") : (creating ? (lang === "ar" ? "تشفير الخزنة" : "Encrypt vault") : (lang === "ar" ? "فتح الخزنة" : "Unlock vault"))}
          </button>
          <button type="button" onClick={() => setVaultOpen(false)} className="mt-2 h-11 w-full rounded-lg border border-line text-sm text-ink">{lang === "ar" ? "إغلاق" : "Close"}</button>
        </form>
      </div>
    );
  }

  async function save() {
    if (!title.trim() || !vaultCryptoReady) return;
    const saved = editing
      ? await updateFile(editing, title.trim(), body.trim())
      : await addFile(title.trim(), body.trim());
    if (!saved) return;
    setTitle("");
    setBody("");
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-lg font-bold">{t.sensitiveFiles}</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{vault.length} {t.filesCount}</span>
          <button type="button" onClick={() => setVaultOpen(false)} className="rounded-lg border border-line px-3 py-2 text-xs text-ink">{lang === "ar" ? "قفل الخزنة" : "Lock vault"}</button>
        </div>
      </header>

      <div className="rounded-xl border border-line bg-surface p-4">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-cyan/40 bg-cyan/10 px-4 py-3 text-sm font-semibold text-cyan">
          <Upload className="size-4" />
          {attachmentBusy ? (lang === "ar" ? "جارٍ التشفير..." : "Encrypting...") : (lang === "ar" ? "استيراد ملف إلى الخزنة المشفّرة" : "Import file into encrypted vault")}
          <input type="file" className="sr-only" disabled={attachmentBusy} onChange={(event) => void importPickedFile(event.currentTarget)} />
        </label>
        <p className="mt-2 text-xs leading-5 text-muted">{lang === "ar" ? "تُشفّر الملفات المختارة على دفعات داخل بيانات التطبيق الخاصة. النسخة الأصلية لا تُحذف تلقائيًا؛ احذفها يدويًا بعد التحقق من النسخة المشفّرة." : "Selected files are encrypted in chunks inside this app’s private data. The original is not deleted automatically; remove it manually after verifying the encrypted copy."}</p>
        {attachmentError ? <p role="alert" className="mt-2 text-xs text-danger">{attachmentError}</p> : null}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.fileTitle}
          className="h-11 w-full rounded-md bg-navy px-3 text-sm outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.fileBody}
          rows={4}
          className="mt-2 w-full resize-none rounded-md bg-navy px-3 py-2 text-sm outline-none"
        />
        <button type="button" onClick={() => void save()} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-cyan font-semibold text-night">
          <Plus className="size-4" />
          {editing ? t.save : t.addFile}
        </button>
      </div>

      {vault.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{t.emptyVault}</p>
      ) : (
        vault.map((file) => (
          <article key={file.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="text-start"
                onClick={() => {
                  if (file.body.startsWith("vault-file-v1:")) { void openAttachment(file); return; }
                  setEditing(file.id); setTitle(file.title); setBody(file.body);
                }}
              >
                <h2 className="font-semibold">{file.title}</h2>
                <p className="mt-1 line-clamp-3 text-sm text-muted">{file.body.startsWith("vault-file-v1:") ? (lang === "ar" ? "مرفق مشفّر — اضغط لفتحه" : "Encrypted attachment — tap to open") : file.body}</p>
              </button>
              <div className="flex items-center gap-1">
              {file.body.startsWith("vault-file-v1:") ? <button type="button" className="grid size-10 place-items-center text-cyan" aria-label={lang === "ar" ? "فتح الملف المشفّر" : "Open encrypted file"} disabled={attachmentBusy} onClick={() => void openAttachment(file)}><Download className="size-4" /></button> : null}
              <button
                type="button"
                className="grid size-10 place-items-center text-danger"
                onClick={() =>
                  openOverlay({
                    kind: "confirm",
                    action: { type: "delete-file", id: file.id },
                    title: t.enterMasterConfirm,
                  })
                }
                aria-label={t.delete}
              >
                <Trash2 className="size-4" />
              </button>
              </div>
            </div>
          </article>
        ))
      )}
      {preview ? <div role="dialog" aria-modal="true" aria-label={preview.title} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={() => setPreview(null)}>
        <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-surface p-4" onClick={(event) => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="truncate font-semibold">{preview.title}</h2><button type="button" className="grid size-9 place-items-center rounded-md border border-line" onClick={() => setPreview(null)} aria-label={lang === "ar" ? "إغلاق المعاينة" : "Close preview"}><X className="size-4" /></button></div>
          {preview.mimeType.startsWith("image/") ? <img src={preview.url} alt={preview.title} className="max-h-[65vh] w-full rounded-lg object-contain" /> : preview.mimeType.startsWith("video/") ? <video src={preview.url} controls className="max-h-[65vh] w-full rounded-lg" /> : preview.mimeType.startsWith("audio/") ? <audio src={preview.url} controls className="w-full" /> : <div className="flex flex-col items-center gap-3 py-8 text-center"><ImageIcon className="size-8 text-cyan" /><p className="text-sm text-muted">{lang === "ar" ? "فُك تشفير الملف في الذاكرة. نزّله أو افتحه عند الحاجة." : "The file has been decrypted in memory. Download or open it when needed."}</p></div>}
          <a href={preview.url} download={preview.title} className="mt-4 flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan font-semibold text-night"><Download className="size-4" />{lang === "ar" ? "تنزيل نسخة مفكوكة التشفير" : "Download decrypted copy"}</a>
        </div>
      </div> : null}
    </div>
  );
}
