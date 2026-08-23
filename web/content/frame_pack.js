/** 圖組模組：很多組，每組四張（檔名 1～4）。 */

const API = "/api/frame-packs";

async function _json(path, method = "GET", body) {
  const r = await fetch(path, {
    method,
    headers: body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {},
    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = data && data.detail;
    const msg = typeof d === "string"
      ? d
      : (Array.isArray(d) ? d.map(x => x.msg || JSON.stringify(x)).join("；") : (d ? JSON.stringify(d) : "HTTP " + r.status));
    throw new Error(msg);
  }
  return data;
}

export function packFrameUrls(pack) {
  const frames = (pack && pack.frames) || {};
  return [1, 2, 3, 4].map(i => (frames[String(i)] || {}).url || "");
}

export async function listPacks(pose) {
  const q = pose ? "?pose=" + encodeURIComponent(pose) : "";
  const j = await _json(API + q);
  return j.packs || [];
}

export async function createPack(files, { name, pose } = {}) {
  const fd = new FormData();
  if (name) fd.append("name", name);
  if (pose) fd.append("pose", pose);
  for (const f of files) fd.append("files", f, f.name || "bone.png");
  const j = await _json(API, "POST", fd);
  return j.pack;
}

export async function renamePack(id, name) {
  const j = await _json(API + "/" + encodeURIComponent(id), "PATCH", { name });
  return j.pack;
}

export async function deletePack(id) {
  await _json(API + "/" + encodeURIComponent(id), "DELETE");
}
