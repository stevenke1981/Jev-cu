---
name: jev-use
description: Use Jev target/action/done/risk decisions with GPT and official desktop Computer Use, including Windows sky. Read host tool docs; inspect each Windows proposal before a separate action call.
---

# GPT + 官方 Computer Use 四問 Harness

專案：`{{REPO_DIR}}`。GPT 是唯一主 Agent。此 Skill 不啟動桌面伺服器、其他代理或外部執行模型；必須在真正的 ChatGPT 桌面官方 Computer Use 會話中使用。

## 準備

先讀取當次官方 Computer Use Skill／工具文件並確認目標 App 授權。不要更動官方插件檔案或主機安全設定。Windows 按官方文件在 `node_repl` 匯入 `@oai/sky`，再匯入本專案；提供 `sky` 給入口。提供舊官方 App 介面的環境則傳入真實 `cua`。兩者擇一，不偽造物件、不安裝其他後端、不用一般 Node 代替桌面 runtime。用法見 [runtime.md](references/runtime.md)。

## 八步

1. GPT 指定單一目標、App、操作參數、限制與可觀察成功判據。先 dry-run；真實步驟須在使用者授權範圍內。
2. 在官方 runtime 呼叫 `runChatGPTTask`。它從真實 cua App 或 Windows `sky.get_window_state` 讀完整文字樹；Windows 直接保留 `accessibility.tree` 的原始編號與內容。已有 verify 時先驗收，已完成就不再操作。
3. `parseAX` 解析索引／角色／標籤，`selectCandidates` 按角色和目標相關度保留最多 40 個。少於 2 個只重讀一次，仍不足就 escalate，不捏造元素。
4. 建立精簡 state：context 1500 字元、候選描述120字元；不傳截圖。舊 cua 迴圈保留近期6筆動作；Windows 各次單步獨立，GPT 以 plan/constraints 提供必要進度。
5. Jev 回 `target`、`action`、`done`、`risk`；target 回應另含 confidence。不是 approve/risk 或 ALLOW/DENY reviewer。
6. 本地 `normalizeDecision/evaluatePolicy` 判斷目標、App、敏感字及原有機率門檻。不可把 done 的0.9當成核准門檻，或把模型缺失分數補成通過。
7. proceed 且 dryRun=false 才能執行。Windows 先回 `awaiting_review`：輸出並檢視 observation/planned，下一個工具呼叫才 `executeWindowsStep(proposal)`。不可將兩個呼叫放在同一 cell／迴圈，且不得重建或修改 proposal。dry-run 不產生可執行提案。GPT 提供明確 text/key；輸入文字需觀察焦點與目標一致。座標／拖曳／Windows 捲動需交回 GPT 使用官方工具單獨處理。
8. 一次動作後立即重讀完整文字樹並驗收。Windows `step_complete` 只代表該步已執行並讀回，不代表任務完成；只有 verify 通過才有 `done/verified:true`。繼續時重新呼叫準備入口，不能重用舊 proposal。

預設 dryRun=true。Windows 每次只準備1步（maxSteps 省略或設1），提案只能用一次，兩分鐘後過期；期間有其他工具操作、人工操作、視窗／焦點改變時重新準備。舊 cua 迴圈上限30步。實際工具超時必須容納該次有界工作，不准宣稱工具結束後仍於背景繼續。`confirm/escalate/stop/error/max_steps` 都交回同一 GPT，不能換代理、降低門檻或盲目重播。沒有 verify 的 done 仍須 GPT 核驗。兩次相同動作無有效進展時停止並重規劃。

## 不同介面／視覺工作

只有視窗、沒有候選時，先交回 GPT。GPT 可在同一官方 Computer Use 中看圖及依其真實工具文件操作，但那是 GPT 接管，不算這次 AX-only Jev 迴圈成功。不得加入自製 UIA、SendInput、Python、OCR、瀏覽器 bridge 或其他代理。

## 設定與使用

Jev 固定預設 OpenRouter `typesafe/jev-1.13`。金鑰由程式依序讀取環境變數 `OPENROUTER_API_KEY`、專案 `.env.local`、本機 `{{CONFIG_ENV_FILE}}`（原始模板對應 `~/.agents/jev-cu/.env`）。安裝器從專案 `.env.local` 匯入該單一金鑰；已有設定預設保留。不要將金鑰放進 Skill、對話或日誌；不要為檢查存在而印出檔案內容。`doctor` 的 `keyConfigured` 只代表可讀取，不代表有效；`keyValidated:false` 與 `networkTested:false` 表示未測試。`EACCES/EPERM` 是連線權限錯誤，不能推斷金鑰無效，也不得繞過宿主限制。執行範例見 [runtime.md](references/runtime.md)。安裝後重開桌面工作階段；若本機 Skill 不可被當前模式發現，讓 GPT 在已開啟的本機專案讀此文件，不改用其他模式／代理冒充支援。
