package tw.yorozuya.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import java.net.HttpURLConnection;
import java.net.URL;

/** 第一次啟動 / 「更換伺服器」：輸入並儲存 FastAPI 伺服器網址。 */
public class SetupActivity extends Activity {
    private EditText urlInput;
    private TextView status;
    private volatile int testSeq = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_setup);
        urlInput = findViewById(R.id.url);
        status = findViewById(R.id.status);
        Button save = findViewById(R.id.save);
        Button test = findViewById(R.id.test);

        String saved = Prefs.getServerUrl(this);
        urlInput.setText(saved != null ? saved : "http://");
        urlInput.setSelection(urlInput.getText().length());

        save.setOnClickListener(v -> saveAndOpen());
        test.setOnClickListener(v -> testConnection());
        urlInput.setOnEditorActionListener((TextView v, int actionId, KeyEvent event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                saveAndOpen();
                return true;
            }
            return false;
        });
    }

    private String readUrl() {
        String base = ServerUrl.normalize(urlInput.getText().toString());
        if (base == null) status.setText(R.string.setup_invalid);
        return base;
    }

    private void saveAndOpen() {
        String base = readUrl();
        if (base == null) return;
        Prefs.setServerUrl(this, base);
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(i);
        finish();
    }

    private void testConnection() {
        final String base = readUrl();
        if (base == null) return;
        final int seq = ++testSeq;
        status.setText("連線中… " + base);
        new Thread(() -> {
            String msg;
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(base + "/manifest.json").openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(5000);
                int code = c.getResponseCode();
                msg = (code == 200)
                        ? "✓ 連上了（HTTP 200），可以按「儲存並開啟」"
                        : "伺服器有回應但不是萬事屋？HTTP " + code;
            } catch (Exception e) {
                msg = "✗ 連不上：" + e.getClass().getSimpleName()
                        + (e.getMessage() != null ? "：" + e.getMessage() : "")
                        + "\n檢查：伺服器有用 --host 0.0.0.0 跑嗎？手機和電腦同一個網路嗎？防火牆有開 port 嗎？";
            } finally {
                if (c != null) c.disconnect();
            }
            final String m = msg;
            runOnUiThread(() -> { if (seq == testSeq && !isFinishing()) status.setText(m); });
        }).start();
    }
}
