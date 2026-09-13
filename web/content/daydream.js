/** 發呆時段：四個鐘點起預產立繪／表情／做愛動畫／劇本圖。 */

import { SEX_ANIM_POSES } from "./sex_anim.js";
import {
  normalizeData, kindScenes, KIND_ZH, SCENE_ZH,
  matchPackByText, resolveScriptKind,
} from "./script_mode.js";

export const SLOTS = [
  { id: "morning", label: "早上", h: 6, m: 0 },
  { id: "afternoon", label: "下午", h: 14, m: 0 },
  { id: "evening", label: "晚上", h: 19, m: 0 },
  { id: "night", label: "深夜", h: 3, m: 0 },
];

function hm(h, m) {
  return h * 60 + m;
}

/** 現在落在哪一個發呆窗（窗從該鐘點開到下一窗）。 */
export function currentSlot(d = new Date()) {
  const now = d.getHours() * 60 + d.getMinutes();
  const starts = SLOTS.map(s => ({ ...s, min: hm(s.h, s.m) }))
    .sort((a, b) => a.min - b.min);
  let hit = starts[starts.length - 1];
  for (const s of starts) {
    if (now >= s.min) hit = s;
  }
  return hit;
}

/** 這一窗的唯一戳：跨日的深夜／晚上不會跟隔日撞。 */
export function slotStamp(d = new Date()) {
  const slot = currentSlot(d);
  const now = d.getHours() * 60 + d.getMinutes();
  const startMin = hm(slot.h, slot.m);
  const day = new Date(d.getTime());
  if (now < startMin) day.setDate(day.getDate() - 1);
  const y = day.getFullYear();
  const mo = String(day.getMonth() + 1).padStart(2, "0");
  const da = String(day.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}-${slot.id}`;
}

export function slotLabel(id) {
  return (SLOTS.find(s => s.id === id) || currentSlot()).label;
}

export const EMOTION_KEYS = ["xi", "nu", "ai", "le", "xiu"];

export function sexPoses() {
  return SEX_ANIM_POSES.map(p => ({ id: p.id, label: p.label }));
}

export function listScriptJobs(data) {
  const d = normalizeData(data || {});
  const out = [];
  for (const p of d.packs) {
    for (const n of kindScenes(p.kind)) {
      const spec = p.scenes?.[String(n)];
      if (!spec) continue;
      out.push({
        pack: p,
        packId: p.id,
        packName: p.name,
        kind: p.kind,
        scene: n,
        spec,
        slots: spec.slots || [],
        label: `${KIND_ZH[p.kind] || p.kind}「${p.name}」${SCENE_ZH[n] || ("場景" + n)}`,
      });
    }
  }
  return out;
}

export function sexAnimReady(girl, poseId) {
  const rec = girl?.sexAnim?.[poseId];
  const urls = rec?.urls;
  return Array.isArray(urls) && urls.filter(Boolean).length >= 4;
}

export function scriptSceneReady(girl, packId, scene, want) {
  const rec = girl?.scriptArt?.[packId]?.[String(scene)];
  const urls = rec?.urls;
  const n = Math.max(1, Number(want) || 1);
  return Array.isArray(urls) && urls.filter(Boolean).length >= n;
}

export function collectScriptUrls(girl, packId) {
  const art = girl?.scriptArt?.[packId];
  if (!art || typeof art !== "object") return [];
  const urls = [];
  for (const rec of Object.values(art)) {
    for (const u of rec?.urls || []) {
      if (u) urls.push(u);
    }
  }
  return urls;
}

export function collectSexAnimUrls(girl) {
  const all = [];
  for (const rec of Object.values(girl?.sexAnim || {})) {
    for (const u of rec?.urls || []) {
      if (u) all.push(u);
    }
  }
  return all;
}

/** 猥褻／前戲／正戲用的發呆圖：先對劇本關鍵詞，再退回該 kind，做愛再退局部動畫。 */
export function lewdUrls(girl, { packs, kind, text } = {}) {
  if (!girl) return [];
  const data = packs && typeof packs === "object" ? packs : { packs: [] };
  const seen = new Set();
  const out = [];
  const push = (list) => {
    for (const u of list || []) {
      if (u && !seen.has(u)) { seen.add(u); out.push(u); }
    }
  };
  if (text) {
    const hit = matchPackByText(data, text);
    if (hit) push(collectScriptUrls(girl, hit.id));
  }
  const k = resolveScriptKind(kind || "tease");
  for (const p of data.packs || []) {
    if (resolveScriptKind(p.kind) !== k) continue;
    push(collectScriptUrls(girl, p.id));
  }
  if (k === "oral") {
    for (const p of data.packs || []) {
      if (resolveScriptKind(p.kind) !== "tease") continue;
      push(collectScriptUrls(girl, p.id));
    }
  }
  if (k === "sex") push(collectSexAnimUrls(girl));
  return out;
}

export function pickLewdUrl(girl, opts = {}, cursor = 0) {
  const urls = lewdUrls(girl, opts);
  if (!urls.length) return "";
  const i = ((Number(cursor) || 0) % urls.length + urls.length) % urls.length;
  return urls[i];
}
