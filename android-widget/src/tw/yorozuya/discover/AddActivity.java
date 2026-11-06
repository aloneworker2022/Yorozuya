package tw.yorozuya.discover;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

public class AddActivity extends Activity {
    private static final int REQ_VOICE = 41;
    private EditText input;
    private boolean sending;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setContentView(R.layout.activity_add);
        input = (EditText) findViewById(R.id.input);
        // 輸入框可以換行顯示（字多時往下排），但鍵盤右下角仍是「送出」
        input.setHorizontallyScrolling(false);
        input.setMaxLines(8);
        pixelFont();
        // 兩個都是正方形：邊長＝各一半的寬度
        final View sheet = findViewById(R.id.sheet);
        sheet.post(new Runnable() {
            public void run() { squareUp(sheet); }
        });
        findViewById(R.id.spacer).setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { finish(); }
        });
        findViewById(R.id.mic).setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { listen(); }
        });
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            public boolean onEditorAction(TextView v, int action, android.view.KeyEvent e) {
                boolean enter = e != null && e.getKeyCode() == android.view.KeyEvent.KEYCODE_ENTER
                        && e.getAction() == android.view.KeyEvent.ACTION_DOWN;
                if (action == EditorInfo.IME_ACTION_SEND || enter) {
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

    /** 2026-11-06 使用者：框這麼大字卻這麼小 → 字變大、置中（layout gravity=center）、點陣字。
     *  字型＝Fusion Pixel 12px 繁中（assets/，OFL；網頁 web/fonts 同一套）。一個字 12 格，字級取 12px 的整數倍、關掉反鋸齒，邊緣才是一格一格的方塊。
     *  字多到框裝不下時縮一級（約 30dp → 20dp）。 */
    private int bigPx, smallPx;
    private void pixelFont() {
        try {
            input.setTypeface(Typeface.createFromAsset(getAssets(), "fusion-pixel-12px-zh-hant.ttf"));
        } catch (RuntimeException e) {
            return;   // 字型讀不到就用系統字（照樣放大、置中）
        }
        input.setPaintFlags(input.getPaintFlags() & ~Paint.ANTI_ALIAS_FLAG);
        float dp = getResources().getDisplayMetrics().density;
        bigPx = 12 * Math.max(2, Math.round(30 * dp / 12f));
        smallPx = 12 * Math.max(1, Math.round(20 * dp / 12f));
        input.setTextSize(TypedValue.COMPLEX_UNIT_PX, bigPx);
        input.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            public void onTextChanged(CharSequence s, int a, int b, int c) {}
            public void afterTextChanged(Editable s) { input.post(new Runnable() { public void run() { fit(); } }); }
        });
    }

    private void fit() {
        if (bigPx == 0 || input.getLayout() == null) return;
        int room = input.getHeight() - input.getPaddingTop() - input.getPaddingBottom();
        if (input.getTextSize() == bigPx && input.getLineCount() * input.getLineHeight() > room) input.setTextSize(TypedValue.COMPLEX_UNIT_PX, smallPx);
        else if (input.getTextSize() == smallPx && input.length() == 0) input.setTextSize(TypedValue.COMPLEX_UNIT_PX, bigPx);
    }

    private void squareUp(View sheet) {
        View mic = findViewById(R.id.mic);
        int side = mic.getWidth();
        if (side <= 0) return;
        for (View v : new View[] { mic, input }) {
            android.view.ViewGroup.LayoutParams lp = v.getLayoutParams();
            lp.height = side;
            v.setLayoutParams(lp);
        }
    }

    /** 語音輸入（2026-11-04）：叫系統的語音辨識（不用麥克風權限，辨識畫面由系統／Google 給），說完填進輸入框、直接送出（2026-11-04：不用再按送出）。 */
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
        submit();   // 說完直接送；送不出去（連不上…）字留在框裡可以再按送出
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
        input.setEnabled(false);
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
                        input.setEnabled(true);
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
