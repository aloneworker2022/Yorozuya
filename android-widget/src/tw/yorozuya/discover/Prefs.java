package tw.yorozuya.discover;

import android.content.Context;
import android.content.SharedPreferences;

final class Prefs {
    static final String DEFAULT_URL = "http://122.254.17.181:3766";
    private static final String FILE = "discover";
    private static final String KEY_URL = "server_url";

    static SharedPreferences p(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static String url(Context c) {
        String u = p(c).getString(KEY_URL, DEFAULT_URL);
        if (u == null || u.trim().isEmpty()) return DEFAULT_URL;
        u = u.trim().replaceAll("/+$", "");
        if (u.contains("192.168.68.60") || u.contains("192.168.68.58")) {
            setUrl(c, DEFAULT_URL);
            return DEFAULT_URL;
        }
        return u;
    }

    static void setUrl(Context c, String u) {
        if (u == null) return;
        u = u.trim().replaceAll("/+$", "");
        if (u.isEmpty()) u = DEFAULT_URL;
        p(c).edit().putString(KEY_URL, u).apply();
    }
}
