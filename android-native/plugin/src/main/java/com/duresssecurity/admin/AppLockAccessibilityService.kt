package com.duresssecurity.admin

import android.accessibilityservice.AccessibilityService
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.view.accessibility.AccessibilityEvent
import android.content.Context
import android.os.Build
import android.widget.Button
import android.widget.EditText
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
    private var pinInput: EditText? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val foregroundPackage = event.packageName?.toString() ?: return

        if (foregroundPackage == packageName) {
            // A TYPE_ACCESSIBILITY_OVERLAY window can itself produce a window-state
            // event attributed to this package. Never let that synthetic event
            // dismiss the gate that is actively protecting another app. Once the
            // gate is gone, a real foreground event for this package can clear the
            // previous target normally.
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
        // an active protection gate here; the next foreground event will reconcile
        // the policy and recreate the gate if necessary.
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

        val persistedAttempts = loadAttemptState(targetPackage)
        attempts = persistedAttempts.attempts
        blockedUntil = persistedAttempts.blockedUntil

        val isArabic = currentLanguage().equals("ar", ignoreCase = true)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(32), dp(28), dp(32))
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
            textSize = 52f
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
            } else if (isArabic) "أدخل رمز Duress Security للمتابعة" else "Enter your Duress Security master PIN to continue"
            textSize = 14f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(20))
        }
        val input = EditText(this).apply {
            hint = if (isArabic) "الرمز الرئيسي" else "Master PIN"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            gravity = Gravity.CENTER
            textSize = 20f
            maxLines = 1
            isEnabled = !storageUnavailable
            setPadding(dp(12), dp(12), dp(12), dp(12))
            background = GradientDrawable().apply {
                setColor(Color.rgb(22, 32, 50))
                cornerRadius = dp(12).toFloat()
                setStroke(dp(1), Color.rgb(55, 76, 98))
            }
        }
        val error = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "استعد التخزين الآمن من داخل Duress Security" else "Recover secure storage from Duress Security"
            } else " "
            textSize = 12f
            setTextColor(Color.rgb(255, 105, 105))
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(8))
        }
        val unlock = Button(this).apply {
            text = if (isArabic) "فتح التطبيق" else "Unlock app"
            isAllCaps = false
            isEnabled = !storageUnavailable
            setTextColor(Color.rgb(6, 18, 29))
            background = GradientDrawable().apply {
                setColor(Color.rgb(40, 220, 230))
                cornerRadius = dp(12).toFloat()
            }
            setOnClickListener {
                val now = System.currentTimeMillis()
                if (now < blockedUntil) {
                    error.text = if (isArabic) "انتظر قبل إعادة المحاولة" else "Please wait before retrying"
                    return@setOnClickListener
                }

                val policy = readPolicy()
                if (policy == null) {
                    error.text = if (isArabic) "التخزين الآمن غير متاح" else "Secure storage is unavailable"
                    return@setOnClickListener
                }

                val typed = normalizePin(input.text?.toString().orEmpty())
                val master = normalizePin(policy.masterPin)
                if (typed.isNotEmpty() && typed == master) {
                    unlockedTarget = targetPackage
                    clearAttemptState(targetPackage)
                    attempts = 0
                    blockedUntil = 0L
                    dismissGate()
                    return@setOnClickListener
                }

                attempts = (attempts + 1).coerceAtMost(1_000_000)
                input.setText("")
                if (attempts >= 5) {
                    blockedUntil = now + 15_000L
                    if (!saveAttemptState(targetPackage, AttemptState(attempts, blockedUntil))) {
                        blockedUntil = Long.MAX_VALUE
                    }
                    error.text = if (isArabic) "محاولات كثيرة. انتظر 15 ثانية" else "Too many attempts. Wait 15 seconds"
                } else {
                    if (!saveAttemptState(targetPackage, AttemptState(attempts, blockedUntil))) {
                        blockedUntil = Long.MAX_VALUE
                    }
                    error.text = if (isArabic) "الرمز غير صحيح" else "Incorrect PIN"
                }
                input.requestFocus()
                input.post {
                    (getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
                        ?.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
                }
            }
        }

        root.addView(shield, matchWrap())
        root.addView(title, matchWrap())
        root.addView(subtitle, matchWrap())
        root.addView(input, LinearLayout.LayoutParams(-1, dp(54)))
        root.addView(error, matchWrap())
        root.addView(unlock, LinearLayout.LayoutParams(-1, dp(52)))
        val footer = TextView(this).apply {
            text = if (storageUnavailable) {
                if (isArabic) "لا يتم تجاوز فشل التخزين تلقائيًا" else "Storage failure never disables protection"
            } else if (isArabic) "هذه الحماية مفعّلة من إعدادات التطبيق" else "This gate is controlled in the app settings"
            textSize = 11f
            setTextColor(Color.GRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(20), 0, 0)
        }
        root.addView(footer, matchWrap())
        pinInput = input
        errorView = error
        lockView = root

        try {
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_SECURE,
                PixelFormat.TRANSLUCENT,
            ).apply { gravity = Gravity.CENTER }
            windowManager?.addView(root, params)
            if (!storageUnavailable) {
                input.requestFocus()
                input.post {
                    (getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
                        ?.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
                }
            }
        } catch (_: Exception) {
            lockView = null
            currentTarget = null
        }
    }

    private fun dismissGate() {
        val current = lockView ?: return
        try { windowManager?.removeView(current) } catch (_: Exception) { }
        lockView = null
        pinInput = null
        errorView = null
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
