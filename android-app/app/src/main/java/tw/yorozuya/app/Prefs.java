package tw.yorozuya.app;

import android.content.Context;
import android.content.SharedPreferences;

final class Prefs {
    private static final String FILE = "yorozuya";
    private static final String KEY_URL = "server_url";

    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static String getServerUrl(Context c) {
        return sp(c).getString(KEY_URL, null);
    }

    static void setServerUrl(Context c, String url) {
        sp(c).edit().putString(KEY_URL, url).apply();
    }
}
