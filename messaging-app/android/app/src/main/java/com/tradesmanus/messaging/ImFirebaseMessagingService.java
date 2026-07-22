package com.tradesmanus.messaging;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Shows Instant Messaging pushes as ONE tray item per conversation.
 * Firebase's default path uses a unique notification id per message (even with the same
 * FCM tag), which creates an expandable Android notification group. We replace that with
 * NotificationManager.notify(tag, stableId, …) so each thread occupies a single slot.
 */
public class ImFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "ImFcm";
    private static final String CHANNEL_ID = "tradesman_messaging";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data != null ? data.get("type") : null;

        if ("internal_message".equals(type) || "internal_missed_call".equals(type)) {
            try {
                showCollapsingNotification(data);
            } catch (Throwable t) {
                Log.w(TAG, "showCollapsingNotification failed", t);
            }
        }

        // Keep Capacitor JS listeners (tap handoff, etc.) working.
        try {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        } catch (Throwable t) {
            Log.w(TAG, "Capacitor forward failed", t);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        try {
            PushNotificationsPlugin.onNewToken(token);
        } catch (Throwable t) {
            Log.w(TAG, "onNewToken forward failed", t);
        }
    }

    private void showCollapsingNotification(Map<String, String> data) {
        if (data == null) return;
        String type = str(data.get("type"));
        String title = str(data.get("title"));
        String body = str(data.get("body"));
        if (title.isEmpty()) {
            title = "internal_missed_call".equals(type) ? "Missed call" : "Tradesman Messaging";
        }
        if (body.isEmpty()) body = "New message";

        String threadId = str(data.get("threadId"));
        String callerId = str(data.get("callerId"));
        String stableKey =
            !threadId.isEmpty() ? threadId : (!callerId.isEmpty() ? callerId : str(data.get("messageId")));
        if (stableKey.isEmpty()) stableKey = "general";

        String tag = ("internal_missed_call".equals(type) ? "missed_" : "im_") + stableKey.replaceAll("[^a-zA-Z0-9_-]", "");
        int notifId = stableKey.hashCode();

        ensureChannel();

        Intent launch = new Intent(this, MainActivity.class);
        launch.setAction(Intent.ACTION_MAIN);
        launch.addCategory(Intent.CATEGORY_LAUNCHER);
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        for (Map.Entry<String, String> e : data.entrySet()) {
            if (e.getKey() != null && e.getValue() != null) {
                launch.putExtra(e.getKey(), e.getValue());
            }
        }

        PendingIntent contentIntent =
            PendingIntent.getActivity(
                this,
                notifId,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setContentIntent(contentIntent);
        // Do NOT setGroup — that creates the expandable stack the user does not want.

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(tag, notifId, builder.build());
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel =
            new NotificationChannel(CHANNEL_ID, "Tradesman Messaging", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Instant messages from your team");
        nm.createNotificationChannel(channel);
    }

    private static String str(String v) {
        return v == null ? "" : v.trim();
    }
}
