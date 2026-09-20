# 安裝後疑難排解與實機紀錄

本文件整理 2026-09-20 在 Codex 桌面版、Windows 繁體中文小畫家的實際問題與處理結果。專案版本為 v0.6.0；文件更新不改變執行程式版本。介面與權限仍以當次宿主官方工具文件為準。

## 最新驗證結果

- v0.5.0 加入官方 Windows `@oai/sky` 介面支援；v0.6.0 修正繁體中文控制項解析，並加入安裝後可讀取的金鑰設定。
- 原有 87 項離線測試通過。這些是 mock／本機測試，不等於實際模型或桌面驗收。
- 宿主允許網路、更新並同步 API Key 後，實際 Jev Decisions API 回傳 HTTP 200。
- Jev 選取小畫家「最大化」；GPT 檢視提案，再於另一個工具呼叫執行，官方工具回傳 `step_complete` 並重新觀察最大化後的視窗。這是一個真實模型決策與桌面動作的成功紀錄。
- 畫布座標操作由 GPT 透過同一官方 Computer Use 接管。使用者按實體 Escape 後停止，繪圖尚未完成儲存；沒有已完成的 PNG 交付。不可將單步成功或部分繪圖報成完整任務成功。

## 依錯誤判斷問題層級

| 現象 | 本次判定／應檢查項目 | 處理方式 |
| --- | --- | --- |
| Windows 沒有 `cua.getApp()` 或 App.`getAXState()` | 原本的 App 介面與此次 Windows 官方工具介面不同 | 使用 v0.5.0 以上的 `sky` 入口；先讀當次官方文件 |
| 小畫家有控制項，但候選不足 | 原解析器未涵蓋此次繁體中文 AX 角色 | 更新到 v0.6.0；保留官方元素編號、排除停用控制項 |
| 找不到 `OPENROUTER_API_KEY` | 未設定，或只更新了不在讀取順序內的檔案 | 檢查專案 `.env.local` 與安裝後的本機設定 |
| 已換 Key 卻仍使用舊設定 | 環境變數或專案設定優先於安裝後設定；安裝器預設保留舊 Key | 同步正確來源，使用 `--update-key`，檢查較高優先序的值 |
| `EACCES`／`EPERM`／`NETWORK_ACCESS_DENIED`，未收到 HTTP 回應 | 連線被本機執行環境拒絕；本次證據指向網路沙箱 | 由使用者調整宿主允許的網路權限，再於原 runtime 重試 |
| HTTP 404，表示無可用端點 | 只看狀態碼無法判定模型不存在；本次完整回應指出 guardrail | 查看去除敏感資訊後的錯誤內容，核對該 Key 所屬的限制 |
| `keyConfigured:true` | 只表示可讀到非空 Key | 另做實際 API 驗證，不能當作連線／模型成功 |
| `step_complete` | 一個動作已執行並重新觀察 | 繼續檢查任務的驗收條件；不等於整個任務完成 |
| 實體 Escape 中止 Computer Use | 使用者停止桌面操作 | 立即停止，不在同一輪繼續呼叫桌面工具 |

## Windows 介面與繁體中文控制項

最初的不相容是工具介面差異，不是只要升級 Node.js 或重新填 Key 就能解決。原入口使用 `cua.getApp()` 和 App.`getAXState()`；此次 Windows 宿主提供官方 `@oai/sky` 的 `list_apps()`、`get_window_state()` 等方法。

v0.5.0 新增 Windows adapter。用 `runChatGPTTask({ sky, ... })` 準備一步，輸出並檢視 observation／planned 後，才在下一個工具呼叫執行 `executeWindowsStep(proposal)`。不可在同一 cell 或自動迴圈內準備並執行；不得自行建立假 runtime 或改裝其他桌面驅動。範例見 [runtime.md](../skill/jev-use/references/runtime.md)。

