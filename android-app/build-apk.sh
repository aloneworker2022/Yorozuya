#!/usr/bin/env bash
# 在 RP5 / aarch64 上用 Debian aapt + d8 打 WebView 殼。
# Gradle 的 build-tools 只有 x86_64，這台機器走這支。
# 產物：../web/yorozuya.apk （下載頁 /download）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LIB="$ROOT/../android-widget/lib"
SRC="$ROOT/app/src/main"
OUT="$ROOT/build/apk-shell"
PKG=tw.yorozuya.app
cd "$ROOT"
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes"

need() { command -v "$1" >/dev/null || { echo "缺少 $1" >&2; exit 1; }; }
need aapt
need javac
need zipalign
need apksigner
need java
[[ -f "$LIB/android.jar" && -f "$LIB/r8.jar" ]] || { echo "缺少 android-widget/lib 的 android.jar / r8.jar" >&2; exit 1; }

python3 - "$SRC/AndroidManifest.xml" "$OUT/AndroidManifest.xml" << 'PY'
import pathlib, sys
src, dst = sys.argv[1:]
text = pathlib.Path(src).read_text()
old = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
new = (
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n'
    '    package="tw.yorozuya.app"\n'
    '    android:versionCode="11"\n'
    '    android:versionName="8.1">'
)
if old not in text:
    raise SystemExit("manifest root not found")
pathlib.Path(dst).write_text(text.replace(old, new, 1))
PY

echo "aapt → R.java + 資源包"
aapt package -f -m \
  -J "$OUT/gen" \
  -M "$OUT/AndroidManifest.xml" \
  -S "$SRC/res" \
  -I "$LIB/android.jar" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  -F "$OUT/res.apk"

echo "javac"
find "$SRC/java" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
# android.jar 沒有 LambdaMetafactory，不能拿它當 bootclasspath。
# java.* 用這台 JDK，android.* 用 android.jar。
javac -source 1.8 -target 1.8 -Xlint:-options \
  -encoding UTF-8 \
  -classpath "$LIB/android.jar" \
  -d "$OUT/classes" \
  @"$OUT/sources.txt"

echo "d8 → classes.dex"
mapfile -t CLASS_FILES < <(find "$OUT/classes" -name '*.class')
java -cp "$LIB/r8.jar" com.android.tools.r8.D8 \
  --lib "$LIB/android.jar" \
  --min-api 24 \
  --output "$OUT" \
  "${CLASS_FILES[@]}"

echo "合成 APK"
cp "$OUT/res.apk" "$OUT/unsigned.apk"
( cd "$OUT" && zip -qj unsigned.apk classes.dex )

zipalign -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

KS="$ROOT/../android-widget/debug.keystore"
apksigner sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/yorozuya.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/yorozuya.apk"
cp "$OUT/yorozuya.apk" "$ROOT/../web/yorozuya.apk"
ls -lh "$ROOT/../web/yorozuya.apk"
echo "OK $ROOT/../web/yorozuya.apk"
