# 來源（2026-09-20）

v0.5.0 Windows 介面依據：本機官方 computer-use 插件 26.915.31945 的 `skills/computer-use/SKILL.md`、`docs/api.md`、`docs/guidance.md`、`docs/confirmations.md`。使用 `@oai/sky` window2 API，保留 `accessibility.tree`；依 guidance 的 two-cell loop 將觀察檢視與單一動作分隔，沒有自行啟動 Windows helper。此版本由 v0.4.0 commit `340f98d4a9162437d60131b25051be300a7d7977` 修改。

專案基準：stevenke1981/Jev-cu f68fbe5b8642f7ac64f3bea9866346e1e0085be6。
原四問 harness：a8e9098474111e15b0143efd31350ae85fc9491d，scripts/loop.mjs、scripts/jev-decide.mjs、scripts/policy.mjs。

官方 ChatGPT Computer Use：
https://developers.openai.com/codex/computer-use
（目前轉向 https://learn.chatgpt.com/docs/computer-use ）

官方桌面入口：
https://developers.openai.com/codex/app

官方 Skill 文件：
https://developers.openai.com/codex/skills

產品文件說明 macOS/Windows、ChatGPT Work、插件、權限和前景限制；它沒有承諾 cua_repl/getAXState 是跨版本公開 SDK。實際 runtime 方法須以當次官方插件回傳文件驗證。方法形狀檢查不是來源驗證、不是使用者授權。

API 串接沿用 repository 既有 OpenRouter Decisions 預設；本版不更換模型、不新增 OpenAI GPT API 計費路徑。
