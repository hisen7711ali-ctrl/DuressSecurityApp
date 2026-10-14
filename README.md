# Duress Security App

تطبيق Android أمني وتجريبي بواجهة **آلة حاسبة محلية**، وبوابة حماية PIN، وتخزين آمن، وApp Lock وتكاملات Android الأصلية.

> **الحالة:** المشروع قيد التطوير والتحقق عبر GitHub Actions. لا يُعتبر أي APK نهائيًا إلا بعد نجاح الاختبارات، TypeScript، بناء Android وفحوصات الـAPK النهائية.

## الواجهة والدخول المخفي

عند فتح التطبيق تظهر الآلة الحاسبة كواجهة أولى عادية وملء الشاشة، بدون زر حماية ظاهر.

### رمز الدخول المخفي

التسلسل الحالي والدقيق هو:

**`2 → 0 → 2 → 7 → 2 → 0 → 0 → 6 → =`**

أي أن الرمز الكامل هو:

**`20272006=`**

بعد الضغط على `=` بعد الرقم الثامن، يجب أن تنتقل الحاسبة مباشرة إلى **بوابة الحماية PIN**. لا يوجد ضغط متكرر على `=`، ولا زر وسيط، ولا اعتماد على الإنترنت.

الحاسبة نفسها حقيقية ولا تستخدم JavaScript `eval` لتنفيذ العمليات.

## PIN والحماية

| PIN | الوظيفة |
|---|---|
| `0000` | Master PIN — الدخول العادي إلى مساحة الحماية |
| `4444` | Duress / Fake Calculator Mode |
| `5555` | Extended Lock لمدة 30 يومًا |
| `7777` | Emergency wipe لبيانات التطبيق المملوكة له فقط |
| PIN آخر | رفض المحاولة مع حماية من المحاولات المتكررة |

عند إدخال **`0000`** في بوابة الحماية، يتم قبول الـPIN تلقائيًا بعد الرقم الرابع والدخول إلى التطبيق المحمي، بدون زر تأكيد إضافي.

هذه القيم افتراضية/اختبارية للمشروع وليست بديلًا عن PIN نظام Android.

### Emergency `7777`

المسح الطارئ محصور في بيانات التطبيق التي يملكها التطبيق. لا ينفذ Android Factory Reset ولا يمسح بيانات الهاتف الشخصية.

### Extended Lock `5555`

يحفظ التطبيق حالة القفل ومدة الثلاثين يومًا ضمن التخزين الأمني ويحاول استعادتها بعد إعادة التشغيل ضمن قيود Android.

## Offline / Local App

التطبيق مصمم ليعمل **بدون اتصال إنترنت أثناء التشغيل**.

- واجهة التطبيق وملفات WebView مضمّنة محليًا داخل الـAPK.
- لا يعتمد التطبيق على موقع ويب أو خادم خارجي لعرض الشاشة الرئيسية.
- إعداد Capacitor يستخدم `dist/client` كـ`webDir` محلي.
- لا توجد سماحية تشغيلية لـ`INTERNET` أو `ACCESS_NETWORK_STATE` في الـmanifest النهائي.
- GitHub Actions وبيئة التطوير تحتاجان الإنترنت فقط أثناء البناء وتنزيل dependencies وAndroid SDK/Gradle.

> ملاحظة: الواجهة مبنية بتقنيات Web UI لكنها **معبأة محليًا داخل تطبيق Android** وليست موقعًا خارجيًا يتم تحميله من الإنترنت.

## الأيقونة والهوية البصرية

- أيقونة launcher مرتبطة بتصميم آلة حاسبة.
- `android:icon` و`android:roundIcon` يستخدمان مصدر الأيقونة النهائي.
- `android-setup.mjs` يجهز موارد Android النهائية أثناء البناء.
- اسم التطبيق الظاهر: **الآلة الحاسبة**.
- Package: `com.duresssecurity.app`.

## حماية جلسة التطبيق

- عند فتح بوابة الحماية من الحاسبة يتم تعطيل استعادة الحاسبة أثناء انتقال الدخول.
- بعد نجاح Master PIN لا يفترض أن تعيد أحداث visibility/background المؤقتة المستخدم مباشرة إلى الحاسبة.
- جلسة التطبيق تُقفل عند الانتقال للخلفية وفق سياسة الحماية.
- `MainActivity.onStop()` يرسل إشارة native إضافية لإعادة القفل عند الحاجة.
- أخطاء التخزين الأمني في مسارات الحماية تعمل بأسلوب **fail-closed**.

## App Lock

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
- Accessibility App Lock.
- Device Owner / Kiosk عند provisioning الرسمي.
- Boot/restart handling ضمن قيود Android الحديثة.

### Android build

- `MainActivity.kt` يتم تضمينه صراحة في Android app module.
- Native security classes يتم نسخها إلى مشروع Android أثناء الإعداد.
- Java/Kotlin موحدان على **JVM 21**.
- يستخدم المشروع Kotlin Android plugin.
- compile/target SDK: **35**.
- يتم فحص الـmanifest النهائي للتأكد من عدم وجود صلاحيات الشبكة غير المطلوبة.

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

## الاختبارات والتحقق

تشمل اختبارات المشروع regression والأمان، ومنها:

- Master PIN وDuress PIN.
- Extended Lock وحفظ/انتهاء الحالة.
- Emergency wipe ضمن نطاق بيانات التطبيق.
- Android Keystore وAES-GCM.
- Biometric bridge.
- Device Owner/Kiosk guards.
- Accessibility App Lock وحفظ المحاولات.
- fail-closed عند أخطاء التخزين.
- vault tamper detection.
- منع Factory Reset.
- ظهور الحاسبة أولًا وملء الشاشة.
- تمركز زر الصفر العريض.
- التسلسل السري الدقيق **`20272006=`** وفتح بوابة الحماية مباشرة.
- قبول **`0000`** تلقائيًا بعد الرقم الرابع والدخول إلى التطبيق المحمي.
- عدم وجود زر حماية مرئي أو مسار owner قديم.
- وجود `MainActivity.kt` وNative Kotlin classes.
- اتساق JVM 21.
- فحوصات network guard والـoffline manifest.
- فحص أيقونة launcher المرتبطة بتصميم آلة حاسبة فعلي.

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

وجود APK وحده لا يكفي لاعتماد الإصدار؛ يجب نجاح الاختبارات وفحوصات الـmanifest والـAPK في CI.

## CI / GitHub Actions

مسار Android CI يتحقق من:

1. تثبيت dependencies.
2. اختبارات المشروع.
3. TypeScript.
4. إعداد Android وNative Kotlin.
5. بناء Debug APK.
6. فحص الـAPK والـmanifest النهائي.
7. التحقق من عدم وجود صلاحيات الشبكة غير المطلوبة.
8. رفع APK كـartifact عند نجاح البناء.

الإصدار القابل للتجربة يعتبر صالحًا فقط عندما تنجح جميع مراحل CI المطلوبة ويظهر artifact للـAPK.

## ملاحظات الاستخدام

هذا مشروع أمني/تجريبي ولا يستبدل ميزات أمان Android الأصلية. لا تعتمد على PINات المشروع بدل قفل النظام، ولا تفترض أن التطبيق يستطيع تجاوز قيود Android أو صلاحيات النظام.
