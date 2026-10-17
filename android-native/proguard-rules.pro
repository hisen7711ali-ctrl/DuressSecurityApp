# Keep manifest and Capacitor entry points discoverable while allowing R8 to
# shrink and obfuscate unrelated Android implementation code.
-keep class com.duresssecurity.app.MainActivity { *; }
-keep class com.duresssecurity.admin.AdminReceiver { *; }
-keep class com.duresssecurity.admin.BootCompletedReceiver { *; }
-keep class com.duresssecurity.admin.AppLockAccessibilityService { *; }
-keep class com.duresssecurity.admin.SecurityAdminPlugin { *; }

-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}
