package tw.yorozuya.discover;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;

/** 伺服器網址只跟魅魔萬事屋走，這裡不另外存、也不寫死。 */
final class Prefs {
    private static final Uri SERVER = Uri.parse("content://tw.yorozuya.app.server/url");

    static String url(Context c) {
        Cursor cur = null;
        try {
            cur = c.getContentResolver().query(SERVER, null, null, null, null);
            if (cur != null && cur.moveToFirst()) {
                String u = cur.getString(0);
                if (u != null) {
                    u = u.trim().replaceAll("/+$", "");
                    if (!u.isEmpty()) return u;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cur != null) cur.close();
        }
        return null;
    }

    static void openMainApp(Context c) {
        Intent launch = c.getPackageManager().getLaunchIntentForPackage("tw.yorozuya.app");
        if (launch == null) return;
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(launch);
    }
}
