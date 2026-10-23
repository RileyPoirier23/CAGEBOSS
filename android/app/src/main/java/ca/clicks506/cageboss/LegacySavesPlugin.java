package ca.clicks506.cageboss;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.URLDecoder;

/**
 * Saves from the Godot build of the Android app (before 2.1, same application id). It kept
 * localStorage as one file per key in user://storage (the app's files dir); src/legacysaves.ts
 * copies them into the WebView's localStorage once, then calls done().
 */
@CapacitorPlugin(name = "LegacySaves")
public class LegacySavesPlugin extends Plugin {
    private File dir() {
        return new File(getContext().getFilesDir(), "storage");
    }

    @PluginMethod
    public void read(PluginCall call) {
        JSObject out = new JSObject();
        File[] files = dir().listFiles();
        if (files != null) {
            for (File f : files) {
                String n = f.getName();
                if (!n.endsWith(".txt")) continue;
                try (InputStream in = new FileInputStream(f)) {
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    byte[] b = new byte[65536];
                    int r;
                    while ((r = in.read(b)) > 0) buf.write(b, 0, r);
                    out.put(URLDecoder.decode(n.substring(0, n.length() - 4), "UTF-8"), buf.toString("UTF-8"));
                } catch (Exception e) {
                    // an unreadable file: skip it
                }
            }
        }
        call.resolve(out);
    }

    /** imported: keep the files (as storage.imported) but don't import them again */
    @PluginMethod
    public void done(PluginCall call) {
        File d = dir();
        if (d.exists()) d.renameTo(new File(getContext().getFilesDir(), "storage.imported"));
        call.resolve();
    }
}
