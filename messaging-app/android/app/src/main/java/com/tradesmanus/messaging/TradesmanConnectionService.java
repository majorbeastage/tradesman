package com.tradesmanus.messaging;

import android.content.Intent;
import android.net.Uri;
import android.telecom.Connection;
import android.telecom.ConnectionRequest;
import android.telecom.ConnectionService;
import android.telecom.DisconnectCause;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;

/**
 * Self-managed Telecom account so Android can offer “Call with Tradesman Messenger”
 * next to the regular phone (same path Teams uses).
 */
public class TradesmanConnectionService extends ConnectionService {

    @Override
    public Connection onCreateOutgoingConnection(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        Uri address = request.getAddress();
        String number = address != null ? address.getSchemeSpecificPart() : "";
        if (number == null) number = "";

        Connection conn = new Connection() {
            @Override
            public void onDisconnect() {
                setDisconnected(new DisconnectCause(DisconnectCause.LOCAL));
                destroy();
                MessagingNativePlugin.clearTelecomConnection(this);
            }

            @Override
            public void onAbort() {
                onDisconnect();
            }

            @Override
            public void onSeparate() {
                /* unused */
            }
        };
        conn.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);
        conn.setAudioModeIsVoip(true);
        if (address != null) {
            conn.setAddress(address, TelecomManager.PRESENTATION_ALLOWED);
        }
        conn.setDialing();
        conn.setInitializing();
        conn.setActive();

        MessagingNativePlugin.attachTelecomConnection(conn, number);

        Intent launch = new Intent(this, MainActivity.class);
        launch.setAction(Intent.ACTION_VIEW);
        launch.setData(address != null ? address : Uri.fromParts("tel", number, null));
        launch.putExtra("tradesman_dial_phone", number);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(launch);
        return conn;
    }

    @Override
    public Connection onCreateIncomingConnection(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        return Connection.createFailedConnection(new DisconnectCause(DisconnectCause.UNKNOWN));
    }
}
