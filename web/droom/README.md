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
- play.html（房間 Doom 模式）：預設改用 2× sheet（`?sd=1` 才用 1×）；介面加「姿勢」選單（走路／坐地 M 字腿／坐地 V 字腿），選坐姿時妹子停在原地坐下，依玩家看她的角度選 8 方向之一；坐姿 sheet 用同一個每像素比例、地面列對齊走路 sheet。
- play.html 低頭看自己改成第一人稱透視（程式逐像素畫）：畫面最下緣是下腹，往上是大腿根→膝蓋→小腿→踩地的腳（越遠越小），陰莖從兩腿根中間往畫面上方（往前）伸；軟／微勃起／勃起長度與龜頭外露不同；走路時兩腳一前一後交替。手畫陰莖 PNG 不再使用。
- 低頭角度：可以低到幾乎垂直（PMIN 1.52，約 87°）；俯角 1.2（約 69°）以前完全看不到自己，之後才從畫面底升上來（約 83° 才看到陰莖）。
- 陰莖形狀重做（低頭從上往下看背面）：勃起＝根粗往前收、微翹、冠狀溝外擴、橡實形龜頭＋尿道口小凹＋背面血管；微勃起＝較短往一邊歪、包皮退一半；軟＝下垂粗短一截、包皮包住、尖端皺褶露一點紅。圓柱明暗（左上打光）量化 4 階。
- 陰莖照使用者參考圖再改：勃起莖粗細＝根 1／中段 1.2／前端 0.8（二次曲線）；龜頭寬圓頭、比莖前端寬（冠狀溝外擴）、頂端中間微凹成兩瓣、下緣冠狀溝弧形；龜頭下兩道包皮皺紋；拿掉血管。微勃起同樣做法（1／1.1／0.9，包皮蓋龜頭後半）。
- 軟的陰莖再小一號（長 30→19、粗 12→8）。
- 低頭看到的腳改成幾乎垂直往下看的樣子：大腿＝畫面下方一小截圓頭圓筒（像軟陰莖，圓柱明暗）、膝蓋小腿看不到；腳掌只從大腿圓頭前面探出一點（腳背＋五趾，大拇趾在內側）；走路兩腳一前一後。
- 低頭改成可到 90°（PMIN＝π/2）；約 86° 以前完全看不到自己，最後約 4° 才升上來、90° 到位（跟其他建模對齊）。
- 低頭改成「畫面跟著捲下去」（使用者選）：地平線移出畫面後繼續按 ⇣，身體跟地板同速從畫面底捲進來（先看到腳尖、龜頭，再來大腿、下腹），捲一整個畫面高到底才停（PMIN 1.875）；取代上一條的 90°／最後 4° 升上來。
- 低頭到底看不到牆（使用者）：地平線移出畫面後，世界（地板／牆／妹子）的 HZ 加速往上捲（HZ×(1＋9s²)，到底 −10SH），貼牆角也只剩地板＋自己身體；身體圖層照舊等速捲進來。
- 低頭再調（使用者）：身體要快到地（牆捲完只剩地板）才出現——世界先捲 HZ 0→−SH，之後身體才從畫面底 1.5 倍速捲進來；到底往上移 40px（SELF_LIFT），身體畫布加高 40、下腹加寬蓋滿畫面底；PMIN 2.85。
- 低頭到底＝地板方塊變成整塊，身體這時剛好到位（使用者）：低頭進度 lookS()（HZl 0→−SH，PMIN 1.875）同時驅動世界加速捲（到底 −10SH）與身體捲入（s 0.3→1），兩者同時到底；取代上一條「牆捲完才開始捲身體」。

## 2026-10-31：臉部第一項——眼罩（一塊布綁住眼睛）
- room_doll_full.js `blindfold()`：`doll.blindfold='cloth'` 才畫；布帶貼著頭橢球（往外 0.35）繞一圈、中線在 zc−0.9（瀏海下緣以下，蓋住眼睛），寬約 3.4；後腦一個結＋兩個小耳＋兩條布尾往下垂（走路跟著晃）。從 `hair()` 開頭呼叫，所以走路、坐姿都有。tag cloth＝12 → 標記色 `BLIND_RGB` #0080FF／邊緣 `BLIND_LO_RGB` #0048A0（alpha CLOTH_A）。
- 圖層 `render_face.cjs`（SHARD/NSHARD 平行；1×＋2× 一次出）：走路 `sheets[2x]/face/<body>_blindfold_cloth_<dir>.png`、坐姿 `sheets[2x]/<sit_m|sit_v>/face/<body>_blindfold_cloth.png`；用無頭髮的身體算，只留眼罩像素。
- 目前是樣品：只出了 balanced（勻稱）走路 1×／2× 的眼罩圖層，其他體型與坐姿等使用者看過樣品再出（`node render_face.cjs` 會補齊缺的檔）。
- 前端（play.html／index.html）「眼罩」選單：無／黑布（預設）／紅布／白布。`faceOver()` 最後才蓋（在下身、衣服之後、白邊之前），連頭髮像素也蓋上＝布綁在頭髮外面；上下緣一列較暗＋淡淡布紋。

