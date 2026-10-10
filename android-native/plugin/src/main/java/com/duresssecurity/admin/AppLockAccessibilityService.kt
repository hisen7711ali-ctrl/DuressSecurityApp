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
 * Explicitly enabled Android Accessibility service used only to observe the foreground
 * app's package name and gate packages the owner selected inside Duress Security.
 * It does not read text, screenshots, keystrokes or window content. A successful
 * master app PIN dismisses the gate for that app until the user leaves it.
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

        // Opening the main app is the transparent recovery route: it lets the owner
        // change the package list or turn app lock off after authenticating normally.
        if (foregroundPackage == packageName) {
            dismissGate()
            currentTarget = null
            unlockedTarget = null
            return
        }

        if (foregroundPackage != unlockedTarget) unlockedTarget = null
        val policy = readPolicy()
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
        dismissGate()
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

    private fun readPolicy(): Policy {
        val raw = try { SecureStorage(this).get("duress-security-app") } catch (_: Exception) { null }
            ?: return Policy(false, true, emptySet(), "0000")
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
            Policy(
                enabled = state.optBoolean("appLockEnabled", false),
                overlayEnabled = state.optBoolean("overlayEnabled", true),
                lockedPackages = locked,
                masterPin = pins?.optString("master")?.takeIf { it.isNotBlank() } ?: "0000",
            )
        } catch (_: Exception) {
            Policy(false, true, emptySet(), "0000")
        }
    }

    private fun showGate(targetPackage: String) {
        if (lockView != null && currentTarget == targetPackage) return
        dismissGate()
        currentTarget = targetPackage
        attempts = 0
        blockedUntil = 0L

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
                // Back must not silently dismiss the gate; Home remains a normal
                // system action and the overlay disappears when another app opens.
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
            text = if (isArabic) "التطبيق محمي" else "App protected"
            textSize = 24f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        val subtitle = TextView(this).apply {
            text = if (isArabic) "أدخل رمز Duress Security للمتابعة" else "Enter your Duress Security master PIN to continue"
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
            setPadding(dp(12), dp(12), dp(12), dp(12))
            background = GradientDrawable().apply {
                setColor(Color.rgb(22, 32, 50))
                cornerRadius = dp(12).toFloat()
                setStroke(dp(1), Color.rgb(55, 76, 98))
            }
        }
        val error = TextView(this).apply {
            text = " "
            textSize = 12f
            setTextColor(Color.rgb(255, 105, 105))
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(8))
        }
        val unlock = Button(this).apply {
            text = if (isArabic) "فتح التطبيق" else "Unlock app"
            isAllCaps = false
            setTextColor(Color.rgb(6, 18, 29))
            background = GradientDrawable().apply {
                setColor(Color.rgb(40, 220, 230))
                cornerRadius = dp(12).toFloat()
            }
            setOnClickListener {
                if (System.currentTimeMillis() < blockedUntil) {
                    error.text = if (isArabic) "انتظر قبل إعادة المحاولة" else "Please wait before retrying"
                    return@setOnClickListener
                }
                val typed = normalizePin(input.text?.toString().orEmpty())
                val master = normalizePin(readPolicy().masterPin)
                if (typed.isNotEmpty() && typed == master) {
                    unlockedTarget = targetPackage
                    dismissGate()
                    return@setOnClickListener
                }
                attempts += 1
                input.setText("")
                if (attempts >= 5) {
                    attempts = 0
                    blockedUntil = System.currentTimeMillis() + 15_000L
                    error.text = if (isArabic) "محاولات كثيرة. انتظر 15 ثانية" else "Too many attempts. Wait 15 seconds"
                } else {
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
            text = if (isArabic) "هذه الحماية مفعّلة من إعدادات التطبيق" else "This gate is controlled in the app settings"
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
            input.requestFocus()
            input.post {
                (getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
                    ?.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
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
