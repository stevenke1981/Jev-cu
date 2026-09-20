# Jev-cu v0.3.0

**新增原生 Windows Computer Use**，保留原有 macOS Codex AX 流程與 OpenRouter Jev 1.13 串接。Windows 不需要 `cua_repl`，可由 Codex、Pi、AGY / Antigravity、OpenCode 或其他本機 MCP Agent 使用。

Windows 路徑採用 **主 Agent 控制、Jev 只審查**：

```text
主 Agent 觀察 Windows UIA／截圖 → 提出完整動作
    → Jev ALLOW／DENY（不執行）
    → 主 Agent 明確呼叫執行一次 → 重新觀察與驗收
```

## Windows 開始使用

需要 Windows 10/11、原生 Windows Node.js 22+、內建 Windows PowerShell 5.1 / .NET Framework。不是 WSL 的 Linux Node；無需 Python 或額外 npm 套件。

```powershell
git clone https://github.com/stevenke1981/Jev-cu.git
cd Jev-cu
npm run windows:doctor
node windows/cli.mjs list
```

已有 clone 時，先確認在 `main` 再 `git pull --ff-only origin main`。

在專案根目錄 `.env.local` 填入自己的 OpenRouter key，不要提交 Git，也不要覆蓋其他既有設定：

```dotenv
OPENROUTER_API_KEY=你的OpenRouter金鑰
```

環境變數優先。預設模型固定 `typesafe/jev-1.13`，API 是 `POST https://openrouter.ai/api/alpha/decisions`，使用 `state/questions`，不是 Chat Completions 的 `messages`。不沿用舊 `TYPESAFE_API_KEY`，不自動改用其他模型。金鑰不傳给原生 Windows worker。

### 各 Agent

```powershell
# Codex
node windows/install.mjs codex
node windows/cli.mjs config codex

# AGY IDE（AGY CLI 的 Skill 安裝改用 agy-cli）
node windows/install.mjs agy
node windows/cli.mjs config agy

# OpenCode
node windows/install.mjs opencode
node windows/cli.mjs config opencode

# Pi：原生 Extension 與 Skill；安裝後 /reload 或重開會話
node windows/install.mjs pi
```

只執行要使用的宿主。MCP 的 `config` 輸出使用 Node 與專案絕對路徑；將 **jev-windows 條目**合併至既有設定，不能整份覆蓋。Windows installer 預設不覆寫，更新加 `--force` 會先備份；舊 Pi 的 TypeBox 可用 `--legacy`。搬動 repository 後需重新產生設定／loader。

Jev-cu 與 Jev-ocu 都內含相同 Windows companion；**同一宿主只載入其中一份**，不要重複註冊或同時控制電腦。獨立 worker 使用隱藏子程序，不另外開啟 PowerShell 終端；沒有新增 GUI app。

## Windows 功能

`windows_info`、`windows_list`、`windows_observe`、`windows_screenshot`、`windows_review`、`windows_execute`、`windows_stop`。

實作原生 UIA 視窗／元件讀取、文字值與狀態、PNG 截圖、Invoke、Value、Toggle、Select、ScrollPattern、實體點擊、Unicode 文字、有限按鍵、聚焦、等待及有截圖雜湊驗證的座標點擊／拖曳。使用 DPI 實體螢幕座標，包括負的多螢幕原點；不是 CSS 或縮小預覽圖片座標。

預設執行工具只做 dry-run；真實操作必須指定 `dryRun:false` 與該精確動作的 `reviewId`。Jev 核准不會自動產生滑鼠鍵盤動作。快照／核准最多 60 秒，執行前在 Windows worker 重新核對狀態；嘗試後消耗，不自動重播。模型錯誤、未核准、狀態改變或逾時均不放行；動作途中出錯可能回 `executed:"unknown"`，需先觀察。

截圖回給主 Agent，不送進 Jev；UIA 文字及動作文字仍會經 OpenRouter 傳到模型，必須事先縮小資料範圍。沒有自動 OCR、OmniParser 或完整隱私去識別功能。UIA 取決於 App 的提供者，不能保證每個畫布或瀏覽器元件都可讀。

詳見 [Windows 手冊](windows/README.md)、[動作格式](windows/ACTIONS.md)、[Windows Skill](windows/skill/SKILL.md)。不繞過 UAC／UIPI／鎖定／安全桌面，不自動提權，不修改全域執行原則。主 Agent 仍須遵守其既有權限；hostChecks 只是聲明，本程式不是不可繞過的 OS sandbox。

## 原有 macOS／Codex 路徑

`scripts/loop.mjs` 的 `runTask/createCuaDriver`、`scripts/policy.mjs`、AX fixtures 和原有測試保持不變。這些是舊 macOS AX 路徑，**不要在 Windows 假造全域 cua 或直接啟動該自主迴圈**；Windows 使用上面的獨立 companion。

```powershell
npm run install-skill
npm run uninstall-skill
```

上列保留舊 `jev-use` Skill 安裝方式，Windows 請使用 `node windows/install.mjs <agent>`。舊 macOS 執行範例見 [runtime.md](skill/jev-use/references/runtime.md)，只有真實存在且經授權的 `cua_repl` 環境才適用。仍預設 dry-run，敏感操作需確認，實際結果須核驗。

## 驗證

```powershell
npm test
npm run windows:test
npm run p0 -- --limit 1
```

前兩個是離線測試；Windows 原生測試會建立自己的隔離 WinForms 視窗，測 UIA、繁體中文寫入、按鈕、截圖與舊快照阻擋，不操作其他 App、不呼叫模型。Linux/macOS 明確 skip 原生項目；無互動桌面時 GUI smoke 明確 skip。**`p0` 會呼叫付費 OpenRouter API**，只評測舊 AX 元素選擇，不代表 Windows 實際任务成功率。

CI 涵蓋 Windows/Linux/macOS 與 Node 22/24；實際結果看 GitHub Actions，不把模擬測試或隔離視窗測試當成所有 Agent／App 的端到端驗收。Windows 共用原始碼來源固定記錄於 `.github/workflows/vendor-windows.yml`；只在明確更新該工作流或手動觸發時同步，沒有定時拉取最新程式。
