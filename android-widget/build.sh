#!/usr/bin/env bash
# 在 RP5 / aarch64 上用 Debian aapt + d8 打 debug APK（不安 Android Studio）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LIB="$ROOT/lib"
OUT="$ROOT/build"
PKG=tw.yorozuya.discover
cd "$ROOT"
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$LIB"

need() { command -v "$1" >/dev/null || { echo "缺少 $1" >&2; exit 1; }; }
need aapt
need javac
need zipalign
need apksigner
need keytool
need java

if [[ ! -f "$LIB/android.jar" ]]; then
  echo "下載 android.jar…"
  curl -fL --retry 3 -o "$LIB/android.jar" \
    "https://github.com/Sable/android-platforms/raw/master/android-33/android.jar" \
    || curl -fL --retry 3 -o "$LIB/android.jar" \
    "https://github.com/nicolo-ribaudo/android-sdk-jars/raw/main/android-33/android.jar"
fi
if [[ ! -f "$LIB/r8.jar" ]]; then
  echo "下載 d8 (r8.jar)…"
  curl -fL --retry 3 -o "$LIB/r8.jar" \
    "https://dl.google.com/dl/android/maven2/com/android/tools/r8/8.5.35/r8-8.5.35.jar"
fi

echo "aapt → R.java + 資源包"
aapt package -f -m \
  -J "$OUT/gen" \
  -M AndroidManifest.xml \
  -S res \
  -I "$LIB/android.jar" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  -F "$OUT/res.apk"

echo "javac"
find src "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -source 1.8 -target 1.8 -Xlint:-options \
  -encoding UTF-8 \
  -bootclasspath "$LIB/android.jar" \
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
(
  cd "$OUT"
  zip -qj unsigned.apk classes.dex
)

echo "zipalign"
zipalign -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

KS="$ROOT/debug.keystore"
if [[ ! -f "$KS" ]]; then
  keytool -genkeypair -v -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Yorozuya,O=Yorozuya,C=TW" >/dev/null
fi

echo "簽名"
apksigner sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/discover.apk" "$OUT/aligned.apk"
apksigner verify --verbose "$OUT/discover.apk" | head -20
ls -lh "$OUT/discover.apk"
echo "OK $OUT/discover.apk"
