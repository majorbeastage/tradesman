package com.tradesmanus.messaging;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(MessagingNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
