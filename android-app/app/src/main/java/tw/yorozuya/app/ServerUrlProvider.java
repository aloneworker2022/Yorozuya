package tw.yorozuya.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;

/** 同一把簽名的「發現」小工具來這裡讀伺服器網址。位址只存在主 App。 */
public class ServerUrlProvider extends ContentProvider {
    public static final String AUTHORITY = "tw.yorozuya.app.server";

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        MatrixCursor cursor = new MatrixCursor(new String[]{"url"});
        String url = Prefs.getServerUrl(getContext());
        cursor.addRow(new Object[]{url == null ? "" : url});
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        return "vnd.android.cursor.item/vnd.tw.yorozuya.server";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
