package tw.yorozuya.app;

import java.net.URI;
import java.util.Locale;

/** 伺服器網址的正規化與同源判斷（純 Java，無 Android 依賴，方便單元測試）。 */
public final class ServerUrl {
    private ServerUrl() {}

    /**
     * 使用者輸入 → 正規化的 base URL（不含結尾斜線），不合法回 null。
     * "192.168.1.20:8000" → "http://192.168.1.20:8000"
     * "http://host:8000/" → "http://host:8000"
     */
    public static String normalize(String input) {
        if (input == null) return null;
        String s = input.trim();
        if (s.isEmpty()) return null;
        if (!s.contains("://")) s = "http://" + s;
        try {
            URI u = new URI(s);
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) return null;
            String host = u.getHost();
            if (host == null || host.isEmpty()) return null;
            StringBuilder b = new StringBuilder(scheme).append("://");
            if (host.contains(":") && !host.startsWith("[")) b.append('[').append(host).append(']');
            else b.append(host);
            if (u.getPort() != -1) b.append(':').append(u.getPort());
            String path = u.getRawPath();
            if (path != null) {
                while (path.endsWith("/")) path = path.substring(0, path.length() - 1);
                b.append(path);
            }
            return b.toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** 首頁網址：base + "/"。 */
    public static String home(String base) {
        return base + "/";
    }

    /** url 是否與 base 同源（scheme + host + port）。 */
    public static boolean sameOrigin(String base, String url) {
        try {
            URI a = new URI(base), b = new URI(url);
            if (a.getScheme() == null || b.getScheme() == null) return false;
            if (!a.getScheme().equalsIgnoreCase(b.getScheme())) return false;
            if (a.getHost() == null || b.getHost() == null) return false;
            if (!a.getHost().equalsIgnoreCase(b.getHost())) return false;
            return port(a) == port(b);
        } catch (Exception e) {
            return false;
        }
    }

    private static int port(URI u) {
        if (u.getPort() != -1) return u.getPort();
        return "https".equalsIgnoreCase(u.getScheme()) ? 443 : 80;
    }
}
