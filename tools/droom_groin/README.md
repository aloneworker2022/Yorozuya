# droom 胯下近景（樣品，2026-11-08）

肏的像素預產動圖第一步：用 **droom 人偶**（`web/droom/room_doll_full.js`，在 `claude-2026.10` 分支）拍坐地 M 字腿的胯下近景，
照 droom `index.html` 的 `tint`（三階肉色）、外圈 1px 白邊上色；陰毛、陰唇肉穴跟近景眼睛 `eyes_big.js` 一樣——
**模型只給位置（陰毛 #F0F、陰唇 #FF0 標記），近景另外用曲線畫**（`groin_big.cjs`）。

- 鏡頭：她正前方 0.40 格、高 0.22 格、往下 12°，f 380，220×230（K＝2）。
- 陰唇：杏仁形大陰唇（droom 肉色三階＋鼠蹊線色外緣）、縫裡小陰唇粉→穴口附近紅、陰蒂、深紅肉穴口、濕亮點、一條愛液；
  大小跟鏡頭走（各種陰唇同大小），`open`（line_open／butterfly_open）縫張開比較大。
- 陰毛：照模型標記形狀（三角形／一條線），整片往上移到陰阜（坐地時胯下被壓短，標記會整片蓋住陰唇），
  中間實心暗毛＋一根根往下、往外翹的捲毛，hash 固定（之後做動圖每幀不閃）。

```
DROOM=<claude-2026.10 的 web/droom 路徑> PUBIC=triangle LABIA=butterfly_open \
W=220 H=230 F=380 DIST=.40 EYE=.22 PITCH=12 CY=95 UP=3 OUT=out.png node groin_close.cjs
```