接著發現繁體中文小畫家的 AX 角色無法充分產生候選。v0.6.0 加入此次觀察到的中文角色、停用狀態辨識與中文文字上下文，保留原始元素編號。修正後可產生候選，並在後續成功選取「最大化」。這不代表所有語系和應用都已測過。

## API Key 應放在哪裡

專案提供 [`.env.example`](../.env.example) 作為空白模板。真實金鑰放在 `.env.local`，安裝時匯入 `%USERPROFILE%\.agents\jev-cu\.env`；不要將金鑰寫入模板、README、Skill、對話或 Git。

首次設定：

1. 將 `.env.example` 複製成 `.env.local`，在本機編輯器填入 `OPENROUTER_API_KEY`。
2. 在專案目錄執行 `npm run install-skill -- --force`。
3. 執行 `npm run doctor`，確認本機配置；再由官方工具 runtime 做實際 Jev 請求。

安裝後輪替金鑰：先更新專案 `.env.local`，再執行：

```powershell
npm run install-skill -- --force --update-key
npm run doctor
```

`--force` 只允許替換 Skill，**不會自行覆寫已有金鑰**。`--update-key` 才會將專案 `.env.local` 的 Key 匯入本機設定；沒有有效的來源值時會報錯。設定檔位於 Skill 及其備份之外。

執行時的讀取順序：

1. 目前執行程序的 `OPENROUTER_API_KEY` 環境變數。
2. 本專案根目錄 `.env.local`。
3. `%USERPROFILE%\.agents\jev-cu\.env`。

`%USERPROFILE%\.openrouter\.env` **不在預設讀取清單內**。本次使用者在該檔案更新 Key，之後另外同步到專案與安裝後設定，才確保 Jev 使用新值。只修改該外部檔案不會自動更新 Jev。

若只修改第 3 項，第 1、2 項的舊值仍可能優先生效。請在本機核對來源，不輸出 Key；若修改的是程序環境變數，需依宿主方式讓執行程序取得新環境。`.env.local` 與本機設定由 `loadApiKey()` 呼叫時讀取；已由呼叫端另存於變數的 Key 則須重新載入。

`doctor` 的 `keyConfigured:true` 只表示找到非空字串。`keyValidated:false`、`networkTested:false` 表示 **doctor 沒有進行這兩項測試**，不是在宣告金鑰失效。普通 Node 終端也不能藉此證明官方桌面 runtime 可用。

## EACCES：本次是網路沙箱，不是 API Key 驗證失敗

本次觀察到的證據：

- DNS 可以解析。
- 官方 runtime 與受限命令環境對 OpenRouter 和另一個公開網站的 HTTPS 連線，均在 `connect` 階段出現 `EACCES`。
- 受限環境包含 `CODEX_SANDBOX_NETWORK_DISABLED=1`。
- 經核准在沙箱外對同一個 OpenRouter 首頁發出不帶 Key 的 HEAD 請求，收到 HTTP 200。

這些對照支持「此次是執行環境網路限制」的結論。由於請求尚未收到 HTTP 回應，不能把 `EACCES` 解讀為 OpenRouter 拒絕 Key。其他環境中的 `EACCES` 也可能涉及本機防火牆或權限；需依實際證據判斷。

處理方式是由使用者透過宿主提供的權限設定允許該工作階段連線，再回原官方 runtime 重試。本次宿主後續顯示網路已啟用，重試才收到 OpenRouter 的 HTTP 回應。不同桌面版本的設定入口可能不同；不應為了排除此錯誤就擅自關閉所有沙箱保護，也不應改走代理、瀏覽器或其他通道繞過原限制。

不帶 Key 的 HEAD 200 只證明該測試環境可以連到網站，無法證明 Jev 模型、Key 或官方 runtime 已可用。最後仍要在真正執行 Jev 的 runtime 呼叫 Decisions API；此步可能產生費用。若使用者要求「仍被擋就停止」，遇到拒絕應停止並回報。

## HTTP 404：模型存在，但該次請求被 guardrail 排除

