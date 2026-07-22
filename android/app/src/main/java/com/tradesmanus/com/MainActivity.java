package com.tradesmanus.com;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TradesmanNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Keep the WebView between status + nav bars so system chrome does not cover buttons.
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setNavigationBarColor(0xFFFFFFFF);
        }
        View decor = window.getDecorView();
        WindowInsetsControllerCompat insets = WindowCompat.getInsetsController(window, decor);
        if (insets != null) {
            insets.setAppearanceLightNavigationBars(true);
        }
    }
}
