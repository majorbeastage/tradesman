package com.tradesmanus.messaging;

import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MessagingNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Keep the WebView between the status bar and navigation/gesture bar so
        // system chrome does not cover in-app buttons (Send, tabs, etc.).
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(0xFFF97316);
            window.setNavigationBarColor(0xFFFFFFFF);
        }
        View decor = window.getDecorView();
        WindowInsetsControllerCompat insets = WindowCompat.getInsetsController(window, decor);
        if (insets != null) {
            insets.setAppearanceLightStatusBars(false);
            insets.setAppearanceLightNavigationBars(true);
        }
    }
}
