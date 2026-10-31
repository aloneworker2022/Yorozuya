# Yorozuya room silhouettes, full walk (eye-level, dZ=0)
Geometry: room_doll_full.js = front camera patch + v8 breast shapes + nipples/areola.
- Areola: flat disc prim tagged nip=1, colour (150,100,128). Radius small 1.15 / medium 1.75 / large 2.5, x(0.35+0.16*cupR) — scales with breast size (A≈0.72x, H≈1.4x). Walk bounce amp = CUP_BOUNCE·(0.55+0.45·CUP_BOUNCE)·1.35 (bigger cup → much more bounce).. Nipple: sphere r 0.6 tagged nip=2, colour (205,150,175). Placed on the front-most point of each shape (pendulous: front-lower, tilted down).
- Rendering: the bust tag carries the nip value (2=areola, 3=nipple). Those pixels are painted when the nip prim is the nearest surface, so they hide correctly behind the arm or body.
Direction -> yaw (deg): front 0 (前), front_right 45 (右前), right 90 (右), back_right 135 (右後), back 180 (後), back_left -135 (左後), left -90 (左), front_left -45 (左前). "Right" means she walks toward screen-right.
Body: balanced 161 勻稱有致 中分長髮 / slim 166 纖細苗條 短髮 / petite 150 嬌小玲瓏 雙馬尾 / curvy 163 微肉圓潤 大波浪長髮.
Rendered sets: FULL matrix 4 body x 3 shape x 8 cup x 3 areola x 8 dir = 2304 sheets (render.cjs; parallel: SHARD=i NSHARD=n). Pendulous shape = v8 hanging version (pt11u upper-flattening reverted); cup-scaled walk bounce + size-scaled areola kept.
 A) 4 body x 3 areola x 8 dir (round D)
 B) balanced x medium areola x 3 shape x 8 cup x 8 dir
 C) balanced x 3 shape x 8 cup x 3 areola, front
sheets/<body>_<shape>_<cup>_<areola>_<dir>.png = 8 frames side by side (64x140 each, 1x; viewer scales 4x pixelated).
gifs/ = 4x GIFs of key combos (71ms/frame, loop).
index.html: switch 體型/乳暈/胸型/罩杯/方向; play/pause/step/speed; 8-direction ring. Uncomputed combos are greyed and snap to the nearest computed one.
play.html (/droom/play): Doom-style raycaster room, one wandering girl billboard using sheets (8-dir by relative angle; idle = frame 0). WASD/arrows/QE, pointer-lock mouse look.

## 2026-10-30 pt24u：巨大乳暈＋髮型系統（後髮＋前髮）
- 乳暈新增 `huge`（巨大）：貼著乳房曲面的殼（乳房橢球 ×1.03，平面切在乳頭後 0.62 半徑），蓋住朝前約半個乳房。sheet 矩陣改為 4 乳暈 → 3072 張。
- 身體 sheet 一律不含頭髮（doll.hair='none'）。頭髮另畫在 `sheets/hair/<body>_<back|front>_<style>_<dir>.png`（只留頭髮像素，被身體擋住的不畫）。
  - 後髮 backHair：long 長髮 / wavy 波浪長髮 / short 短髮 / pony 馬尾 / medium 中長髮
  - 前髮 frontHair（含頭頂髮帽）：blunt 齊瀏海 / french 法式瀏海 / side 旁分 / pomp 吹高髮 / curtain 長髮分兩邊
- index.html 與 play.html：身體＋後髮＋前髮逐格疊（面向後方時後髮在上），再上白皙膚色、髮色、乳頭色。

## 2026-10-30 pt28u：服裝第一套「餐巾白布」（napkin）
- room_doll_full.js `napkin()`：一片薄白布從脖子／鎖骨垂下，順著胸型繃過兩邊乳尖（乳溝處橫跨不陷入）再直直落下到胸下；prim 標 `cloth`，渲染成 CLOTH_RGB／邊緣 CLOTH_LO_RGB、alpha CLOTH_A=236。`doll.cloth='napkin'` 才畫，身體 sheet 不變。
- 圖層：`sheets/cloth/<body>_<shape>_<cup>_napkin_<dir>.png`（4×3×8×8＝768 張，`render_cloth.cjs`，SHARD/NSHARD 可平行），只留布的像素。
- index.html／play.html：「服裝 無／餐巾白布」，預設餐巾白布。上色後以 78% 白半透明蓋上（乳暈乳頭隱約透出），頭髮在布前面處不蓋。

## 2026-10-30 pt29u：餐巾布修飾＋配色
- `napkin()` 加：金色頸鍊（從布兩上角繞到脖子後）、下緣邊框、兩個下垂角＋配重（`bell` 鈴鐺／`jade` 玉石）。
- cloth sheet 改為部位標記色：布 CLOTH_RGB/LO、邊框 #F00、鍊 #0F0、配重 #00F/#0000A0；檔名 `sheets/cloth/<body>_<shape>_<cup>_napkin_<bell|jade>_<dir>.png`（1536 張）。
- 前端配色：粉紅透明布＋金邊／黑色透明布＋白邊／白色透明布＋紅邊；鍊一律金色；鈴鐺金、玉石綠。index.html 有「配色」「配重」按鈕，play.html 有下拉。

