# AGENTS.md — 給 AI coding agent

**先讀 [`docs/PLAN-2026-10.md`](docs/PLAN-2026-10.md)**：現行企劃書、唯一真相（系統現況、退役旗標、房間 11 階、個性揭露表、開發慣例、待問使用者清單）。之後依 [`docs/AI-READING-ORDER.md`](docs/AI-READING-ORDER.md) 開頭的「現行閱讀順序」。

必守：

1. 主分支 `grok-2026.10`；先 `git pull`；使用者的程式是權威；**不要 force push**；`grok-telephon`、`claude/*` 已過時，不要動也不要合併。
2. 改 `web/` 的 JS → bump `web/index.html`／`web/test_room.html` 的 `?v=` 與 `web/sw.js` 的 `CACHE`。
3. 改 `server/*.py` → 告訴使用者要重啟 uvicorn。
4. 房間 11 階（`s.roomStage`）是關係唯一真相；寫階段一律經過 `normalizeGirlStage`；不要把細階直接塞進 `s.stage`。
5. 退役系統（`MAIN_DECAY_ON`／`NTR_ON`／`SUMMONER_ON`／`SUMMONER_ENABLED`／`CRAVE_ON`）只用旗標關閉，不要擅自打開或刪大段程式；性慾 `libido` 與忠誠 `loyalty` 保留。
6. 在手機尺寸（mobile UA）驗證，看 console；驗證過再 commit＋push 到 `origin/grok-2026.10`。
7. 「老公」只限妻子以上；性癖在愛人揭露。
8. 不確定的設計問使用者（PLAN §14），不要自己決定。