網路恢復後，請求使用專案預設模型 `typesafe/jev-1.13` 與 `https://openrouter.ai/api/alpha/decisions`，仍收到 HTTP 404，訊息表示模型限制或資料政策下沒有可用端點。

本次取得較完整的回應後，找到明確原因：

```text
Model blocked by guardrail: 1 endpoint excluded
```

回應同時指向 [OpenRouter 工作區 guardrails](https://openrouter.ai/workspaces/default/guardrails)。這是此次回應的診斷線索；單憑通用的「無可用端點」不能斷定模型已下架，也不能斷定一定是資料記錄／隱私設定。

請在 OpenRouter 核對 **實際使用 Key 對應的帳號／工作區** 與適用的 guardrail，而非只看瀏覽器中另一個已登入的設定頁。由使用者依需求調整自己的存取設定或提供合適的 Key；不要由代理擅自放寬資料政策、本地 Policy 或替換模型來避開限制。

本次重新嘗試仍被擋後，使用者更換 Key；同步到 Jev 的來源並確認生效後，實際 Decisions 請求回傳 HTTP 200，後續小畫家最大化步驟也成功。這證明新 Key 在當時可用，但未取得 OpenRouter 的完整設定差異，不能進一步宣稱究竟是哪一條 guardrail 或帳號差異造成新舊 Key 結果不同。

目前 `scripts/jev-decide.mjs` 會遮蔽 Key 並將錯誤訊息截成 200 字元。本次重要的 guardrail 原因位於較後段，只看短訊息容易漏掉。診斷時應在本機檢查相關錯誤欄位並去除敏感資訊；不要公開 Authorization header、完整金鑰或包含私人任務的原始請求。這次只補文件，未改變錯誤截斷實作。

## 小畫家操作與停止規則

Jev 適合從 AX 候選中選取按鈕；畫布沒有足夠文字元素描述筆畫位置。此次畫布拖曳由 GPT 讀取實際截圖後，透過同一官方工具接管，不是 Jev 自動產生座標，也沒有使用自製繪圖或輸入驅動。

本次繪圖中遇到的操作問題與修正：

- 新建圖形仍可能處於待確認狀態；此時修改顏色可能改到目前圖形。先在已觀察到的畫布空白處點擊、確認圖形已固定，再畫下一個。
- 從選取框或控制點開始拖曳，可能變成移動／縮放原圖形。逐步檢查截圖；畫錯時用小畫家復原，再重新觀察後重畫。
- 前景色與背景色會影響輪廓／填滿；本次可用右鍵點選色盤設定背景色。必須以當次畫面確認目前選中的色彩與形狀工具，不能只記固定座標。
- 實體 Escape 會讓官方工具中止 Computer Use。收到停止訊息後立即停止，回報哪些步驟已完成、檔案是否已儲存；不可同一輪改用別的工具繼續。

每個動作後重新觀察。若畫面被使用者或其他操作改變，重新準備 Jev 提案；不要重播舊元素編號或過期提案。保存圖片後還需確認實際檔案存在，才能宣告圖片交付完成。

## 更新 GitHub 時的提交身分

這次文件更新時，遠端 `fetch` 已成功，但 `git commit` 回報 `Author identity unknown`。這表示 Git 缺少提交作者設定，不是 GitHub 登入失效；遠端存取授權與本機提交作者是兩件事。

本次核對先前三筆提交使用的 GitHub noreply 身分後，以單次 `git -c user.name=... -c user.email=... commit` 指定同一身分，沒有修改全域設定。其他使用者應使用自己的姓名與已確認的電子郵件；不要直接複製別人的作者身分。若希望之後持續使用，可自行設定 repository-local 的 `user.name`／`user.email`。

## 相關文件

- [README：安裝、限制與版本](../README.md)
- [官方工具 runtime 使用範例](../skill/jev-use/references/runtime.md)
- [原有四問工作流程](WORKFLOW.md)
