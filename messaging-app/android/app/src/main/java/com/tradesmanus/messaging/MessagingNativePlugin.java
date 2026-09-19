package com.tradesmanus.messaging;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.telecom.Connection;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MessagingNative")
public class MessagingNativePlugin extends Plugin {

    private static MessagingNativePlugin instance;
    private static JSObject pendingLaunchPush;
    private static JSObject pendingLaunchDial;
    private static Connection telecomConnection;

    private AudioFocusRequest focusRequest;
    private Ringtone ringtone;

    @Override
    public void load() {
        super.load();
        instance = this;
        registerSelfManagedPhoneAccount();
        if (pendingLaunchPush != null) {
            notifyListeners("pushLaunch", pendingLaunchPush);
        }
        if (pendingLaunchDial != null) {
            notifyListeners("pendingDial", pendingLaunchDial);
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

    public static void setPendingLaunchDial(Intent intent) {
        if (intent == null) return;
        String phone = intent.getStringExtra("tradesman_dial_phone");
        Uri data = intent.getData();
        if ((phone == null || phone.trim().isEmpty()) && data != null && "tel".equalsIgnoreCase(data.getScheme())) {
            phone = data.getSchemeSpecificPart();
        }
        if (phone == null || phone.trim().isEmpty()) return;
        JSObject obj = new JSObject();
        obj.put("phone", phone.trim());
        pendingLaunchDial = obj;
        if (instance != null) {
            instance.notifyListeners("pendingDial", obj);
        }
    }

    public static void attachTelecomConnection(Connection conn, String number) {
        telecomConnection = conn;
        if (number == null || number.trim().isEmpty()) return;
        JSObject obj = new JSObject();
        obj.put("phone", number.trim());
        pendingLaunchDial = obj;
        if (instance != null) {
            instance.notifyListeners("pendingDial", obj);
        }
    }

    public static void clearTelecomConnection(Connection conn) {
        if (telecomConnection == conn) telecomConnection = null;
    }

    private void registerSelfManagedPhoneAccount() {
        try {
            Context ctx = getContext();
            TelecomManager tm = (TelecomManager) ctx.getSystemService(Context.TELECOM_SERVICE);
            if (tm == null) return;
            PhoneAccountHandle handle = new PhoneAccountHandle(
                    new ComponentName(ctx, TradesmanConnectionService.class),
                    "tradesman_messenger"
            );
            PhoneAccount account = PhoneAccount.builder(handle, "Tradesman Messenger")
                    .setShortDescription("Call from your Tradesman business line")
                    .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                    .addSupportedUriScheme(PhoneAccount.SCHEME_TEL)
                    .build();
            tm.registerPhoneAccount(account);
        } catch (Throwable ignored) {
            /* older devices / missing telecom */
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
    public void consumePendingDial(PluginCall call) {
        if (pendingLaunchDial == null) {
            call.resolve(new JSObject());
            return;
        }
        JSObject ret = pendingLaunchDial;
        pendingLaunchDial = null;
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
        Boolean speaker = call.getBoolean("speaker", false);
        getActivity().runOnUiThread(() -> {
            try {
                applyVoiceCallMode(Boolean.TRUE.equals(speaker));
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage() != null ? t.getMessage() : "prepareCallAudio failed");
            }
        });
    }

    @PluginMethod
    public void startCallRingtone(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                startRingtoneInternal();
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage() != null ? t.getMessage() : "startCallRingtone failed");
            }
        });
    }

    @PluginMethod
    public void stopCallRingtone(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                stopRingtoneInternal();
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage() != null ? t.getMessage() : "stopCallRingtone failed");
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
                stopRingtoneInternal();
                AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    abandonFocus(am);
                    am.setSpeakerphoneOn(false);
                    am.setMode(AudioManager.MODE_NORMAL);
                }
                if (telecomConnection != null) {
                    try {
                        telecomConnection.setDisconnected(new android.telecom.DisconnectCause(android.telecom.DisconnectCause.LOCAL));
                        telecomConnection.destroy();
                    } catch (Throwable ignored) {
                        /* ignore */
                    }
                    telecomConnection = null;
                }
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage() != null ? t.getMessage() : "resetCallAudio failed");
            }
        });
    }

    private void startRingtoneInternal() {
        stopRingtoneInternal();
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am != null) {
            requestFocus(am);
            am.setMode(AudioManager.MODE_RINGTONE);
            am.setSpeakerphoneOn(true);
            try {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_RING);
                if (max > 0) {
                    int target = Math.max(1, (int) Math.round(max * 0.8));
                    am.setStreamVolume(AudioManager.STREAM_RING, target, 0);
                }
            } catch (Throwable ignored) {
                /* best-effort */
            }
        }
        Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        ringtone = RingtoneManager.getRingtone(getContext(), uri);
        if (ringtone == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ringtone.setLooping(true);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ringtone.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
        }
        ringtone.play();
    }

    private void stopRingtoneInternal() {
        try {
            if (ringtone != null && ringtone.isPlaying()) ringtone.stop();
        } catch (Throwable ignored) {
            /* ignore */
        }
        ringtone = null;
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
