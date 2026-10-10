# طبقة Android الأصلية

يوفر هذا المجلد مصدر Kotlin وسكربتات دمجه في مشروع Capacitor الذي يولده `npm run android:setup`. لا يوجد هنا مشروع Android كامل مستقل؛ المجلد `android/` يولَّد على جهاز التطوير بعد تثبيت حزم npm.

## مكونات الطبقة

- `SecurityAdminPlugin.kt`: Device Admin/`lockNow()`, `BiometricPrompt`, فحص الأذونات من نظام Android، اكتشاف تطبيقات Launcher، التخزين المشفر، Device Owner/Kiosk.
- `SecureStorage.kt`: AES-GCM، مفتاح داخل Android Keystore وسجلات مشفرة في SharedPreferences.
- `AppLockAccessibilityService.kt`: واجهة PIN فوق التطبيقات المختارة، مع قراءة اسم الحزمة الأمامية فقط. ملف XML يضبط `canRetrieveWindowContent=false` و`canRequestFilterKeyEvents=false`.
- `BootCompletedReceiver.kt`: قراءة وقت انتهاء القفل بعد الإقلاع وإرسال إشعار مرئي بدل محاولة بدء Activity في الخلفية.
- `AdminReceiver.kt`: مستقبل Device Admin المستخدم لطلب قفل الشاشة.
- `mainactivity-patch/MainActivity.kt`: تسجيل Capacitor plugin، ضبط أعلام عرض النشاط في الظروف المسموح بها، و`FLAG_SECURE`.
- `manifest-additions.xml`: تصريحات الإذن والخدمة والـ receivers. يضيف سكربت الإعداد أيضًا `<queries>` مقتصرًا على تطبيقات Launcher.

## الخزنة والتخزين

في الويب وCapacitor WebView، `src/lib/vault-crypto.ts` يشفر محتوى الخزنة بشكل مستقل باستخدام AES-256-GCM ومفتاح PBKDF2 مشتق من كلمة مرور المستخدم. يجب أن تكون كلمة المرور 12 محرفًا على الأقل؛ لا يُحفظ المفتاح ولا تُستخدم بيانات نصية عند فشل فك التشفير. في APK تُشفر حالة Zustand العامة أيضًا عبر `SecureStorage.kt` ومفتاح Android Keystore. هذه الحماية لا تمنع الوصول أثناء فتح الخزنة في ذاكرة التطبيق، ولا تجعل نسخة الويب بأكملها مشفرة؛ PIN والإعدادات العامة في مخزن المتصفح ما زالت تحتاج طبقة تشفير شاملة.

## البناء

```bash
npm ci
npm test
npm run typecheck
npm run apk:debug
```

تعتمد النتيجة على نجاح Gradle/Android SDK على جهاز التطوير. لا تدّعِ نجاح البناء قبل وجود `android/app/build/outputs/apk/debug/app-debug.apk` والتحقق من تثبيته على جهاز اختبار.

## حدود مهمة

- لا يحتوي المشروع على `wipeData()`، ولا يوجد استدعاء إعادة ضبط مصنع.
- `lockNow()` يقفل شاشة النظام فقط؛ لا يغيّر PIN النظام.
- Device Owner لا يُمنح بمجرد تفعيل Device Admin. يجب إعداد جهاز اختبار مخصص.
- Kiosk/منع الإزالة إعداد اختياري وقابل للإيقاف عبر المالك، وليس إجراء PIN مخفيًا.
- BiometricPrompt لا يكشف أي إصبع بعينه.
- لا تقرأ الخدمة محتوى الشاشة ولا تسجل ضغطات المفاتيح ولا تخفي نفسها.

لخطوات الإعداد والتحقق والخروج، راجع `docs/DEVICE_OWNER_KIOSK_AR.md`.
