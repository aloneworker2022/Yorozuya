#!/usr/bin/env python3
"""ComfyUI 連線煙霧測試:送一份 workflow、等出圖、把圖抓回本機。

在 RP5 上跑,確認「RP5 → Windows ComfyUI」整條路通了,再接進遊戲伺服器。
只用標準函式庫,不必裝東西。

    python3 server/comfy_test.py --host http://192.168.1.20:8188
    python3 server/comfy_test.py --host http://win:8188 --workflow web/content/workflows/portrait_lora.json
    python3 server/comfy_test.py --host http://win:8188 --prompt "1girl, solo, silver hair, maid" --seed 42

沒指定 --ckpt / --lora 時,會去問 ComfyUI 有哪些模型,自動用第一個,
所以 workflow 裡的 REPLACE_ME.safetensors 不必先手動改。
"""
import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

TIMEOUT = 30


def api(host, path, body=None):
    url = host.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"} if data else {}
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read())


def list_models(host, node_class, field):
    """問 ComfyUI 某個節點的某個下拉欄位有哪些選項(例:有哪些 checkpoint)。"""
    try:
        info = api(host, "/object_info/" + node_class)
        opts = info[node_class]["input"]["required"][field][0]
        return list(opts) if isinstance(opts, (list, tuple)) else []
    except Exception:
        return []


def find_node(wf, title):
    """依 _meta.title 找節點 id(我們的 workflow 用 title 當契約,不綁 node id)。"""
    for nid, node in wf.items():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return nid
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True, help="ComfyUI 位址,例 http://192.168.1.20:8188")
    ap.add_argument("--workflow", default="web/content/workflows/portrait.json")
    ap.add_argument("--ckpt", help="checkpoint 檔名(不填=用 ComfyUI 回報的第一個)")
    ap.add_argument("--lora", help="LoRA 檔名(只有 lora 版 workflow 用得到)")
    ap.add_argument("--prompt", help="正面提示詞(不填=用 workflow 內建那句)")
    ap.add_argument("--seed", type=int, help="種子(不填=用 workflow 內建值)")
    ap.add_argument("--out", default="comfy_test_out.png")
    args = ap.parse_args()

    # 0) 通不通
    try:
        stats = api(args.host, "/system_stats")
        dev = (stats.get("devices") or [{}])[0]
        print(f"✓ 連上 ComfyUI:{dev.get('name', '?')} / "
              f"VRAM {round(dev.get('vram_total', 0) / 1048576)} MB")
    except Exception as e:
        print(f"✗ 連不到 {args.host}:{e}")
        print("  檢查:ComfyUI 是否加了 --listen、防火牆 8188、IP 是否正確")
        return 1

    wf = json.loads(Path(args.workflow).read_text(encoding="utf-8"))
    wf = {k: v for k, v in wf.items() if not k.startswith("_")}   # 保險:去掉註解鍵

    # 1) 填模型名:沒指定就用 ComfyUI 實際有的第一個
    ck_id = find_node(wf, "CHECKPOINT")
    if ck_id:
        ckpt = args.ckpt
        if not ckpt:
            avail = list_models(args.host, "CheckpointLoaderSimple", "ckpt_name")
            if not avail:
                print("✗ ComfyUI 說它沒有任何 checkpoint——模型放對資料夾了嗎?")
                return 1
            ckpt = avail[0]
            print(f"  未指定 --ckpt,自動使用:{ckpt}(共 {len(avail)} 個可用)")
        wf[ck_id]["inputs"]["ckpt_name"] = ckpt

    lora_id = find_node(wf, "LORA")
    if lora_id:
        lora = args.lora
        if not lora:
            avail = list_models(args.host, "LoraLoader", "lora_name")
            if not avail:
                print("✗ 這份 workflow 要 LoRA,但 ComfyUI 說 models/loras 是空的")
                return 1
            lora = avail[0]
            print(f"  未指定 --lora,自動使用:{lora}(共 {len(avail)} 個可用)")
        wf[lora_id]["inputs"]["lora_name"] = lora

    # 2) 覆寫提示詞/種子(伺服器端之後也是走這個 title 契約)
    if args.prompt:
        pos = find_node(wf, "POSITIVE")
        if pos:
            wf[pos]["inputs"]["text"] = args.prompt
    if args.seed is not None:
        sam = find_node(wf, "SAMPLER")
        if sam:
            wf[sam]["inputs"]["seed"] = args.seed

    # 3) 下單
    client_id = str(uuid.uuid4())
    try:
        r = api(args.host, "/prompt", {"prompt": wf, "client_id": client_id})
    except urllib.error.HTTPError as e:
        print("✗ ComfyUI 退件(workflow 有問題):")
        print(e.read().decode(errors="replace")[:2000])
        return 1
    pid = r["prompt_id"]
    print(f"✓ 已下單 prompt_id={pid},等出圖……")

    # 4) 輪詢 /history 直到這筆有結果
    t0 = time.time()
    images = []
    while time.time() - t0 < 600:
        time.sleep(2)
        try:
            hist = api(args.host, f"/history/{pid}")
        except Exception:
            continue
        entry = hist.get(pid)
        if not entry:
            print(f"  生成中… {int(time.time() - t0)}s", end="\r")
            continue
        status = entry.get("status", {})
        if status.get("status_str") == "error" or status.get("completed") is False:
            print("\n✗ 生成失敗,ComfyUI 回報:")
            print(json.dumps(status, ensure_ascii=False, indent=1)[:2000])
            return 1
        for out in (entry.get("outputs") or {}).values():
            images += out.get("images", [])
        if images:
            break
    if not images:
        print("\n✗ 逾時或沒有輸出圖片")
        return 1

    # 5) 抓圖回來
    img = images[0]
    q = urllib.parse.urlencode({
        "filename": img["filename"],
        "subfolder": img.get("subfolder", ""),
        "type": img.get("type", "output"),
    })
    with urllib.request.urlopen(args.host.rstrip("/") + "/view?" + q, timeout=TIMEOUT) as r:
        data = r.read()
    Path(args.out).write_bytes(data)
    print(f"\n✓ 完成({int(time.time() - t0)}s):{args.out}({len(data) // 1024} KB)")
    print(f"  Windows 上的原檔:ComfyUI\\output\\{img.get('subfolder', '')}\\{img['filename']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
