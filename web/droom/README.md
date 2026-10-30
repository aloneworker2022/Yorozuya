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
