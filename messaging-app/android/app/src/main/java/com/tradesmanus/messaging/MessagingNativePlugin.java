package com.tradesmanus.messaging;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MessagingNative")
public class MessagingNativePlugin extends Plugin {

    private static MessagingNativePlugin instance;
    private static JSObject pendingLaunchPush;

    private AudioFocusRequest focusRequest;

    @Override
    public void load() {
        super.load();
        instance = this;
        if (pendingLaunchPush != null) {
            notifyListeners("pushLaunch", pendingLaunchPush);
        }
    }

    /** Called from MainActivity when a notification tap delivers FCM data in intent extras. */
    public static void setPendingLaunchPush(android.content.Intent intent) {
        if (intent == null) return;
        android.os.Bundle extras = intent.getExtras();
        if (extras == null) return;
        String type = extras.getString("type");
        if (type == null) return;
        if (!"internal_message".equals(type) && !"internal_missed_call".equals(type)) return;

        JSObject obj = new JSObject();
        for (String key : extras.keySet()) {
            Object val = extras.get(key);
            if (val != null) obj.put(key, String.valueOf(val));
        }
        pendingLaunchPush = obj;
        if (instance != null) {
            instance.notifyListeners("pushLaunch", obj);
        }
    }

    @PluginMethod
    public void consumeLaunchPushData(PluginCall call) {
        if (pendingLaunchPush == null) {
            call.resolve(new JSObject());
            return;
        }
        JSObject ret = pendingLaunchPush;
        pendingLaunchPush = null;
        call.resolve(ret);
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url required");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                android.net.Uri uri = android.net.Uri.parse(url);
                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, uri);
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage() != null ? t.getMessage() : "openExternalUrl failed");
            }
        });
    }

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
    public void prepareCallAudio(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                applyVoiceCallMode(false);
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage() != null ? t.getMessage() : "prepareCallAudio failed");
            }
        });
    }

    @PluginMethod
    public void setSpeakerOn(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", false);
        getActivity().runOnUiThread(() -> {
            try {
                applyVoiceCallMode(Boolean.TRUE.equals(enabled));
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage() != null ? t.getMessage() : "setSpeakerOn failed");
            }
        });
    }

    @PluginMethod
    public void resetCallAudio(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    abandonFocus(am);
                    am.setSpeakerphoneOn(false);
                    am.setMode(AudioManager.MODE_NORMAL);
                }
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage() != null ? t.getMessage() : "resetCallAudio failed");
            }
        });
    }

    private void applyVoiceCallMode(boolean speaker) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        requestFocus(am);
        am.setMode(AudioManager.MODE_IN_COMMUNICATION);
        am.setSpeakerphoneOn(speaker);
        try {
            int max = am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL);
            if (max > 0) {
                int target = Math.max(1, (int) Math.round(max * 0.85));
                am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, target, 0);
            }
        } catch (Throwable ignored) {
            /* best-effort */
        }
        am.setSpeakerphoneOn(speaker);
    }

    private void requestFocus(AudioManager am) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest == null) {
                    AudioAttributes attrs = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build();
                    focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                            .setAudioAttributes(attrs)
                            .setAcceptsDelayedFocusGain(true)
                            .setOnAudioFocusChangeListener(i -> {})
                            .build();
                }
                am.requestAudioFocus(focusRequest);
            } else {
                am.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }
        } catch (Throwable ignored) {
            /* best-effort */
        }
    }

    private void abandonFocus(AudioManager am) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                am.abandonAudioFocusRequest(focusRequest);
            } else {
                am.abandonAudioFocus(null);
            }
        } catch (Throwable ignored) {
            /* best-effort */
        }
    }
}
