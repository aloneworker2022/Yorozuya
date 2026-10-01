package tw.yorozuya.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 給網頁用的小橋接（window.YoroAndroid）：
 * - vibrate(ms)：WebView 本身不支援 navigator.vibrate，這裡補上
 * - saveFile(name, mime, base64)：WebView 不會處理 &lt;a download href="blob:..."&gt;，
 *   遊戲「匯出存檔」靠這個存到手機的「下載」資料夾
 * 只會注入到使用者設定的伺服器（同源）頁面。
 */
final class AndroidBridge {
    static final String NAME = "YoroAndroid";

    /** 每次同源頁面載入完成後注入：攔 blob/data 下載、補 navigator.vibrate。 */
    static final String INJECT_JS =
            "(function(){if(window.__yoroAndroid)return;window.__yoroAndroid=1;" +
            "var B=window." + NAME + ";if(!B)return;" +
            "function save(h,n){fetch(h).then(function(r){return r.blob();}).then(function(b){" +
            "var fr=new FileReader();fr.onload=function(){var s=String(fr.result);" +
            "B.saveFile(n||'download',b.type||'application/octet-stream',s.substring(s.indexOf(',')+1));};" +
            "fr.readAsDataURL(b);}).catch(function(e){B.toast('匯出失敗：'+e);});}" +
            "window.__yoroSave=save;" +
            "var oc=HTMLAnchorElement.prototype.click;" +
            "HTMLAnchorElement.prototype.click=function(){var h=this.href||'';" +
            "if(this.hasAttribute('download')&&(h.indexOf('blob:')===0||h.indexOf('data:')===0)){save(h,this.getAttribute('download'));return;}" +
            "return oc.apply(this,arguments);};" +
            "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[download]');" +
            "if(!a)return;var h=a.href||'';if(h.indexOf('blob:')===0||h.indexOf('data:')===0){e.preventDefault();save(h,a.getAttribute('download'));}},true);" +
            "try{navigator.vibrate=function(p){var ms=typeof p==='number'?p:(Array.isArray(p)?p.reduce(function(a,b){return a+(+b||0);},0):0);" +
            "B.vibrate(ms);return true;};}catch(e){}" +
            "})();";

    static String saveBlobJs(String url, String name) {
        return "window.__yoroSave&&window.__yoroSave(" + jsString(url) + "," + jsString(name) + ");";
    }

    static String jsString(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    private final Activity activity;

    AndroidBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void vibrate(long ms) {
        Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        if (ms <= 0) {
            v.cancel();
            return;
        }
        ms = Math.min(ms, 5000);
        if (Build.VERSION.SDK_INT >= 26) {
            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            v.vibrate(ms);
        }
    }

    @JavascriptInterface
    public void toast(String msg) {
        activity.runOnUiThread(() -> Toast.makeText(activity, msg, Toast.LENGTH_LONG).show());
    }

    @JavascriptInterface
    public void saveFile(String name, String mime, String base64) {
        String safe = (name == null || name.trim().isEmpty() ? "download" : name.trim())
                .replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_");
        try {
            byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
            String where;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = activity.getContentResolver();
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, mime == null ? "application/octet-stream" : mime);
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new IllegalStateException("MediaStore insert failed");
                try (OutputStream os = cr.openOutputStream(uri)) {
                    if (os == null) throw new IllegalStateException("openOutputStream null");
                    os.write(bytes);
                }
                where = "下載/" + safe;
            } else {
                // Android 7–9：存到 App 專屬資料夾（免權限）
                File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = activity.getFilesDir();
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, safe);
                try (FileOutputStream os = new FileOutputStream(f)) {
                    os.write(bytes);
                }
                where = f.getAbsolutePath();
            }
            toast("已存檔：" + where);
        } catch (Exception e) {
            toast("存檔失敗：" + e.getMessage());
        }
    }
}
