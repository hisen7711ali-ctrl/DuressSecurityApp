# Duress Security App

تطبيق أمان وDuress لنظام Android، مبني حول قفل التطبيق، أوضاع PIN متعددة، التخزين الآمن، والتكاملات الأصلية مع Android.

## الوظائف الرئيسية

- `0000` — الدخول العادي / Master access.
- `7777` — وضع الطوارئ: يمسح بيانات التطبيق التي يملكها التطبيق فقط، ولا ينفذ Factory Reset للهاتف.
- `5555` — Extended Lock لمدة 30 يومًا مع حفظ الحالة واستعادتها بعد إعادة التشغيل عندما تسمح قيود Android بذلك.
- `4444` — Fake Calculator Mode بواجهة آلة حاسبة عادية.
- PIN غير صحيح — رفض المحاولة وتسجيل الفشل وفق حماية المحاولات المتكررة.

## الأمان

- Android Keystore لتخزين مفاتيح التشفير.
- AES-GCM للتخزين الحساس.
- حماية من العبث ببيانات الـvault ومحاولات PIN المتكررة.
- Fail-closed عند فشل التخزين الآمن.
- `FLAG_SECURE` في الأنشطة الحساسة.

## Android Native

يتضمن المشروع تكاملات لـ Device Admin و`DevicePolicyManager.lockNow()`، BiometricPrompt، Secure Storage، Permission handling، Launchable Apps، Accessibility App Lock، Device Owner/Kiosk، وسياسات منع إزالة التطبيق عند توفر Device Owner.

## Device Owner / Kiosk

هذه الوظائف مخصصة للأجهزة المخصصة أو أجهزة الاختبار التي يمكن Provisioning لها كـDevice Owner. لا يستطيع التطبيق العادي أن يجعل نفسه Device Owner تلقائيًا أو أن يستبدل Android Keyguard.

يجب توفير مسار خروج واسترداد واضح قبل تفعيل Kiosk على جهاز مخصص.

## قيود Android المعروفة

- لا يستبدل التطبيق Android Keyguard الحقيقي.
- BiometricPrompt القياسي لا يكشف هوية الإصبع المستخدم.
- PIN التطبيق لا يستطيع قراءة أو تغيير PIN النظام.
- `5555` لا يمنع إقلاع الهاتف ولا يستبدل حماية Android عند الإقلاع.
- `7777` لا ينفذ Factory Reset؛ المسح محصور ببيانات التطبيق المملوكة له.
- تشغيل الواجهة تلقائيًا بعد الإقلاع يخضع لقيود Android الحديثة على التشغيل في الخلفية.

## الاختبارات

تم التحقق من النسخة المدمجة باجتياز:

- **206/206** اختبارات scripts.
- **27/27** اختبارات TypeScript الأمنية وNative Bridge.

وتشمل الاختبارات مسارات PIN، Extended Lock، emergency wipe، Android Keystore، Biometric bridge، Device Owner/Kiosk guards، app locking، retry lockout، vault tamper detection، ومنع Factory Reset ضمن emergency reset.

## بنية المشروع

- `src/` — منطق التطبيق والواجهة والخدمات الأمنية.
- `android-native/` — تكاملات Android الأصلية.
- `scripts/` — الاختبارات والأدوات.
- `docs/` — التوثيق.
- `archive/source-variants/` — ملفات فريدة محفوظة من النسخ السابقة التي تمت مراجعتها أثناء الدمج.
- `MERGED_VERSIONS_AR.md` — سجل الدمج.

## التطوير

ثبّت متطلبات Node/npm الخاصة بالمشروع ثم شغّل الاختبارات قبل إجراء تعديلات. وظائف Android Native تحتاج Android SDK/Gradle مناسبين. وظائف Device Owner/Kiosk تحتاج جهازًا مخصصًا أو بيئة اختبار مع provisioning رسمي.

## ملاحظة

وجود المصدر في GitHub لا يعني أن APK تم بناؤه بنجاح. لا يتم اعتبار APK جاهزًا إلا بعد تنفيذ build فعلي والتحقق من نتيجته.
