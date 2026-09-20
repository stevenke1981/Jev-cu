# 圖片到程式對照

依據對話中的 `Jev-cu-macOS-original-harness-corrected.png` 校正版，而非之前誤用 ALLOW/DENY 的兩張圖。

| 圖中階段 | 本版落點 |
|---|---|
| 1 主 Agent 規劃 | GPT / runChatGPTTask 的 goal, appName, resources, plan, constraints, verify |
| 2 讀完整 AX | chatgpt-driver.mjs -> 官方 cua；windows-driver.mjs -> 官方 sky.get_window_state 的 accessibility.tree |
| 3 候選 | 原 loop.mjs 的 parseAX/selectCandidates；<=40 |
| 4 精簡文字 | 原 jev-decide.mjs 的 decide/buildQuestions/sanitizeLabel |
| 5 四問 | target/action/done/risk；confidence 屬 target，不是 approve |
| 6 本地 Policy | 原 policy.mjs，門檻沒有降低 |
| 7 官方工具執行 | cua 沿用 runTask；Windows 先 prepareWindowsStep，GPT 檢視後在另一個工具呼叫 executeWindowsStep；dry-run 不執行 |
| 8 新 AX 與驗收 | 每次動作後立即重讀；verify 通過才有 verified:true。Windows 單步完成不等於整體完成 |

原 loop.mjs、policy.mjs、jev-decide.mjs 與原36項測試保留，供對照原始設計。底層歷史註解中的 Codex/cua_repl 是來源用語，不代表本版要求啟動額外 Codex CLI 代理。

新增的專案邊界：只用 GPT 桌面入口；不接受替換 driver／模型／門檻；缺官方方法即停；缺明確文字或按鍵即停；禁止 resources.at 覆蓋已選 AX 元素。圖片中的座標／畫布本来就需要 Planner 提供資料，本版將其交回 GPT 使用官方工具另行處理，不把未綁定座標硬塞进文字候選迴圈。

這是主控及操作路徑收斂，不是把 Windows 二元 reviewer 調低門檻。Jev-cu 刪除自製 windows/ 與 vendor workflow；Jev-ocu 不變。
