package tw.yorozuya.discover;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

public class AddActivity extends Activity {
    private EditText input;
    private Button send;
    private boolean sending;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setContentView(R.layout.activity_add);
        input = findViewById(R.id.input);
        send = findViewById(R.id.send);
        findViewById(R.id.spacer).setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { finish(); }
        });
        send.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { submit(); }
        });
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            public boolean onEditorAction(TextView v, int action, android.view.KeyEvent e) {
                if (action == EditorInfo.IME_ACTION_SEND) {
                    submit();
                    return true;
                }
                return false;
            }
        });
        input.requestFocus();
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(R.anim.fade_in, R.anim.slide_out_bottom);
    }

    private void submit() {
        if (sending) return;
        final String text = input.getText().toString().trim();
        if (text.isEmpty()) {
            input.requestFocus();
            return;
        }
        final String base = Prefs.url(this);
        if (base == null) {
            Toast.makeText(this, "請先在魅魔萬事屋設定伺服器", Toast.LENGTH_SHORT).show();
            Prefs.openMainApp(this);
            return;
        }
        sending = true;
        send.setEnabled(false);
        new Thread(new Runnable() {
            public void run() {
                DiscoverClient.Result result = null;
                try {
                    result = DiscoverClient.post(base, text);
                } catch (Exception e) {
                    result = new DiscoverClient.Result("連不上伺服器", 0);
                }
                final DiscoverClient.Result done = result;
                runOnUiThread(new Runnable() {
                    public void run() {
                        sending = false;
                        send.setEnabled(true);
                        if (done.error == null) {
                            String msg = done.gold > 0
                                    ? "已送進發現 +" + done.gold + " 金"
                                    : "已送進發現";
                            Toast.makeText(AddActivity.this, msg, Toast.LENGTH_SHORT).show();
                            finish();
                        } else {
                            Toast.makeText(AddActivity.this, done.error, Toast.LENGTH_SHORT).show();
                            input.requestFocus();
                        }
                    }
                });
            }
        }).start();
    }
}
