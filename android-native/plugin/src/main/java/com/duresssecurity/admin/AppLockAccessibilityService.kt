package com.duresssecurity.admin

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.content.Intent
import com.duresssecurity.app.MainActivity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject

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
    private var pinValue = ""
    private val pinDotViews = mutableListOf<View>()
    private val keypadButtons = mutableListOf<Button>()
    private val uiHandler = Handler(Looper.getMainLooper())
    private var retryTicker: Runnable? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val foregroundPackage = event.packageName?.toString() ?: return

        if (foregroundPackage == packageName) {
            // The accessibility overlay can create an event attributed to this
            // package. Never let that synthetic event dismiss an active gate.
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
        if (unlockedTarget == foregroundPackage) return
        if (currentTarget != foregroundPackage || lockView == null) showGate(foregroundPackage)
    }

    override fun onInterrupt() {
        // Accessibility can be interrupted temporarily by Android. Do not remove
        // an active protection gate here; the next foreground event reconciles it.
    }

    override fun onDestroy() {
        dismissGate()
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
    )

    private data class AttemptState(val attempts: Int, val blockedUntil: Long)

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
            Policy(
                enabled = state.optBoolean("appLockEnabled", false),
                overlayEnabled = state.optBoolean("overlayEnabled", true),
                lockedPackages = locked,
                masterPin = master,
                duressPin = pins.optString("duress").takeIf { it.isNotBlank() },
                extendedLockPin = pins.optString("lock").takeIf { it.isNotBlank() },
                wipePin = pins.optString("format").takeIf { it.isNotBlank() },
            )
        } catch (_: Exception) {
            null
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

    private fun showGate(targetPackage: String, storageUnavailable: Boolean = false) {
        if (lockView != null && currentTarget == targetPackage) return
        dismissGate()
        currentTarget = targetPackage
        pinValue = ""

        val persistedAttempts = loadAttemptState(targetPackage)
        attempts = persistedAttempts.attempts
        blockedUntil = persistedAttempts.blockedUntil

        val isArabic = currentLanguage().equals("ar", ignoreCase = true)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(20), dp(24), dp(20))
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

        val shield = TextView(this).apply {
            text = "◈"
            textSize = 46f
            setTextColor(Color.rgb(40, 220, 230))
            gravity = Gravity.CENTER
        }
        val title = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "الحماية الآمنة غير متاحة" else "Secure protection unavailable"
            } else if (isArabic) "التطبيق محمي" else "App protected"
            textSize = 24f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        val subtitle = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "تعذر قراءة التخزين المشفر. الوصول مرفوض حتى استعادة الحالة الآمنة." else "Encrypted security storage could not be read. Access is denied until recovery."
            } else if (isArabic) "أدخل الرمز الرئيسي للمتابعة" else "Enter the master PIN to continue"
            textSize = 14f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(10))
        }

        val dots = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(14))
        }
        pinDotViews.clear()
        repeat(4) {
            val dot = View(this).apply {
                background = makeDotBackground(false)
            }
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
            val params = LinearLayout.LayoutParams(dp(56), dp(36)).apply {
                marginStart = dp(5)
                marginEnd = dp(5)
                bottomMargin = dp(8)
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
                val params = LinearLayout.LayoutParams(dp(64), dp(64)).apply {
                    marginStart = dp(5)
                    marginEnd = dp(5)
                    topMargin = dp(4)
                    bottomMargin = dp(4)
                }
                row.addView(button, params)
                keypadButtons.add(button)
            }
            numberPad.addView(row, LinearLayout.LayoutParams(-2, -2))
        }

        val error = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "استعد التخزين الآمن من داخل التطبيق" else "Recover secure storage from inside the app"
            } else " "
            textSize = 12f
            setTextColor(Color.rgb(255, 105, 105))
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(4))
        }
        val footer = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "لا يتم تجاوز فشل التخزين تلقائيًا" else "Storage failure never disables protection"
            } else if (isArabic) "أدخل الرمز الرئيسي من لوحة الأرقام" else "Use the on-screen PIN keypad"
            textSize = 11f
            setTextColor(Color.GRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, 0)
        }

        root.addView(shield, matchWrap())
        root.addView(title, matchWrap())
        root.addView(subtitle, matchWrap())
        root.addView(dots, matchWrap())
        root.addView(symbols, matchWrap())
        root.addView(numberPad, matchWrap())
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
        } catch (_: Exception) {
            lockView = null
            currentTarget = null
            retryTicker?.let { uiHandler.removeCallbacks(it) }
            retryTicker = null
        }
    }

    private fun createKeyButton(label: String, key: String, symbol: Boolean, targetPackage: String): Button {
        val isAction = key == "ok"
        val isBack = key == "back"
        return Button(this).apply {
            text = label
            isAllCaps = false
            textSize = if (symbol) 16f else 27f
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
        if (typed.isNotEmpty() && typed == master) {
            unlockedTarget = targetPackage
            clearAttemptState(targetPackage)
            attempts = 0
            blockedUntil = 0L
            dismissGate()
            return
        }

        // Keep the same special PIN actions as the primary login. These PINs
        // are handed to the app's existing submitPin flow rather than reimplemented
        // in this service, so wipe remains limited to app-owned data and the
        // normal 30-day lock/recovery logic is reused.
        val isOwnerAction = typed.isNotEmpty() && (
            policy.duressPin?.let { typed == normalizePin(it) } == true ||
            policy.extendedLockPin?.let { typed == normalizePin(it) } == true ||
            policy.wipePin?.let { typed == normalizePin(it) } == true
        )
        if (isOwnerAction) {
            dispatchOwnerPinAction(targetPackage, typed)
            return
        }

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

    private fun blockUntilStorageRecovers() {
        blockedUntil = Long.MAX_VALUE
        setKeypadEnabled(false)
        errorView?.text = if (currentLanguage().equals("ar", true)) {
            "تعذر حفظ سجل المحاولات؛ أُوقفت المحاولات حفاظًا على الحماية."
        } else {
            "Attempt state could not be saved; retries are blocked to preserve protection."
        }
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
            val filled = index < pinValue.length
            dot.background = makeDotBackground(filled)
        }
    }

    private fun makeDotBackground(filled: Boolean) = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(if (filled) Color.rgb(40, 220, 230) else Color.TRANSPARENT)
        setStroke(dp(2), if (filled) Color.rgb(40, 220, 230) else Color.rgb(125, 138, 154))
    }

    private fun dismissGate() {
        retryTicker?.let { uiHandler.removeCallbacks(it) }
        retryTicker = null
        val current = lockView
        if (current != null) {
            try { windowManager?.removeView(current) } catch (_: Exception) { }
        }
        lockView = null
        errorView = null
        pinValue = ""
        pinDotViews.clear()
        keypadButtons.clear()
        currentTarget = null
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
}
