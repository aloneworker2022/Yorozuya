// 旅館房間流程（rental_session.js）：第一段接吻、相鄰不重複、每段內射、平均約 3 段（1/3 結束）。
import { planSession, stateAt, sessionResult, ACTION_MS } from "../web/content/rental_session.js";
let lens=[], bad=0;
for (let i=0;i<20000;i++){ const s=planSession(Math.random,0); lens.push(s.acts.length-1);
  if (s.acts[0].pose!=="kiss") bad++; for(let j=2;j<s.acts.length;j++) if (s.acts[j].loc===s.acts[j-1].loc&&s.acts[j].pose===s.acts[j-1].pose) bad++;
  const r=sessionResult(s); if (r.creampies!==s.acts.length-1) bad++; }
console.log("mean sex acts", lens.reduce((a,b)=>a+b)/lens.length, "bad", bad, "ACTION_MS", ACTION_MS);
const s=planSession(Math.random,0); console.log(stateAt(s,ACTION_MS*1.5).act, stateAt(s,ACTION_MS*99).done);
if (bad) { console.error("FAIL"); process.exit(1); }
