package com.tradesmanus.com;

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
import com.google.firebase.FirebaseApp;

/**
 * Native helpers for the main Tradesman Capacitor shell:
 * FCM readiness check + softphone voice-call audio routing (speaker vs handset).
 */
@CapacitorPlugin(name = "TradesmanNative")
public class TradesmanNativePlugin extends Plugin {

    private AudioFocusRequest focusRequest;
    private boolean speakerEnabled = false;

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
            boolean ok = !FirebaseApp.getApps(getContext()).isEmpty();
            ret.put("available", ok);
        } catch (Throwable t) {
            ret.put("available", false);
        }
        call.resolve(ret);
    }

    /** Enter voice-call audio mode before / when Twilio connects (boosts VOICE_CALL stream). */
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
                speakerEnabled = Boolean.TRUE.equals(enabled);
                applyVoiceCallMode(speakerEnabled);
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
                speakerEnabled = false;
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
        // Some WebViews ignore setSpeakerphoneOn unless mode is set first and we retry.
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
        // Second pass — WebRTC sometimes steals the route right after connect.
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
