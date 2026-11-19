// node tests/wifepay_wipe.test.mjs — 門縫拉開幾何（web/content/wifepay_reveal.js）
import assert from "node:assert/strict";
import { peekSlotLayout, fracValue } from "../web/content/wifepay_reveal.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

const base = { doorW: 400, doorH: 800, imgW: 832, imgH: 1216, frac: "1/2" };

t("1/2 與 3/5 比例", () => {
  assert.equal(fracValue("1/2"), 0.5);
  assert.equal(fracValue("3/5"), 0.6);
});

t("左側：左緣固定，寬度往右長", () => {
  const closed = peekSlotLayout({ ...base, side: "left", open: 0 });
  const mid = peekSlotLayout({ ...base, side: "left", open: 0.5 });
  const open = peekSlotLayout({ ...base, side: "left", open: 1 });
  assert.equal(closed.cur, 0);
  assert.equal(closed.left, open.slotLeft);
  assert.equal(mid.left, open.slotLeft);
  assert.ok(Math.abs(mid.cur - open.vis * 0.5) < 1e-6);
  assert.equal(open.cur, open.vis);
  assert.equal(open.left, open.slotLeft);
  assert.equal(open.imgLeft, 0);
  assert.ok(open.vis < open.fullW);
});

t("右側：右緣固定，寬度往左長", () => {
  const closed = peekSlotLayout({ ...base, side: "right", open: 0 });
  const mid = peekSlotLayout({ ...base, side: "right", open: 0.5 });
  const open = peekSlotLayout({ ...base, side: "right", open: 1 });
  const rightEdge = open.slotLeft + open.vis;
  assert.equal(closed.cur, 0);
  assert.ok(Math.abs(closed.left - rightEdge) < 1e-6);
  assert.ok(Math.abs(mid.left + mid.cur - rightEdge) < 1e-6);
  assert.ok(Math.abs(open.left - open.slotLeft) < 1e-6);
  assert.equal(open.cur, open.vis);
  assert.ok(Math.abs(open.imgLeft - (open.vis - open.fullW)) < 1e-6);
});

t("3/5 比 1/2 更寬，同一邊右緣或左緣仍對齊", () => {
  const a = peekSlotLayout({ ...base, side: "right", frac: "1/2", open: 1 });
  const b = peekSlotLayout({ ...base, side: "right", frac: "3/5", open: 1 });
  assert.ok(b.vis > a.vis);
  const a0 = peekSlotLayout({ ...base, side: "left", frac: "3/5", open: 0 });
  const a1 = peekSlotLayout({ ...base, side: "left", frac: "3/5", open: 1 });
  assert.equal(a0.left, a1.left);
});

console.log(`wifepay_wipe.test: ${n} ok`);
