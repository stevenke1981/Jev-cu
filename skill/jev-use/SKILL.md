---
name: jev-use
description: Use the original Jev target/action/done/risk harness with GPT in ChatGPT desktop and the official Computer Use plugin only. No alternate agents or desktop drivers. Read current host tool docs before execution.
---

# GPT + 官方 Computer Use 四問 Harness

專案：`{{REPO_DIR}}`。GPT 是唯一主 Agent。此 Skill 不啟動桌面伺服器、其他代理或外部執行模型；必須在真正的 ChatGPT 桌面官方 Computer Use 會話中使用。

## 準備

先讀取當次官方 Computer Use Skill／工具文件並確認目標 App 授權。不要更動官方插件檔案或主機安全設定。按官方文件先做一個入口呼叫取得使用說明，再在後續呼叫匯入本專案。舊版 `cua.getApp()` 和 `getAXState()` 範例不是跨版本 API 保證；未提供該方法即停止，不能偽造 global cua、安裝其他後端或用一般 Node 代替桌面 runtime。

## 八步

1. GPT 指定單一目標、App、操作參數、限制與可觀察成功判據。先 dry-run；真實步驟須在使用者授權範圍內。
2. 在官方 runtime 呼叫 `runChatGPTTask`。它從真實 cua App 讀完整 AX。已有 verify 時先驗收，已完成就不再操作。
3. `parseAX` 解析索引／角色／標籤，`selectCandidates` 按角色和目標相關度保留最多 40 個。少於 2 個只重讀一次，仍不足就 escalate，不捏造元素。
4. 建立精簡 state：context 1500 字元、候選描述120字元、近期6筆動作；不傳截圖。
5. Jev 回 `target`、`action`、`done`、`risk`；target 回應另含 confidence。不是 approve/risk 或 ALLOW/DENY reviewer。
6. 本地 `normalizeDecision/evaluatePolicy` 判斷目標、App、敏感字及原有機率門檻。不可把 done 的0.9當成核准門檻，或把模型缺失分數補成通過。
7. proceed 且 dryRun=false 才由 harness 呼叫官方 App 工具。GPT 提供明確 text/key/direction；不接受自製 driver。座標／拖曳及 resources.at 需交回 GPT 使用官方工具單獨處理，不用文字候選假審查。
8. 重新讀完整 AX、記錄結果與 recentActions；未完成且還有步數才繼續。結束後 GPT 負責最終驗收。

預設最多30步、dryRun=true；實際工具超時必須容納該次有界工作，不准宣稱在工具結束後仍於背景繼續。`confirm/escalate/stop/error/max_steps` 都交回同一 GPT，不能換代理、降低門檻或盲目重播。沒有 verify 的 done 仍須 GPT 核驗。兩次相同動作無有效進展時 GPT 應停止並重規劃；這是宿主操作規則，不宣稱舊核心已有完整偵測器。

## 不同介面／視覺工作

只有視窗、沒有候選時，先交回 GPT。GPT 可在同一官方 Computer Use 中看圖及依其真實工具文件操作，但那是 GPT 接管，不算這次 AX-only Jev 迴圈成功。不得加入自製 UIA、SendInput、Python、OCR、瀏覽器 bridge 或其他代理。

## 設定與使用

Jev 固定預設 OpenRouter `typesafe/jev-1.13`；`OPENROUTER_API_KEY` 來自環境或專案 `.env.local`。只檢查存在，不顯示值。執行範例見 [runtime.md](references/runtime.md)。安裝後重開桌面工作階段；若本機 Skill 不可被當前模式發現，讓 GPT 在已開啟的本機專案讀此文件，不改用其他模式／代理冒充支援。
