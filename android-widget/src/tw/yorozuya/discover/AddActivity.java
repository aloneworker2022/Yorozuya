package tw.yorozuya.discover;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

public class AddActivity extends Activity {
    private static final int REQ_VOICE = 41;
    private EditText input;
    private Button send;
    private boolean sending;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setContentView(R.layout.activity_add);
        input = (EditText) findViewById(R.id.input);
        send = (Button) findViewById(R.id.send);
        findViewById(R.id.spacer).setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { finish(); }
        });
        send.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { submit(); }
        });
        findViewById(R.id.mic).setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { listen(); }
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

    /** 語音輸入（2026-11-04）：叫系統的語音辨識（不用麥克風權限，辨識畫面由系統／Google 給），說完填進輸入框，再按送出。 */
    private void listen() {
        Intent it = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        it.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        it.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-TW");
        it.putExtra(RecognizerIntent.EXTRA_PROMPT, getString(R.string.voice_prompt));
        it.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(it, REQ_VOICE);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "這支手機沒有語音輸入（要裝 Google 語音服務）", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_VOICE || res != RESULT_OK || data == null) return;
        java.util.ArrayList<String> got = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (got == null || got.isEmpty() || got.get(0).trim().isEmpty()) {
            Toast.makeText(this, "沒聽清楚，再說一次", Toast.LENGTH_SHORT).show();
            return;
        }
        String said = got.get(0).trim();
        String cur = input.getText().toString().trim();
        String text = cur.isEmpty() ? said : cur + " " + said;
        if (text.length() > 80) text = text.substring(0, 80);
        input.setText(text);
        input.setSelection(text.length());
        input.requestFocus();
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
