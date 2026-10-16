package com.duresssecurity.admin

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import androidx.biometric.BiometricManager
import com.duresssecurity.app.MainActivity

/**
 * Explicitly enabled Accessibility service used only to observe the foreground
 * package and gate packages selected by the owner. It does not read text,
 * screenshots, keystrokes or window content from other apps.
 *
 * Security invariant: a missing/corrupt/undecryptable policy fails CLOSED. The
 * service never interprets storage failure as "protection disabled".
 */
class AppLockAccessibilityService : AccessibilityService() {
    private var windowManager: WindowManager? = null
    private var lockView: View? = null
    private var currentTarget: String? = null
    private var unlockedTarget: String? = null
    private var attempts = 0
    private var blockedUntil = 0L
    private var errorView: TextView? = null
    private var maintenanceCountdownView: TextView? = null
    private var pinValue = ""
    private val pinDotViews = mutableListOf<View>()
    private val keypadButtons = mutableListOf<Button>()
    private val uiHandler = Handler(Looper.getMainLooper())
    private var retryTicker: Runnable? = null
    private var maintenanceTicker: Runnable? = null
    private var quoteTicker: Runnable? = null
    private var biometricUnlockReceiver: BroadcastReceiver? = null
    private var pendingBiometricTarget: String? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val target = intent?.getStringExtra(EXTRA_TARGET_PACKAGE) ?: return
                if (target != pendingBiometricTarget) return
                pendingBiometricTarget = null
                if (intent?.action == ACTION_BIOMETRIC_FAILED) {
                    unlockedTarget = null
                    return
                }
                unlockedTarget = target
                clearAttemptState(target)
                attempts = 0
                blockedUntil = 0L
                dismissGate()
            }
        }
        biometricUnlockReceiver = receiver
        val filter = IntentFilter().apply {
            addAction(ACTION_BIOMETRIC_UNLOCKED)
            addAction(ACTION_BIOMETRIC_FAILED)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                registerReceiver(receiver, filter)
            }
        } catch (_: Exception) {
            biometricUnlockReceiver = null
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val foregroundPackage = event.packageName?.toString() ?: return

        if (foregroundPackage == packageName) {
            if (lockView == null) {
                currentTarget = null
                unlockedTarget = null
            }
            return
        }

        if (foregroundPackage != unlockedTarget) unlockedTarget = null
        val policy = readPolicy()
        if (policy == null) {
            if (currentTarget != foregroundPackage || lockView == null) {
                showGate(foregroundPackage, storageUnavailable = true)
            }
            return
        }

        val shouldProtect = policy.enabled && policy.overlayEnabled &&
            policy.lockedPackages.contains(foregroundPackage) && foregroundPackage != packageName

        if (!shouldProtect) {
            dismissGate()
            currentTarget = null
            return
        }
        if (unlockedTarget == foregroundPackage && !isTargetMaintenanceActive(policy, foregroundPackage)) return
        val maintenanceUntil = targetMaintenanceUntil(policy, foregroundPackage)
        if (currentTarget != foregroundPackage || lockView == null || maintenanceUntil != activeMaintenanceUntil) {
            showGate(foregroundPackage, maintenanceUntil = maintenanceUntil)
        }
    }

    override fun onInterrupt() {
        // Accessibility can be interrupted temporarily by Android. Do not remove
        // an active protection gate here; the next foreground event reconciles it.
    }

    override fun onDestroy() {
        dismissGate()
        biometricUnlockReceiver?.let { receiver -> try { unregisterReceiver(receiver) } catch (_: Exception) { } }
        biometricUnlockReceiver = null
        super.onDestroy()
    }

    private data class Policy(
        val enabled: Boolean,
        val overlayEnabled: Boolean,
        val lockedPackages: Set<String>,
        val masterPin: String,
        val duressPin: String?,
        val extendedLockPin: String?,
        val wipePin: String?,
        val biometricEnabled: Boolean,
        val maintenancePackages: Map<String, Long>,
    )

    private data class AttemptState(val attempts: Int, val blockedUntil: Long)

    private var activeMaintenanceUntil: Long? = null

    private fun readPolicy(): Policy? {
        val raw = try { SecureStorage(this).get("duress-security-app") } catch (_: Exception) { null }
            ?: return null
        return try {
            val root = JSONObject(raw)
            val state = root.optJSONObject("state") ?: root
            val packages = state.optJSONArray("lockedPackages") ?: JSONArray()
            val locked = buildSet {
                for (index in 0 until packages.length()) {
                    packages.optString(index).takeIf { it.isNotBlank() }?.let(::add)
                }
            }
            val pins = state.optJSONObject("pins")
            val master = pins?.optString("master")?.takeIf { it.isNotBlank() } ?: return null
            val maintenanceRaw = try { SecureStorage(this).get(TARGET_MAINTENANCE_KEY) } catch (_: Exception) { null }
            val maintenanceJson = maintenanceRaw?.let { runCatching { JSONObject(it) }.getOrNull() }
            val maintenance = buildMap {
                if (maintenanceJson != null) {
                    maintenanceJson.keys().forEach { pkg ->
                        val until = maintenanceJson.optLong(pkg, 0L)
                        if (until > 0L) put(pkg, until)
                    }
                }
            }
            Policy(
                enabled = state.optBoolean("appLockEnabled", false),
                overlayEnabled = state.optBoolean("overlayEnabled", true),
                lockedPackages = locked,
                masterPin = master,
                duressPin = pins.optString("duress").takeIf { it.isNotBlank() },
                extendedLockPin = pins.optString("lock").takeIf { it.isNotBlank() },
                wipePin = pins.optString("format").takeIf { it.isNotBlank() },
                biometricEnabled = state.optBoolean("biometricEnabled", false),
                maintenancePackages = maintenance,
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun targetMaintenanceUntil(policy: Policy, targetPackage: String): Long? {
        val until = policy.maintenancePackages[targetPackage] ?: return null
        return if (until > System.currentTimeMillis()) until else null
    }

    private fun isTargetMaintenanceActive(policy: Policy, targetPackage: String): Boolean = targetMaintenanceUntil(policy, targetPackage) != null

    private fun writeTargetMaintenance(targetPackage: String, until: Long): Boolean {
        return try {
            val current = SecureStorage(this).get(TARGET_MAINTENANCE_KEY)
            val maintenance = if (current.isNullOrBlank()) JSONObject() else JSONObject(current)
            maintenance.put(targetPackage, until)
            SecureStorage(this).put(TARGET_MAINTENANCE_KEY, maintenance.toString())
        } catch (_: Exception) {
            false
        }
    }

    private fun clearTargetMaintenance(targetPackage: String): Boolean {
        return try {
            val current = SecureStorage(this).get(TARGET_MAINTENANCE_KEY) ?: return true
            val maintenance = JSONObject(current)
            maintenance.remove(targetPackage)
            if (maintenance.length() == 0) SecureStorage(this).remove(TARGET_MAINTENANCE_KEY)
            else SecureStorage(this).put(TARGET_MAINTENANCE_KEY, maintenance.toString())
        } catch (_: Exception) {
            false
        }
    }

    private fun attemptKey(targetPackage: String) = "duress-security-applock-attempts:$targetPackage"

    private fun loadAttemptState(targetPackage: String): AttemptState {
        return try {
            val raw = SecureStorage(this).get(attemptKey(targetPackage)) ?: return AttemptState(0, 0L)
            val obj = JSONObject(raw)
            AttemptState(
                attempts = obj.optInt("attempts", 0).coerceAtLeast(0),
                blockedUntil = obj.optLong("blockedUntil", 0L).coerceAtLeast(0L),
            )
        } catch (_: Exception) {
            AttemptState(Int.MAX_VALUE, Long.MAX_VALUE)
        }
    }

    private fun saveAttemptState(targetPackage: String, state: AttemptState): Boolean {
        return try {
            SecureStorage(this).put(
                attemptKey(targetPackage),
                JSONObject()
                    .put("attempts", state.attempts)
                    .put("blockedUntil", state.blockedUntil)
                    .toString(),
            )
        } catch (_: Exception) {
            false
        }
    }

    private fun clearAttemptState(targetPackage: String) {
        try { SecureStorage(this).remove(attemptKey(targetPackage)) } catch (_: Exception) { }
    }

    private fun showGate(targetPackage: String, storageUnavailable: Boolean = false, maintenanceUntil: Long? = null) {
        if (lockView != null && currentTarget == targetPackage && activeMaintenanceUntil == maintenanceUntil) return
        dismissGate()
        currentTarget = targetPackage
        activeMaintenanceUntil = maintenanceUntil
        pinValue = ""

        val persistedAttempts = loadAttemptState(targetPackage)
        attempts = persistedAttempts.attempts
        blockedUntil = persistedAttempts.blockedUntil

        val isArabic = currentLanguage().equals("ar", ignoreCase = true)
        val appLabel = try {
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(targetPackage, 0)).toString()
        } catch (_: Exception) {
            targetPackage
        }
        val appIcon = try { packageManager.getApplicationIcon(targetPackage) } catch (_: Exception) { null }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(22), dp(16), dp(22), dp(16))
            background = GradientDrawable().apply {
                setColor(Color.rgb(10, 17, 32))
                cornerRadius = dp(24).toFloat()
                setStroke(dp(1), Color.rgb(40, 220, 230))
            }
            isFocusableInTouchMode = true
            setOnKeyListener { _, keyCode, event ->
                keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP
            }
        }

        val appHeader = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        val icon = ImageView(this).apply {
            if (appIcon != null) setImageDrawable(appIcon)
            else setImageResource(android.R.drawable.sym_def_app_icon)
            contentDescription = appLabel
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(24, 255, 255, 255))
            }
            setPadding(dp(7), dp(7), dp(7), dp(7))
        }
        appHeader.addView(icon, LinearLayout.LayoutParams(dp(72), dp(72)))
        val appName = TextView(this).apply {
            text = appLabel
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, dp(7), 0, 0)
        }
        appHeader.addView(appName, matchWrap())

        val shield = TextView(this).apply {
            text = "◈"
            textSize = 30f
            setTextColor(Color.rgb(40, 220, 230))
            gravity = Gravity.CENTER
            setPadding(0, dp(4), 0, 0)
        }
        val title = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "الحماية الآمنة غير متاحة" else "Secure protection unavailable"
            } else if (maintenanceUntil != null) {
                if (isArabic) "التطبيق قيد الصيانة" else "App under maintenance"
            } else if (isArabic) "التطبيق محمي" else "App protected"
            textSize = 23f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        val subtitle = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "تعذر قراءة التخزين المشفر. الوصول مرفوض حتى استعادة الحالة الآمنة." else "Encrypted security storage could not be read. Access is denied until recovery."
            } else if (maintenanceUntil != null) {
                if (isArabic) "هذا التطبيق في وضع الصيانة لمدة 30 يوماً. أدخل الرمز الرئيسي لإلغاء الصيانة." else "This app is in maintenance for 30 days. Enter the master PIN to cancel maintenance."
            } else if (isArabic) {
                "أدخل الرمز الرئيسي للمتابعة"
            } else {
                "Enter the master PIN to continue"
            }
            textSize = 14f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(5), 0, dp(8))
        }

        val countdown = TextView(this).apply {
            textSize = 12f
            setTextColor(Color.rgb(40, 220, 230))
            gravity = Gravity.CENTER
            setPadding(0, dp(3), 0, dp(5))
        }
        maintenanceCountdownView = if (maintenanceUntil != null) countdown else null

        val quoteView = TextView(this).apply {
            text = maintenanceHint(0, isArabic)
            textSize = 12f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(4), dp(8), dp(8))
        }
        startQuoteTicker(quoteView, isArabic)

        val dots = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, dp(5), 0, dp(8))
        }
        pinDotViews.clear()
        repeat(4) {
            val dot = View(this).apply { background = makeDotBackground(false) }
            val params = LinearLayout.LayoutParams(dp(14), dp(14)).apply {
                marginStart = dp(8)
                marginEnd = dp(8)
            }
            dots.addView(dot, params)
            pinDotViews.add(dot)
        }

        keypadButtons.clear()
        val symbols = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        listOf("أ", "ي", "ع").forEach { key ->
            val button = createKeyButton(key, key, symbol = true, targetPackage = targetPackage)
            val params = LinearLayout.LayoutParams(dp(56), dp(32)).apply {
                marginStart = dp(5)
                marginEnd = dp(5)
                bottomMargin = dp(5)
            }
            symbols.addView(button, params)
            keypadButtons.add(button)
        }

        val numberPad = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        val keyRows = listOf(
            listOf("1", "2", "3"),
            listOf("4", "5", "6"),
            listOf("7", "8", "9"),
            listOf("back", "0", "ok"),
        )
        keyRows.forEach { rowKeys ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
            }
            rowKeys.forEach { key ->
                val label = when (key) {
                    "back" -> "⌫"
                    "ok" -> "✓"
                    else -> key
                }
                val button = createKeyButton(label, key, symbol = false, targetPackage = targetPackage)
                val params = LinearLayout.LayoutParams(dp(60), dp(60)).apply {
                    marginStart = dp(4)
                    marginEnd = dp(4)
                    topMargin = dp(3)
                    bottomMargin = dp(3)
                }
                row.addView(button, params)
                keypadButtons.add(button)
            }
            numberPad.addView(row, LinearLayout.LayoutParams(-2, -2))
        }

        val biometricAvailable = !storageUnavailable &&
            maintenanceUntil == null &&
            readPolicy()?.biometricEnabled == true &&
            BiometricManager.from(this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS
        val biometricButton = if (biometricAvailable) {
            Button(this).apply {
                text = if (isArabic) "استخدام البصمة" else "Use fingerprint"
                isAllCaps = false
                textSize = 14f
                setTextColor(Color.WHITE)
                background = GradientDrawable().apply {
                    cornerRadius = dp(12).toFloat()
                    setColor(Color.argb(26, 255, 255, 255))
                    setStroke(dp(1), Color.rgb(55, 76, 98))
                }
                setOnClickListener { dispatchBiometricRequest(targetPackage) }
            }
        } else null

        val error = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "استعد التخزين الآمن من داخل التطبيق" else "Recover secure storage from inside the app"
            } else " "
            textSize = 12f
            setTextColor(Color.rgb(255, 105, 105))
            gravity = Gravity.CENTER
            setPadding(0, dp(6), 0, dp(2))
        }
        val footer = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "لا يتم تجاوز فشل التخزين تلقائيًا" else "Storage failure never disables protection"
            } else if (maintenanceUntil != null) {
                if (isArabic) "الرمز الرئيسي يلغي صيانة هذا التطبيق فقط" else "The master PIN cancels maintenance for this app only"
            } else if (isArabic) {
                "أدخل الرمز الرئيسي من لوحة الأرقام"
            } else {
                "Use the on-screen PIN keypad"
            }
            textSize = 11f
            setTextColor(Color.GRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(5), 0, 0)
        }

        root.addView(appHeader, matchWrap())
        root.addView(shield, matchWrap())
        root.addView(title, matchWrap())
        root.addView(subtitle, matchWrap())
        if (maintenanceUntil != null) root.addView(countdown, matchWrap())
        root.addView(quoteView, matchWrap())
        root.addView(dots, matchWrap())
        root.addView(symbols, matchWrap())
        root.addView(numberPad, matchWrap())
        if (biometricButton != null) root.addView(biometricButton, LinearLayout.LayoutParams(-1, dp(44)).apply { topMargin = dp(6) })
        root.addView(error, matchWrap())
        root.addView(footer, matchWrap())

        errorView = error
        lockView = root
        updatePinDots()

        try {
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_SECURE,
                PixelFormat.TRANSLUCENT,
            ).apply { gravity = Gravity.CENTER }
            windowManager?.addView(root, params)
            if (storageUnavailable) {
                setKeypadEnabled(false)
            } else if (blockedUntil > System.currentTimeMillis()) {
                setKeypadEnabled(false)
                showBlockedMessage()
                if (blockedUntil != Long.MAX_VALUE) startRetryTicker(targetPackage)
            }
            if (maintenanceUntil != null) startMaintenanceTicker(targetPackage, maintenanceUntil)
        } catch (_: Exception) {
            lockView = null
            currentTarget = null
            activeMaintenanceUntil = null
            stopUiTickers()
        }
    }

    private fun createKeyButton(label: String, key: String, symbol: Boolean, targetPackage: String): Button {
        val isAction = key == "ok"
        val isBack = key == "back"
        return Button(this).apply {
            text = label
            isAllCaps = false
            textSize = if (symbol) 16f else 26f
            minWidth = 0
            minHeight = 0
            setPadding(0, 0, 0, 0)
            gravity = Gravity.CENTER
            setTextColor(if (isAction) Color.rgb(6, 18, 29) else Color.WHITE)
            background = GradientDrawable().apply {
                if (symbol) {
                    cornerRadius = dp(18).toFloat()
                    setColor(Color.argb(26, 255, 255, 255))
                    setStroke(dp(1), Color.argb(45, 255, 255, 255))
                } else {
                    shape = GradientDrawable.OVAL
                    setColor(
                        when {
                            isAction -> Color.rgb(40, 220, 230)
                            isBack -> Color.TRANSPARENT
                            else -> Color.argb(26, 255, 255, 255)
                        },
                    )
                }
            }
            contentDescription = when (key) {
                "back" -> if (currentLanguage().equals("ar", true)) "حذف رقم" else "Delete digit"
                "ok" -> if (currentLanguage().equals("ar", true)) "تأكيد الرمز" else "Confirm PIN"
                else -> key
            }
            isEnabled = true
            setOnClickListener { view ->
                view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                handleKey(targetPackage, key)
            }
        }
    }

    private fun handleKey(targetPackage: String, key: String) {
        if (lockView == null || currentTarget != targetPackage) return
        if (blockedUntil > System.currentTimeMillis()) {
            showBlockedMessage()
            return
        }
        when (key) {
            "back" -> if (pinValue.isNotEmpty()) pinValue = pinValue.dropLast(1)
            "ok" -> {
                verifyPin(targetPackage)
                return
            }
            else -> if (pinValue.length < 4) pinValue += key
        }
        updatePinDots()
        errorView?.text = " "
        if (pinValue.length == 4) {
            uiHandler.postDelayed({
                if (lockView != null && currentTarget == targetPackage && pinValue.length == 4) {
                    verifyPin(targetPackage)
                }
            }, 80L)
        }
    }

    private fun verifyPin(targetPackage: String) {
        val now = System.currentTimeMillis()
        if (now < blockedUntil) {
            showBlockedMessage()
            return
        }
        if (pinValue.length != 4) {
            errorView?.text = if (currentLanguage().equals("ar", true)) "أدخل أربعة رموز" else "Enter four characters"
            return
        }

        val policy = readPolicy()
        if (policy == null) {
            errorView?.text = if (currentLanguage().equals("ar", true)) "التخزين الآمن غير متاح" else "Secure storage is unavailable"
            setKeypadEnabled(false)
            return
        }

        val typed = normalizePin(pinValue)
        val master = normalizePin(policy.masterPin)
        val maintenanceUntil = targetMaintenanceUntil(policy, targetPackage)

        if (typed == master) {
            if (maintenanceUntil != null) {
                if (!clearTargetMaintenance(targetPackage)) {
                    errorView?.text = if (currentLanguage().equals("ar", true)) "تعذّر حفظ إلغاء صيانة هذا التطبيق." else "Could not save maintenance recovery for this app."
                    return
                }
            }
            unlockedTarget = targetPackage
            clearAttemptState(targetPackage)
            attempts = 0
            blockedUntil = 0L
            dismissGate()
            return
        }

        if (maintenanceUntil != null) {
            recordFailedAttempt(targetPackage, now)
            return
        }

        if (policy.extendedLockPin?.let { typed == normalizePin(it) } == true) {
            val until = now + 30L * 24L * 60L * 60L * 1000L
            if (!writeTargetMaintenance(targetPackage, until)) {
                errorView?.text = if (currentLanguage().equals("ar", true)) "تعذّر حفظ صيانة هذا التطبيق؛ بقي محميًا." else "Could not save maintenance for this app; it remains protected."
                return
            }
            pinValue = ""
            updatePinDots()
            val refreshed = readPolicy()
            showGate(targetPackage, maintenanceUntil = targetMaintenanceUntil(refreshed ?: policy, targetPackage))
            return
        }

        // 4444 keeps its existing duress/camouflage meaning and 7777 keeps the
        // existing app-owned wipe flow. Both values are always read from the
        // current encrypted policy; there are no hard-coded old PINs here.
        val isOwnerAction = typed.isNotEmpty() && (
            policy.duressPin?.let { typed == normalizePin(it) } == true ||
            policy.wipePin?.let { typed == normalizePin(it) } == true
        )
        if (isOwnerAction) {
            dispatchOwnerPinAction(targetPackage, typed)
            return
        }

        recordFailedAttempt(targetPackage, now)
    }

    private fun recordFailedAttempt(targetPackage: String, now: Long) {
        attempts = (attempts + 1).coerceAtMost(1_000_000)
        pinValue = ""
        updatePinDots()
        if (attempts >= 5) {
            blockedUntil = now + 15_000L
            if (!saveAttemptState(targetPackage, AttemptState(attempts, blockedUntil))) {
                blockUntilStorageRecovers()
                return
            }
            setKeypadEnabled(false)
            showBlockedMessage()
            startRetryTicker(targetPackage)
        } else {
            if (!saveAttemptState(targetPackage, AttemptState(attempts, blockedUntil))) {
                blockUntilStorageRecovers()
                return
            }
            errorView?.text = if (currentLanguage().equals("ar", true)) "الرمز غير صحيح" else "Incorrect PIN"
        }
    }

    private fun dispatchBiometricRequest(targetPackage: String) {
        val policy = readPolicy()
        val canAuthenticate = BiometricManager.from(this)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS
        if (policy?.biometricEnabled != true || !canAuthenticate) {
            errorView?.text = if (currentLanguage().equals("ar", true)) {
                "البصمة غير مفعّلة أو لا توجد بصمة جاهزة على الجهاز."
            } else {
                "Biometric unlock is disabled or no biometric is enrolled."
            }
            return
        }
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            errorView?.text = if (currentLanguage().equals("ar", true)) {
                "تعذّر فتح بوابة البصمة."
            } else {
                "Could not open the biometric verification screen."
            }
            return
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        launchIntent.putExtra(MainActivity.EXTRA_APP_LOCK_BIOMETRIC_TARGET, targetPackage)
        try {
            pendingBiometricTarget = targetPackage
            startActivity(launchIntent)
            dismissGate()
        } catch (_: Exception) {
            pendingBiometricTarget = null
            errorView?.text = if (currentLanguage().equals("ar", true)) {
                "تعذّر فتح التحقق بالبصمة؛ بقي التطبيق الهدف محميًا."
            } else {
                "Could not open biometric verification; the target app remains protected."
            }
        }
    }

    private fun dispatchOwnerPinAction(targetPackage: String, pin: String) {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            errorView?.text = if (currentLanguage().equals("ar", true)) {
                "تعذّر فتح بوابة الحماية الرئيسية لتنفيذ الرمز."
            } else {
                "Could not open the main security gate to process this PIN."
            }
            return
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        launchIntent.putExtra(MainActivity.EXTRA_OWNER_PIN_ACTION, pin)
        launchIntent.putExtra(MainActivity.EXTRA_OWNER_PIN_TARGET_PACKAGE, targetPackage)
        try {
            startActivity(launchIntent)
            dismissGate()
        } catch (_: Exception) {
            errorView?.text = if (currentLanguage().equals("ar", true)) {
                "تعذّر فتح التطبيق الرئيسي؛ بقي التطبيق الهدف محميًا."
            } else {
                "Could not open the main app; the target app remains protected."
            }
        }
    }

    private fun startQuoteTicker(view: TextView, isArabic: Boolean) {
        quoteTicker?.let { uiHandler.removeCallbacks(it) }
        val ticker = object : Runnable {
            private var index = 0
            override fun run() {
                if (lockView == null) { quoteTicker = null; return }
                index = (index + 1) % MAINTENANCE_HINTS.size
                view.text = maintenanceHint(index, isArabic)
                uiHandler.postDelayed(this, 5000L)
            }
        }
        quoteTicker = ticker
        uiHandler.postDelayed(ticker, 5000L)
    }

    private fun startMaintenanceTicker(targetPackage: String, until: Long) {
        maintenanceTicker?.let { uiHandler.removeCallbacks(it) }
        val ticker = object : Runnable {
            override fun run() {
                if (lockView == null || currentTarget != targetPackage || activeMaintenanceUntil != until) {
                    maintenanceTicker = null
                    return
                }
                val remaining = (until - System.currentTimeMillis()).coerceAtLeast(0L)
                if (remaining <= 0L) {
                    clearTargetMaintenance(targetPackage)
                    maintenanceTicker = null
                    dismissGate()
                    return
                }
                val totalSeconds = remaining / 1000L
                val days = totalSeconds / 86400L
                val hours = (totalSeconds % 86400L) / 3600L
                val minutes = (totalSeconds % 3600L) / 60L
                val seconds = totalSeconds % 60L
                maintenanceCountdownView?.text = if (currentLanguage().equals("ar", true)) {
                    "المتبقي: ${days}ي ${hours}س ${minutes}د ${seconds}ث"
                } else {
                    "Remaining: ${days}d ${hours}h ${minutes}m ${seconds}s"
                }
                uiHandler.postDelayed(this, 1000L)
            }
        }
        maintenanceTicker = ticker
        uiHandler.post(ticker)
    }

    private fun stopUiTickers() {
        retryTicker?.let { uiHandler.removeCallbacks(it) }
        maintenanceTicker?.let { uiHandler.removeCallbacks(it) }
        quoteTicker?.let { uiHandler.removeCallbacks(it) }
        retryTicker = null
        maintenanceTicker = null
        quoteTicker = null
    }

    private fun showBlockedMessage() {
        val isArabic = currentLanguage().equals("ar", true)
        if (blockedUntil == Long.MAX_VALUE) {
            errorView?.text = if (isArabic) {
                "تعذر التحقق من سجل المحاولات؛ الوصول موقوف حفاظًا على الحماية."
            } else {
                "Attempt state cannot be verified; access remains blocked for safety."
            }
            return
        }
        val remaining = ((blockedUntil - System.currentTimeMillis()).coerceAtLeast(0L) + 999L) / 1000L
        errorView?.text = if (isArabic) "محاولات كثيرة. انتظر $remaining ثانية" else "Too many attempts. Wait $remaining seconds"
    }

    private fun startRetryTicker(targetPackage: String) {
        retryTicker?.let { uiHandler.removeCallbacks(it) }
        val ticker = object : Runnable {
            override fun run() {
                if (lockView == null || currentTarget != targetPackage) {
                    retryTicker = null
                    return
                }
                if (blockedUntil == Long.MAX_VALUE) {
                    showBlockedMessage()
                    setKeypadEnabled(false)
                    retryTicker = null
                    return
                }
                if (System.currentTimeMillis() >= blockedUntil) {
                    blockedUntil = 0L
                    errorView?.text = " "
                    setKeypadEnabled(true)
                    retryTicker = null
                    return
                }
                showBlockedMessage()
                uiHandler.postDelayed(this, 250L)
            }
        }
        retryTicker = ticker
        uiHandler.post(ticker)
    }

    private fun setKeypadEnabled(enabled: Boolean) {
        keypadButtons.forEach { it.isEnabled = enabled }
    }

    private fun updatePinDots() {
        pinDotViews.forEachIndexed { index, dot ->
            dot.background = makeDotBackground(index < pinValue.length)
        }
    }

    private fun makeDotBackground(filled: Boolean) = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(if (filled) Color.rgb(40, 220, 230) else Color.TRANSPARENT)
        setStroke(dp(2), if (filled) Color.rgb(40, 220, 230) else Color.rgb(125, 138, 154))
    }

    private fun maintenanceHint(index: Int, isArabic: Boolean): String =
        if (isArabic) MAINTENANCE_HINTS[index % MAINTENANCE_HINTS.size].first
        else MAINTENANCE_HINTS[index % MAINTENANCE_HINTS.size].second

    private fun dismissGate() {
        stopUiTickers()
        val current = lockView
        if (current != null) {
            try { windowManager?.removeView(current) } catch (_: Exception) { }
        }
        lockView = null
        errorView = null
        maintenanceCountdownView = null
        pinValue = ""
        pinDotViews.clear()
        keypadButtons.clear()
        currentTarget = null
        activeMaintenanceUntil = null
    }

    private fun normalizePin(value: String): String = value.map { ch ->
        when (ch) {
            in '\u0660'..'\u0669' -> ('0'.code + ch.code - 0x0660).toChar()
            in '\u06f0'..'\u06f9' -> ('0'.code + ch.code - 0x06f0).toChar()
            else -> ch
        }
    }.joinToString("")

    @Suppress("DEPRECATION")
    private fun currentLanguage(): String = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        resources.configuration.locales[0]?.language ?: "en"
    } else {
        resources.configuration.locale?.language ?: "en"
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    private fun matchWrap() = LinearLayout.LayoutParams(-1, -2)

    companion object {
        private const val TARGET_MAINTENANCE_KEY = "duress-security-app-lock-maintenance"
        private val MAINTENANCE_HINTS = listOf(
            "قال الله تعالى: إِنَّ مَعَ الْعُسْرِ يُسْرًا" to "Indeed, with hardship comes ease.",
            "قال الله تعالى: وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ" to "Whoever relies upon Allah, He is sufficient for him.",
            "قال رسول الله ﷺ: مَن لا يَرحَم لا يُرحَم" to "Whoever does not show mercy will not be shown mercy.",
            "قال الله تعالى: فَاذْكُرُونِي أَذْكُرْكُمْ" to "So remember Me; I will remember you.",
            "قال الله تعالى: إِنَّ اللَّهَ مَعَ الصَّابِرِينَ" to "Indeed, Allah is with the patient."
        )
        const val ACTION_BIOMETRIC_UNLOCKED = "com.duresssecurity.app.ACTION_APP_LOCK_BIOMETRIC_UNLOCKED"
        const val ACTION_BIOMETRIC_FAILED = "com.duresssecurity.app.ACTION_APP_LOCK_BIOMETRIC_FAILED"
        const val EXTRA_TARGET_PACKAGE = "com.duresssecurity.app.EXTRA_APP_LOCK_TARGET_PACKAGE"
    }
}
