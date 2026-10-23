package ca.clicks506.cageboss;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LegacySavesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