## 2026-11-01：臉部——鼻子（樣品，使用者：先做鼻子）
- room_doll_full.js `nose()`：`doll.nose='small'` 才畫；小而尖的動漫鼻，鼻樑從 zc−1.9 往前下斜到鼻尖 zc−3.7（離臉面約 1.5）＋鼻尖小圓。tag cloth＝13 → `NOSE_RGB` #FF0080／深度邊緣 `NOSE_LO_RGB` #A00050。從 `hair()` 開頭呼叫（所有姿勢都有）。
- `render_face.cjs` 改成多項目：`ITEMS=nose,blindfold`、`BODIES=…`、`POSES=walk,sit_m,sit_v` 可限定；檔名 `face/<body>_nose_small_<dir>.png`。樣品只出 balanced 走路 1×／2×。
- 前端 `noseOver()`：只畫在頭髮以外；正面只在鼻子最下緣點一個陰影（右側淡一點），鼻樑沿用原膚色；側面凸出臉外的部分補膚色＋下緣陰影（外圈白邊照舊）。「鼻子」選單 無／小鼻子（預設小鼻子）；眼罩預設改成無。
- 鼻子第 2 版（使用者給動漫鼻參考圖）：側面改三角形微翹（鼻樑斜直線→小鼻尖→鼻底往回收到人中，離臉約 1.9）；前端改用「線」畫：每格依方向（右＋1／左−1，正面算右）在鼻子外緣下半段畫一條線、最下緣往回勾（J 字），另一側隔一格點一個小鼻孔，線色 (184,116,98)；凸出臉外補膚色。

## 2026-11-01：動漫臉型（樣品，使用者：是臉型的問題，給臉型參考圖）
- room_doll_full.js `animeHead()`（`doll.face='anime'` 才用；`headPart` 多傳 doll）：上半圓頭骨（頭頂高度不變、頭髮照舊貼合）＋中臉／臉頰橢球＋兩條下顎線 cone 從耳下斜往前下收到尖下巴＋下巴中間 cone。參數集中在 `ANIME_HEAD`。
  正面：顴骨最寬、往下收成 V 字下巴；側面：額頭→鼻→鼻下內凹→下巴往前，下顎線斜回耳下，脖子接在下顎後面。
- `nose()`：有 doll.face 時沿 x＝0 從前面往後找臉表面（先算好所有表面點再放零件）。
- 樣品只做截圖（勻稱 round D 中乳暈 2×），sheet 沒換；使用者確認後才重畫 body／hair／face 圖層（要加 `face:'anime'`）。
- 臉型第 2 版（使用者：下巴跟鼻子都不對，看參考圖側面）：照參考圖側面量比例（頭高 17.6：眼 −1.9、鼻尖 −4.0、嘴 −5.8、下巴 −8.8；臉前緣從額頭往下幾乎垂直，鼻下往後收、下巴比鼻尖後面、尖下巴，下顎線直直斜回耳下）。
  新零件 `sh.face`（prim k＝4）＝側面多邊形 ∩ 正面多邊形 ∩ 由上往下看的橢圓（水平切面圓弧），參數 `ANIME_HEAD.prof／front／top`。動漫臉的脖子細一點（×0.8）、往前斜、從下顎中間接下去。
- 臉型第 3 版（使用者在參考圖上圈重點）：
  - 鼻子有山根：動漫臉時鼻子改成貼在臉上的三角楔形（`sh.face` 側面三角：山根在眼睛高的凹處 → 鼻樑斜到鼻尖 → 鼻底收回人中；正面上窄下寬），不再是翹出去的圓錐。
  - 側面輪廓：眉骨微凸 → 山根凹 → 鼻下 → 上唇微凸 → 嘴縫 → 下唇 → 唇下凹 → 下巴 → 尖下巴 → 下顎線斜回耳下；脖子上端往後下移，讓下顎線露出來。
  - 45 度：眉骨、顴骨各加一個小凸起（`ANIME_HEAD.brow／cheek`），中間就是眼窩的凹口；另加眼窩挖洞（carve＝2：只挖不改色；carve 模式 2 為新加）。臉的水平切面改圓弧（top 橢圓）。
