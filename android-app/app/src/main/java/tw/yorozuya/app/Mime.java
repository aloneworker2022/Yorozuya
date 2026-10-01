package tw.yorozuya.app;

/** 檔案選擇器 MIME 判斷（純 Java）。 */
public final class Mime {
    private Mime() {}

    /** accept="image/*" → image/*；accept="application/json" 等手機常認不出的類型 → 全部檔案。 */
    public static String forChooser(String[] accept) {
        if (accept == null) return "*/*";
        String chosen = null;
        for (String a : accept) {
            if (a == null) continue;
            a = a.trim();
            if (a.isEmpty()) continue;
            if (!a.startsWith("image/") && !a.startsWith("video/") && !a.startsWith("audio/")) return "*/*";
            if (chosen == null) chosen = a;
            else if (!chosen.equals(a)) {
                // 混合多種媒體 → 取主類型相同就用 x/*，不同就全部
                String p1 = chosen.substring(0, chosen.indexOf('/'));
                String p2 = a.substring(0, a.indexOf('/'));
                chosen = p1.equals(p2) ? p1 + "/*" : "*/*";
            }
        }
        return chosen == null ? "*/*" : chosen;
    }
}