## 2026-10-30 pt31u：下身第一批（陰毛／陰唇／蕾絲丁字褲）
- room_doll_full.js `groin()`：`doll.pubic`＝strip 一條線／triangle 三角形（無＝沒有）、`doll.labia`＝line 一線／butterfly 蝴蝶唇、`doll.pants`＝lace_thong 蕾絲丁字褲（低腰細褲頭＋前三角蕾絲＋後 T 字細繩）。
- 圖層 `sheets/groin/<body>_<pubic|labia|pants>_<style>_<dir>.png`（160 張，`render_groin.cjs`），部位標記色：陰毛 #F0F（前端換成髮色）、陰唇 #FF0、蕾絲 #0FF/#0AA、褲頭 #F80。
- 疊法：身體上色後 陰唇→陰毛→丁字褲（蕾絲棋盤鏤空半透）→餐巾布。index.html／play.html 加「陰毛」「陰唇」「褲子」「蕾絲色（黑／白／紅／粉紅）」。

## 2026-10-30 pt33u：走路擺手
- walk 手臂擺幅 16°（前擺只有 ×0.35）→ 約 ±24～30°，與同側腳反向；前擺時手肘多彎、手往身體中線收，後擺時手略往外，前／後方向也看得出擺手。身體、頭髮、餐巾布、下身 sheet 全部重繪。

## 2026-10-31：乳暈改畫在曲面＋下垂巨乳外擴
- 乳暈不再用圓盤／斜切殼 SDF（會被乳房曲面搶深度吃掉）；改成 `areolaStamps` 在乳房像素上依世界座標距離塗 AREOLA／NIP 標記色，乳頭另沿指向往外凸小球。
- 下垂型（pendulous）維持朝下約 40°；巨乳外擴：根部靠近胸骨、下緣隨罩杯往左右拉開（兩顆果子同根）。
- 2026-10-31：罩杯半徑重排 A≈只剩乳暈（1.0）、B 1.85、C 2.85、D 4.15…G 6.2、H 6.75；走路時 D 以上手臂前擺打到乳房 → 整胸左右晃（越大越明顯）。
- 標記色不變（前端照舊上色）；重渲 body sheets（含 sheets2x）才看得到。

## 2026-10-31：白邊 1px＋頭髮遮擋修正
- 白邊：
  - 外輪廓：前端 `outline()`（index.html／play.html 上色後），整個人（含頭髮）外圈 1px 白，不跨格。
  - 手腳：`render()` 記每個像素是不是手腳（`limb`），手腳像素旁邊有比較遠（>EDGE_DEPTH 2.5）的身體 → 標 `EDGE_RGB` (240,240,240)，前端上成白色。
- 頭髮遮擋：舊頭髮圖層用圓形 D 的身體算遮擋，換大胸／下垂時從縫裡露出的後髮會蓋在乳房上變黑洞。改用 `renderHairLayer()`：頭髮單獨畫一次＋H 罩杯 圓形／鐘型／下垂／托高各畫一次，四種都看得到的像素＝在身體前面（alpha 220，一律蓋上）；其餘＝可能被擋（alpha `HAIR_BACK_A` 214），前端 `over()` 只畫在身體以外。
- 重畫：1× body＋hair（render.cjs，`ONLY=body|hair` 可只畫一種）、2× body／sup／hair（render_hd.cjs）。cloth／groin 不受影響。

## 2026-10-31：私處「打開」
- `LABIAS` 加 `line_open`／`butterfly_open`：細縫撐開成上尖下圓的杏仁形，外緣陰唇色 #FF0、紅色內裡 `OPEN_RGB` #F00、下三分之一深紅小口 `HOLE_RGB` #800000（前端 → (208,52,72)＋少量亮點、(122,14,30)）。蝴蝶唇打開另有兩片小陰唇往外翻。
- 打開＝真的在身體上挖一個往內凹的洞（`sh.carve` 零件，render 時 身體 − 洞）：洞壁標紅色內裡，比原表面深 0.7 以上標深紅小口；外緣陰唇色是貼平皮膚的薄片。側面看只是平的皮膚，不會凸出。groin sheets 只新增 *_open_*（1×／2× 各 64 張）。
- 前端：陰唇選單加「一線（打開）」「蝴蝶唇（打開）」；小口顏色比對容許誤差（canvas 預乘 alpha 會讓 128 偏掉）。

## 2026-10-31：坐地 M 字腿／V 字腿＋腿型（照參考圖）＋陰毛重做
- 姿勢 `sit_m`（屁股坐地、膝蓋立起往兩邊倒、腳板踩地）／`sit_v`（兩腿伸直往兩邊張 33°、腳尖朝上）：靜態一格、上身微往後靠、兩手撐身後地上、canvas `floor`（150×84）、地板以下切掉；屁股（V 字還有大腿外側）被地板壓扁往外擠。
- sheet：`render_sit.cjs`（POSE=sit_m|sit_v、HD=1 出 2×）→ `sheets[2x]/<pose>/<body>_<shape>_<cup>_<areola>.png`、`<pose>/hair/…`、`<pose>/groin/…`；每格 150×84（2× 300×168），一張＝8 方向橫排（front, front_right, right, back_right, back, back_left, left, front_left）。坐姿不畫衣服。
- index.html 加「姿勢」選單（走路／坐地 M 字腿／坐地 V 字腿）。
- 腿型（照使用者參考圖 Bad／Good）：大腿根部往外鼓（雙三角輪廓）、膝蓋微靠攏（kx 3.2→2.75）、膝蓋內側鼓包低／外側高。
- 鼠蹊線 `inguinal()`：從髖骨往內往下收到胯下、再沿大腿內側往下一小段；CREASE_RGB 細、淡（前端 226,178,152）。走路正面（無裙）＋坐姿都畫。
- 陰毛重做：貼平皮膚的薄片；中間 PUBIC_RGB（前端：幾乎全是毛＋亮色毛紋、零星透皮膚）、外緣 PUBIC_EDGE_RGB #C0C（半透參差）。三角形＝倒三角、上緣兩肩圓弧；一條線＝窄長條、下端收尖。
