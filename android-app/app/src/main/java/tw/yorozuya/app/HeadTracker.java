package tw.yorozuya.app;

import android.app.Activity;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.webkit.WebView;

/**
 * 2026-11-04 droom VR（Cardboard）：用手機的旋轉感測器追頭，結果丟給網頁 window.yoroHead(h, p)。
 * 為什麼不用網頁的 deviceorientation：手機 Chrome／WebView 只在 https（secure context）才給，
 * 這個 App 連的是 http://區網IP，所以網頁拿不到；由殼直接讀感測器就沒有這個限制。
 * h＝手機背面朝向的方位角（弧度，順時針，從北），p＝仰角（弧度，抬頭為正）。
 * 優先用 GAME_ROTATION_VECTOR（不靠地磁、不會被喇叭／磁鐵拉歪），沒有才用 ROTATION_VECTOR。
 */
final class HeadTracker implements SensorEventListener {
    private final WebView web;
    private final SensorManager sm;
    private Sensor sensor;
    private boolean wanted;
    private boolean registered;
    private long lastNs;
    private final float[] rot = new float[9];
    private final float[] q = new float[4];

    HeadTracker(Activity activity, WebView web) {
        this.web = web;
        sm = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
        if (sm != null) {
            sensor = sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
            if (sensor == null) sensor = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        }
    }

    boolean available() {
        return sensor != null;
    }

    /** 網頁進 VR。 */
    void start() {
        wanted = true;
        register();
    }

    /** 網頁離開 VR。 */
    void stop() {
        wanted = false;
        unregister();
    }

    /** App 切到背景：先停，回來時如果網頁還在 VR 就再開。 */
    void onPause() {
        unregister();
    }

    void onResume() {
        if (wanted) register();
    }

    private void register() {
        if (registered || sm == null || sensor == null) return;
        registered = sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
    }

    private void unregister() {
        if (!registered || sm == null) return;
        sm.unregisterListener(this);
        registered = false;
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        if (e.timestamp - lastNs < 14_000_000L) return;   // 最多約 70 次／秒
        lastNs = e.timestamp;
        // 有些機器 values 多於 4 個，getRotationMatrixFromVector 會丟例外 → 只取前 4 個
        int n = Math.min(4, e.values.length);
        for (int i = 0; i < 4; i++) q[i] = i < n ? e.values[i] : 0f;
        float[] in = n == 4 ? q : new float[]{q[0], q[1], q[2]};
        SensorManager.getRotationMatrixFromVector(rot, in);
        // rot：手機座標 → 世界座標（x 東、y 北、z 上）。手機背面＝手機座標 (0,0,−1) → 第三欄取負
        double x = -rot[2], y = -rot[5], z = -rot[8];
        double h = Math.atan2(x, y);
        double p = Math.asin(Math.max(-1.0, Math.min(1.0, z)));
        final String js = "window.yoroHead&&window.yoroHead(" + h + "," + p + ")";
        WebView w = web;
        if (w != null) w.post(() -> w.evaluateJavascript(js, null));
    }

    @Override
    public void onAccuracyChanged(Sensor s, int accuracy) {
    }
}
