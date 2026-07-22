package com.tradesmanus.messaging;

import android.content.Context;
import android.media.AudioManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MessagingNative")
public class MessagingNativePlugin extends Plugin {

    @PluginMethod
    public void getFcmAvailability(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Class<?> firebaseApp = Class.forName("com.google.firebase.FirebaseApp");
            java.util.List<?> apps = (java.util.List<?>) firebaseApp.getMethod("getApps", Context.class).invoke(null, getContext());
            ret.put("available", apps != null && !apps.isEmpty());
        } catch (Throwable t) {
            ret.put("available", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void setSpeakerOn(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", false);
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                am.setSpeakerphoneOn(Boolean.TRUE.equals(enabled));
            }
            call.resolve();
        } catch (Throwable t) {
            call.reject(t.getMessage() != null ? t.getMessage() : "setSpeakerOn failed");
        }
    }

    @PluginMethod
    public void resetCallAudio(PluginCall call) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setSpeakerphoneOn(false);
                am.setMode(AudioManager.MODE_NORMAL);
            }
            call.resolve();
        } catch (Throwable t) {
            call.reject(t.getMessage() != null ? t.getMessage() : "resetCallAudio failed");
        }
    }
}