- 鼻子第 3 版（使用者在剪影上畫出鼻子＋山根）：鼻樑從眉間（zc＋1.8，比眼睛高）開始，順著臉往下慢慢凸出，到鼻尖（−3.95，離臉 1.8）最高；正面上細（±0.2）下寬（±0.95）的長條。側面輪廓拿掉眼睛高的深凹口（鼻樑從額頭順下來）。
  前端：正側面（right／left）不畫鼻子的線，只把凸出臉外的部分補膚色；正面／斜面的線只畫靠鼻尖那 40%。
- 鼻子兩種（使用者）：`small`＝尖鼻（鼻樑直、鼻尖尖）；`round`＝圓鼻頭（山根往下微微往內彎，鼻頭一顆小圓）。選單「鼻子」：無／尖鼻／圓鼻頭。圖層檔名 `face/<body>_nose_<small|round>_<dir>.png`（圓鼻頭圖層還沒出）。
- 45 度下巴（使用者：太有稜角，要倒三角）：臉改成疊層零件 `sh.loft`（prim k＝5）：每個高度一個水平橢圓切面（`ANIME_HEAD.loft`：[z, 半寬, 前緣 y, 後緣 y]），往下越來越小、下巴收成一點 → 正面 V、側面輪廓、45 度都是順的倒三角。
- 鼻子 9 種（使用者：做 9 種來選）：`NOSE_STYLES` 參數化（鼻根 root、鼻尖 tip、凸出 P、鼻樑彎 conc、鼻頭圓 r、上翹 up、正面上下寬 wt／wb）：1 尖鼻 small、2 圓鼻頭 round、3 翹鼻 upturned、4 小巧鼻 petite、5 高挺鼻 tall、6 微駝峰 hump、7 鈕扣鼻 button、8 寬鼻翼 wide、9 細長鼻 long。選單 1～9。圖層還沒出。
- 側面下巴（使用者：太圓）：loft 最後幾層前緣撐到最底（6.6→6.2）、後緣往前收快，圓角 0.25→0.15 → 下巴尖角、下顎線直。

## 2026-11-01：嘴巴（樣品，使用者：先做嘴唇）
- room_doll_full.js `mouth()`：`doll.mouth` 有值才畫；動漫臉嘴縫高度（z −5.55）沿臉表面貼一條薄帶（x ±1.4）＋中間一顆稍凸的點（側面也抓得到），tag cloth＝14 → `MOUTH_RGB` #80FF80／#40A040。只標位置。
- 前端 `mouthOver()`：每格找標記範圍（中心、寬），照嘴型畫像素：閉嘴 line、微笑 smile、小 o 嘴 o、張嘴笑 open、嘟嘴 pout、口紅 lip；正側面從臉前緣往內畫一小段。換嘴型不用重畫圖。選單「嘴巴」。
- 圖層檔名 `face/<body>_mouth_<dir>.png`（坐姿 `<pose>/face/<body>_mouth.png`）；還沒正式出（render_face.cjs 尚未加 mouth）。

## 2026-11-01：眼睛（樣品）
- room_doll_full.js `eyes()`：`doll.eyes` 有值才畫；兩眼中心 x ±2.75、z −1.95，各一片貼臉表面的薄片（半寬 1.45、半高 1.25），tag cloth＝15 → `EYE_RGB` #8080FF／#4040A0。只標位置。
- 前端 `eyesOver()`：每格把標記分成一隻隻眼睛（範圍＝眼眶，外眼角＝離另一隻遠的那側；只剩一隻＝正側面，外眼角朝耳朵），照眼型畫：大圓眼 round、杏眼 almond、下垂眼 droopy、貓眼 cat、笑眼 happy（∩）、閉眼 closed（︶）；上睫毛最粗、外眼角加厚，眼白、瞳孔三階（上深下亮）＋亮點，外側下睫毛。瞳色：咖啡／藍／綠／紅／紫／黑。選單「眼睛」「瞳色」。
- 圖層檔名 `face/<body>_eyes_<dir>.png`（坐姿 `<pose>/face/<body>_eyes.png`）；還沒正式出。
- 臉部樣品一律用 2×（hd）做；1× 同一個模型、解析度減半，細節會更小。
- 嘴唇重做（使用者：嘴唇做錯、側面要看到唇形，給動漫嘴參考圖）：動漫臉時嘴唇是兩個零件凸出臉外——上唇（cloth 14，寬、凸多）、下唇（cloth 16 → `LIPLO_RGB` #C8FF80，窄、凸少）；位置在鼻底到下巴約三分之一（上唇 −5.75、下唇 −6.55）。臉前緣在人中、唇下（−7.2 唇下凹）平順。
  前端照參考圖：主線＝上唇最下一列（中段深、兩端淡、嘴角收尖）、上方一小點（上面兩格是皮膚才畫）、下唇下面一小段影子；凸出臉外的唇補膚色（側面看得到唇形）；粉唇＝上下唇染淡粉紅＋下唇亮點。嘴型改名：自然閉嘴／粉唇／微笑／小 o／張嘴笑／嘟嘴。
