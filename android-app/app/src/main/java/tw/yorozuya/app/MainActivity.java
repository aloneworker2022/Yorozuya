package tw.yorozuya.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** 全螢幕 WebView，載入使用者自己的萬事屋 FastAPI 伺服器。 */
public class MainActivity extends Activity {
    private static final String TAG = "Yorozuya";
    private static final int REQ_FILE = 1001;

    private WebView web;
    private ProgressBar progress;
    private View errorView;
    private TextView errorMsg;

    private String baseUrl;
    private String failedUrl;
    private boolean mainFrameError;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        baseUrl = Prefs.getServerUrl(this);
        if (baseUrl == null) {
            openSetup();
            finish();
            return;
        }
        setContentView(R.layout.activity_main);
        web = findViewById(R.id.web);
        progress = findViewById(R.id.progress);
        errorView = findViewById(R.id.error);
        errorMsg = findViewById(R.id.error_msg);
        Button retry = findViewById(R.id.retry);
        Button change = findViewById(R.id.change);
        retry.setOnClickListener(v -> retry());
        change.setOnClickListener(v -> openSetup());

        setupWebView();

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(ServerUrl.home(baseUrl));
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            // debug 版可從電腦 Chrome 的 chrome://inspect 除錯
            WebView.setWebContentsDebuggingEnabled(true);
        }
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage / sessionStorage
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);                    // 系統字體放大不要撐爆遊戲版面
        s.setSupportMultipleWindows(false);    // target=_blank 直接在同一個 WebView 開
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " YorozuyaApp/" + versionName());

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new AndroidBridge(this), AndroidBridge.NAME);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                handleDownload(url, contentDisposition, mimeType));
    }

    // ---------- 導航 / 錯誤 ----------

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            return routeUrl(req.getUrl());
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return routeUrl(Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            mainFrameError = false;
            // 換頁／重新整理：先放掉番茄鐘的「螢幕不休眠」，新頁面若鐘還在跑會自己再要一次。
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!mainFrameError) {
                errorView.setVisibility(View.GONE);
                if (url != null && ServerUrl.sameOrigin(baseUrl, url)) {
                    view.evaluateJavascript(AndroidBridge.INJECT_JS, null);
                }
            }
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (req.isForMainFrame()) {
                showError(req.getUrl().toString(), String.valueOf(err.getDescription()));
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse resp) {
            // 主頁本身 4xx/5xx（例如網址填錯 port 打到別的服務）才蓋錯誤頁；子資源錯誤交給遊戲自己處理
            if (req.isForMainFrame() && resp.getStatusCode() >= 400) {
                showError(req.getUrl().toString(), "HTTP " + resp.getStatusCode() + " " + resp.getReasonPhrase());
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // WebView 渲染程序被系統殺掉 → 重建整個 Activity，避免整個 App 閃退
            Log.w(TAG, "render process gone, recreating");
            if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
            view.destroy();
            web = null;
            recreate();
            return true;
        }
    }

    /** true = 不在 WebView 裡開。 */
    private boolean routeUrl(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if ((scheme.equals("http") || scheme.equals("https")) && ServerUrl.sameOrigin(baseUrl, uri.toString())) {
            return false; // 自家伺服器 → 留在 App 裡
        }
        if (scheme.equals("blob") || scheme.equals("data") || scheme.equals("about") || scheme.equals("javascript")) {
            return false;
        }
        // 外部網站 / intent: / mailto: … → 交給系統
        try {
            Intent i = scheme.equals("intent")
                    ? Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
                    : new Intent(Intent.ACTION_VIEW, uri);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.setComponent(null);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "無法開啟：" + uri, Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    private void showError(String url, String desc) {
        mainFrameError = true;
        failedUrl = url;
        errorMsg.setText(baseUrl + "\n\n" + desc
                + "\n\n確認：電腦上的伺服器有在跑（uvicorn main:app --host 0.0.0.0 --port 8000）、"
                + "手機和電腦在同一個網路（或都連上 Tailscale）、防火牆有開這個 port。");
        errorView.setVisibility(View.VISIBLE);
        progress.setVisibility(View.GONE);
    }

    private void retry() {
        errorView.setVisibility(View.GONE);
        String target = failedUrl != null && ServerUrl.sameOrigin(baseUrl, failedUrl)
                ? failedUrl : ServerUrl.home(baseUrl);
        web.loadUrl(target);
    }

    private void openSetup() {
        startActivity(new Intent(this, SetupActivity.class));
    }

    // ---------- 進度條 / 檔案選擇 ----------

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progress.setProgress(newProgress);
            progress.setVisibility(newProgress < 100 ? View.VISIBLE : View.GONE);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;

            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(Mime.forChooser(params.getAcceptTypes()));
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            try {
                startActivityForResult(Intent.createChooser(i, null), REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                callback.onReceiveValue(null);
                Toast.makeText(MainActivity.this, "找不到檔案選擇器", Toast.LENGTH_SHORT).show();
                return false;
            }
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            Log.d(TAG, "console: " + m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_FILE) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            List<Uri> uris = new ArrayList<>();
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int k = 0; k < clip.getItemCount(); k++) {
                    Uri u = clip.getItemAt(k).getUri();
                    if (u != null) uris.add(u);
                }
            }
            if (uris.isEmpty() && data.getData() != null) uris.add(data.getData());
            if (!uris.isEmpty()) result = uris.toArray(new Uri[0]);
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    // ---------- 下載（匯出存檔） ----------

    private void handleDownload(String url, String contentDisposition, String mimeType) {
        String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            // 一般情況會被注入的 JS 先攔走；保險起見這裡再處理一次
            web.evaluateJavascript(AndroidBridge.saveBlobJs(url, name), null);
            return;
        }
        try {
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) r.addRequestHeader("Cookie", cookies);
            r.setMimeType(mimeType);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            dm.enqueue(r);
            Toast.makeText(this, "下載中：" + name, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
                Toast.makeText(this, "無法下載：" + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        }
    }

    // ---------- 返回鍵 / 生命週期 ----------

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web != null && errorView.getVisibility() != View.VISIBLE && web.canGoBack()) {
            web.goBack();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle(R.string.exit_title)
                .setMessage(baseUrl)
                .setPositiveButton(R.string.exit_quit, (d, w) -> finish())
                .setNeutralButton(R.string.exit_change, (d, w) -> openSetup())
                .setNegativeButton(R.string.exit_reload, (d, w) -> retry())
                .show();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            // true = 剛從鎖屏或別的 App 回來。時間若已到，頁面會算未完成。
            web.evaluateJavascript("window.__pomoBack&&window.__pomoBack(true)", null);
        }
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.evaluateJavascript("window.__pomoAway&&window.__pomoAway()", null);
            web.onPause();
        }
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.setWebChromeClient(null);
            web.setWebViewClient(new WebViewClient());
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
