package com.tradesmanus.com;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TradesmanNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
