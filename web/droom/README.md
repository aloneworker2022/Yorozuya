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
