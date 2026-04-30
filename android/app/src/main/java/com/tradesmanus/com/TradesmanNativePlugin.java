package com.tradesmanus.com;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;

/**
 * Exposes whether Firebase was initialized (requires {@code google-services.json} + google-services Gradle plugin).
 * Capacitor Push FCM {@code register()} crashes if Firebase default app is missing — the JS layer checks this first on Android.
 */
@CapacitorPlugin(name = "TradesmanNative")
public class TradesmanNativePlugin extends Plugin {

    @PluginMethod
    public void getFcmAvailability(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            boolean ok = !FirebaseApp.getApps(getContext()).isEmpty();
            ret.put("available", ok);
        } catch (Throwable t) {
            ret.put("available", false);
        }
        call.resolve(ret);
    }
}
