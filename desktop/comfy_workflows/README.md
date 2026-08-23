# 萬事屋 · ComfyUI 動圖測試

這份 workflow **不是**給 RP5 讀的。複製到顯卡那台，用 ComfyUI 畫面 Load。

遊戲本體仍走 RP5 `server/comfy.py` 現組的靜圖 workflow。這邊是你要在那台先試「立繪會不會動」。

## 放到哪

把整個 `comfy_workflows\` 複製進攜帶版，例如：

```
ComfyUI_windows_portable\ComfyUI\user\default\workflows\
```

舊版沒有 `user\default\workflows\` 就放：

```
ComfyUI_windows_portable\ComfyUI\user\default\
```

然後 ComfyUI 左上 **Load**（或把 json 拖進畫布）。

## 兩份檔

| 檔 | 做什麼 | 額外模型 |
|---|---|---|
| `yorozuya_half_still.json` | 跟遊戲一樣的靜圖半身（對照用） | 你們已經在用的 Illustrious / SDXL checkpoint |
| `yorozuya_half_anim.json` | **動圖**：同一顆 checkpoint + AnimateDiff，16 格 → webp | 還要一顆 SDXL 動態模組（見下） |

先 Load 靜圖確認 checkpoint 下拉選得到、能出圖。再 Load 動圖。

## 動圖還要裝什麼

ComfyUI Manager → Install Custom Nodes：

1. **ComfyUI-AnimateDiff-Evolved**（Kosinkadink）
2. 重開 ComfyUI

動態模組放到：

```
ComfyUI\models\animatediff_models\
```

SDXL / Illustrious 請用其中一個（檔名對得到下拉選單即可）：

- [mm_sdxl_v10_beta.ckpt](https://huggingface.co/guoyww/animatediff)
- 或 Hotshot-XL：`hsxl_temporal_layers.safetensors`

**不要**拿 SD1.5 的 `mm_sd_v15` 去套 Illustrious，會花畫面。

VRAM：832×1216 × 16 格大概要 **12GB+**。不夠就把 workflow 裡 `EmptyLatentImage` 改成 `640×960`，或幀數改 `8`。

## 怎麼測

1. Load `yorozuya_half_anim.json`
2. 左邊 checkpoint 選你們平常畫立繪那顆
3. AnimateDiff 節點選上面的 SDXL 動態模組
4. Queue Prompt
5. 成品在 `ComfyUI\output\yorozuya_anim_*.webp`

prompt 先用檔裡那組短 tag（半身、看鏡頭、微動）。覺得能動了，再把遊戲生圖的英文 tag 貼進正向框。

## 跟遊戲接上（之後）

測通了再跟我說要用哪份。RP5 可以改 `comfy.build_workflow()` 出同樣結構，召喚半身順便出 webp。現在**還沒接**，避免沒測過就燒掉佇列。
