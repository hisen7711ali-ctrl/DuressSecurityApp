# Duress Security App

تطبيق Android أمني وتجريبي يجمع بين واجهة آلة حاسبة عادية، بوابة حماية PIN، التخزين الآمن، App Lock وتكاملات Android الأصلية.

> **الحالة:** المشروع قيد التطوير والتحقق عبر GitHub Actions. لا يُعتبر أي APK نهائيًا إلا بعد نجاح الاختبارات، TypeScript، بناء Android، وفحوصات الـAPK النهائية.

## الواجهة الحالية

عند فتح التطبيق تظهر **الآلة الحاسبة** كواجهة أولى عادية وملء الشاشة، مع زر `0` عريض ومتمركز. لا يوجد زر حماية ظاهر داخل الحاسبة.

### مسار الدخول المخفي

التسلسل الحالي والدقيق هو:

**`0` → `×` → `0` → `×` → `0` → `×` → `9` → `=`**

أي أن الرمز الكامل هو:

**`0×0×0×9=`**

بعد إدخال هذا التسلسل من شاشة الحاسبة المقفلة، تفتح **بوابة الحماية مباشرة** بعد `=` وتطلب PIN. لا يوجد زر وسيط، ولا نافذة مؤقتة، ولا اعتماد على الشبكة.

التسلسل تتم معالجته كمسار دخول مخفي منفصل عن الحساب العادي، مع بقاء الحاسبة نفسها حقيقية ولا تستخدم JavaScript `eval`.

## أوضاع PIN

| PIN | الوظيفة |
|---|---|
| `0000` | Master / الدخول العادي إلى مساحة الحماية |
| `7777` | Emergency wipe لبيانات التطبيق المملوكة له فقط |
| `5555` | Extended Lock لمدة 30 يومًا مع حفظ الحالة |
| `4444` | Fake Calculator Mode |
| PIN آخر | رفض المحاولة وحماية من المحاولات المتكررة |

هذه القيم افتراضية/اختبارية للمشروع وليست بديلًا عن PIN نظام Android.

### Emergency `7777`

المسح الطارئ محصور في **بيانات التطبيق التي يملكها التطبيق**. لا يوجد مسار لتنفيذ Android Factory Reset أو مسح بيانات الهاتف الشخصية.

### Extended Lock `5555`

يحفظ التطبيق حالة القفل ومدة الثلاثين يومًا ضمن التخزين الأمني ويحاول استعادتها بعد إعادة التشغيل ضمن قيود Android.

## الأيقونة والهوية البصرية

الأيقونة الحالية مرتبطة بالحاسبة نفسها وليست أيقونة Android Robot أو درعًا أمنيًا عامًا.

- تصميم VectorDrawable احترافي على شكل آلة حاسبة.
- شاشة عرض واضحة وأزرار keypad داخل الأيقونة.
- `android:icon` و`android:roundIcon` يستخدمان نفس مصدر الأيقونة النهائي.
- `android-setup.mjs` هو المصدر النهائي للأيقونة أثناء البناء، حتى لا تعيد Capacitor أو خطوة لاحقة أيقونة قديمة.
- اسم التطبيق الظاهر حاليًا: **الآلة الحاسبة**.
- Package الداخلي: `com.duresssecurity.app`.

## حماية جلسة التطبيق

- تُقفل جلسة التطبيق عند انتقال WebView إلى الخلفية إذا كانت الجلسة مفتوحة.
- `MainActivity.onStop()` يرسل إشارة native إضافية لإعادة القفل.
- عند إعادة تشغيل العملية، لا يُفترض أن جلسة مفتوحة سابقة ما زالت موثوقة.
- أخطاء التخزين الأمني في مسارات الحماية تعمل بأسلوب **fail-closed** بدل السماح التلقائي.

## App Lock وقفل التطبيقات الأخرى

عند منح Accessibility permission يمكن استخدام App Lock للتطبيقات المحددة في السياسة.

- بوابة PIN قبل الوصول إلى التطبيقات المحمية.
- عداد محاولات محفوظ لكل package.
- إعادة عرض البوابة لا تصفر العداد.
- الحظر المؤقت محفوظ مع عدد المحاولات.
- فشل قراءة أو فك تشفير حالة المحاولات لا يتحول إلى fail-open.

## التخزين والتشفير

- Android Keystore لإدارة مفاتيح التشفير.
- AES-GCM للبيانات الحساسة.
- Secure Storage أصلي.
- حماية vault من العبث.
- retry lockout محفوظ.
- PBKDF2 + AES-GCM للـvault بدون plaintext fallback.
- emergency reset محصور ببيانات التطبيق.

## Android Native

يتضمن المشروع:

- `DevicePolicyManager.lockNow()` عبر Device Admin عند توفر الصلاحية.
- `BiometricPrompt`.
- Android Keystore Secure Storage.
- Permission status/request handling.
- اكتشاف التطبيقات القابلة للتشغيل ضمن حدود Android.
- Accessibility App Lock.
- Device Owner / Kiosk عند provisioning الرسمي.
- سياسات منع إزالة التطبيق عندما تسمح إدارة الجهاز بذلك.
- Boot/restart handling ضمن قيود Android الحديثة.

### Android build

- `MainActivity.kt` يتم تضمينه صراحة في Android app module.
- Native security classes يتم نسخها إلى المشروع Android أثناء الإعداد.
- Java/Kotlin موحدان حاليًا على **JVM 21**.
- يستخدم المشروع Kotlin Android plugin.
- compile/target SDK الحالي: **35**.
- يتم إزالة `INTERNET` و`ACCESS_NETWORK_STATE` من الـmanifest النهائي.

