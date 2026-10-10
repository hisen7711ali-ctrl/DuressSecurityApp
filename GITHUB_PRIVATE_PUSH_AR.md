# رفع النسخة المحدّثة إلى المستودع الخاص

الرابط الذي أرسله مالك المشروع هو:

`https://github.com/abdullah77alhaj-coder/DuressSecurityApp`

الصورة المرفقة تُظهر صفحة Quick setup، أي أن المستودع كان فارغًا وقت التقاطها. أداة GitHub المتاحة في جلسة العمل لا تستطيع قراءة المستودع الخاص (ترجع 404)، لذلك لم أرفع commit ولم أغيّر إعدادات الحساب.

## الطريقة المحلية من Windows

1. نزّل `DuressSecurityApp-updated-safe.zip` وفك الضغط عنه إلى مجلد عادي.
2. افتح المجلد الداخلي الذي يحتوي `package.json` و`src/` و`.gitignore`.
3. افتح PowerShell في ذلك المجلد، ثم نفّذ:

```powershell
git init -b main
git remote add origin https://github.com/abdullah77alhaj-coder/DuressSecurityApp.git
git add .
git status
git commit -m "Improve calculator entry and encrypted vault"
git push -u origin main
```

سيطلب GitHub تسجيل الدخول/التفويض من خلال Git Credential Manager أو وسيلة الدخول الموجودة على جهازك. لا تكتب token داخل الأمر، ولا تضعه في ملف المشروع. قبل `git add .` تأكد أن مجلد `node_modules/` غير مضمّن؛ `.gitignore` يستثنيه.

## إذا رفض GitHub الوصول

- افتح GitHub من المتصفح وتأكد أن الحساب هو `abdullah77alhaj-coder` وأن المستودع ظاهر عندك.
- في إعدادات GitHub > Applications > Installed GitHub Apps، افتح إعدادات التطبيق المتصل واختر السماح للمستودع `DuressSecurityApp` إذا كان ذلك متاحًا.
- أعد محاولة قراءة المستودع من التكامل. لا يمكن دفع الملفات من هذه الجلسة قبل ظهور صلاحية الوصول.