- 唇色（使用者：嘴唇顏色可以多種）：前端 `LIP_PAL`，任何嘴型都能套，選單「唇色」：無（自然）／淡粉／珊瑚／正紅／莓果／裸色／蜜桃橘／梅紫／酒紅；每色有濃度與嘴線深色（深色唇＝上色濃、嘴線也加深），有唇色時下唇加亮點。粉唇／嘟嘴沒選唇色時用淡粉。
- 嘴巴表情（使用者：嘴巴張開、微笑、吐舌頭）：微笑 smile（嘴角上彎＋嘴角小點）、張嘴 open（圓角開口：上緣深線、裡面暗紅、下方舌頭）、開口笑 grin（上緣平直、嘴角上揚、上排牙、D 字收底）、吐舌 tongue（嘴微開、粉紅舌頭從下唇伸出兩列＋圓底）、張嘴吐舌 opentongue；正側面：張嘴＝往內暗色缺口，吐舌＝舌頭伸出輪廓外，微笑＝嘴角上翹。
- 側面舌頭（使用者：應該往下）：從嘴縫出來凸出一格、往下垂三格蓋在下唇前面，末端深一點；不再往前伸。
- 側面張嘴（使用者：側面嘴巴要張開）：張嘴／開口笑／吐舌／張嘴吐舌在正側面把輪廓真的挖開（嘴縫下 2～3 列的最前一兩格設成透明，外圈白邊會繞進缺口），缺口裡暗紅（開口笑上排一列牙），缺口下是下唇邊；吐舌＝舌頭從缺口出來往下垂過下唇。

## 2026-11-01：眉毛（樣品，使用者：眼睛用布綁著不用做，接著做眉毛）
- room_doll_full.js `brows()`：`doll.brows` 有值才畫；兩邊各一條貼臉表面的細帶（x 1.0～3.9、z ＋0.8），tag cloth＝17 → `BROW_RGB` #FFC040／#A07828。只標位置。
- 前端 `browsOver()`：分左右兩條（眉頭＝靠臉中間；正側面眉頭朝前），照眉型畫（t＝0 眉頭→1 眉尾）：自然 natural（微弧）、平眉 flat、細彎 arch（彎多、眉尾收細）、粗眉 thick（眉頭兩列）、八字 worried（眉頭上）、怒眉 angry（眉頭下）；顏色＝髮色暗色、眉頭深一點。選單「眉毛」。
- 眼罩跟動漫臉：`blindfold()` 在動漫臉時帶子中線改到眼睛高（z −1.95），沿實際臉表面（含鼻子、顴骨）往外 0.35 繞一圈（先找好所有點再放零件）；眉毛在布上緣上面隔一格。

## 2026-11-01：拆部位（樣品，使用者：既然要改無頭版本，還有什麼可以切——之後有爬、坐、跳舞等動作）
- 每個零件標部位 `p.part`：head（headPart／動漫頭）、torso（其餘軀幹、脖子、臀）、breast（sh.bust／nip）、armL／armR（arm() 依肩膀左右）、legs（leg()）。
- `render(..., {parts:[…], gbuf:true})` 只算某些部位、回傳原始資料（hit、tt 深度、mat、bust 標記、limb）；`render(..., {gbufIn})` 用疊好的原始資料直接上色。`renderParts()`／`renderComposite()`：各部位分開算 → 每格取最近（tt 最大）→ 統一上色（輪廓線、手腳白邊、乳房邊線都在疊好後才算）。
- 樣品（`parts_sample.cjs`）：勻稱圓形 D 走路 6 方向×2 格，疊回去和整張一起算只差 41/78367 像素（0.05%，乳房邊緣深度門檻），而且分開算比整張快約一倍（13.3 秒 → 6.8 秒）。整張渲染結果不變（跟上一版逐位元組相同）。
- 下一步（待使用者確認）：每個部位出「原始資料 sheet」（深度 16 位元＋標記），前端疊圖後上色；乳房只依胸型×罩杯×乳暈變、頭只依臉型變。