## Device Owner / Kiosk

Device Owner وKiosk مخصصان للأجهزة التي يمكن Provisioning لها رسميًا. التطبيق العادي لا يستطيع جعل نفسه Device Owner تلقائيًا، ولا يستطيع استبدال Android Keyguard الحقيقي.

## القيود الحقيقية في Android

- التطبيق لا يستبدل **Android Keyguard**.
- `BiometricPrompt` القياسي لا يكشف هوية الإصبع/البصمة المستخدمة.
- PIN التطبيق لا يقرأ أو يغير PIN النظام.
- `5555` لا يمنع boot ولا يستبدل حماية Android عند الإقلاع.
- `7777` لا ينفذ Factory Reset.
- التشغيل من الخلفية والـoverlays وboot behavior تخضع لقيود Android وإصدار الجهاز.
- منع الإزالة بشكل قوي يعتمد على Device Owner؛ Device Admin العادي لا يجعل التطبيق غير قابل للإزالة مطلقًا.
- Accessibility App Lock يحتاج صلاحية يمنحها المستخدم.

## Screenshots

لا يتم فرض `FLAG_SECURE` على الحاسبة أو شاشات الحماية/الإعدادات الحالية، لذلك يمكن أخذ screenshots لأغراض الاختبار والتوثيق، مع بقاء القيود التي قد تفرضها Android أو الشاشات النظامية.

## Offline-first

التطبيق مصمم للعمل دون خادم خارجي أثناء التشغيل.

- Network guard يمنع الاتصالات إلى origins خارجية.
- لا توجد سماحية تشغيلية لـ`grok.com` أو نطاق خارجي ضمن مسار التطبيق.
- يتم فحص الـmanifest النهائي للتأكد من عدم وجود `INTERNET` أو `ACCESS_NETWORK_STATE`.
- GitHub Actions وبيئة التطوير تحتاجان الإنترنت فقط أثناء البناء لتنزيل dependencies وAndroid SDK/Gradle؛ التطبيق نفسه لا يحتاج الشبكة أثناء التشغيل.

## الاختبارات والتحقق

تشمل الاختبارات regression والأمان، من ضمنها:

- PIN وDuress PIN.
- Extended Lock وحفظ/انتهاء الحالة.
- emergency wipe ضمن نطاق بيانات التطبيق.
- Android Keystore وAES-GCM.
- Biometric bridge.
- Device Owner/Kiosk guards.
- Accessibility App Lock وحفظ المحاولات.
- fail-closed عند أخطاء التخزين.
- vault tamper detection.
- منع Factory Reset.
- ظهور الحاسبة أولًا وملء الشاشة.
- تمركز زر الصفر العريض.
- التسلسل السري الدقيق **`0×0×0×9=`** وفتحه المباشر لبوابة الحماية.
- عدم وجود زر حماية مرئي أو مسار owner قديم.
- وجود `MainActivity.kt` وNative Kotlin classes.
- اتساق JVM 21.
- فحوصات network guard والـoffline manifest.
- فحص أن أيقونة الـlauncher مرتبطة بتصميم آلة حاسبة فعلي.

عدد الاختبارات يتغير مع المشروع؛ المرجع النهائي هو نتيجة GitHub Actions للـcommit المطلوب اعتماده.

## بنية المشروع

```text
src/
  components/          واجهة التطبيق والحاسبة وبوابات الحماية
  lib/                 الأمن والتخزين والـvault والـnative bridge
  styles/              تنسيقات الواجهة والحاسبة

android-native/
  plugin/              Kotlin security bridge وSecure Storage وApp Lock
  mainactivity-patch/  MainActivity.kt
  manifest-additions.xml

scripts/
  android-setup.mjs   إعداد Android النهائي
  build-apk.mjs       بناء Debug APK
  *.test.mjs          اختبارات regression والأمان

.github/workflows/
  android-debug.yml
  android-build-diagnostic.yml
```

## البناء محليًا

```bash
npm install
npm test
npm run typecheck
npm run apk:debug
```

أوامر Android الإضافية:

```bash
npm run android:setup
npm run android:sync
npm run android:open
```

الأمر الرئيسي لبناء Debug APK:

```bash
npm run apk:debug
```

لا ينبغي اعتبار وجود APK وحده دليلًا على سلامة الإصدار؛ يجب نجاح الاختبارات وفحوصات الـmanifest والـAPK في CI.

## CI / GitHub Actions

مسار Android CI يتحقق من:

1. dependencies.
2. اختبارات المشروع.
3. TypeScript.
4. إعداد Android وNative Kotlin.
5. بناء Debug APK.
6. فحص الـAPK والـmanifest النهائي.
7. التحقق من عدم وجود صلاحيات الشبكة غير المطلوبة.
8. رفع APK كـartifact عند نجاح البناء.

الإصدار القابل للتجربة يعتبر صالحًا فقط عندما تنجح جميع مراحل CI المطلوبة ويظهر artifact للـAPK.

## ملاحظات الاستخدام

هذا مشروع أمني/تجريبي ولا يستبدل ميزات أمان Android الأصلية. لا تعتمد على PINات المشروع بدل قفل النظام، ولا تفترض أن التطبيق يستطيع التحكم الكامل بالجهاز بدون صلاحيات Android المناسبة. اختبر Device Admin وAccessibility وKiosk على جهاز مخصص قبل الاستخدام العملي.

لا يُسمى APK "نهائيًا" إلا بعد نجاح CI والتحقق من الـAPK الناتج.

## الترخيص

راجع ملفات الترخيص الموجودة في المستودع قبل إعادة التوزيع أو الاستخدام التجاري.
