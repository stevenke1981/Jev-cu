# ChatGPT 桌面官方工具 runtime 範例

這些方法沿用原專案的 cua App contract，必須先對照**當次官方工具文件**。不是 OpenAI 對所有版本／平台的公開 SDK 保證。此段只在桌面工作階段真的提供 cua、Node ESM 與官方 App 方法時執行；普通 PowerShell、Node 終端和本聊天伺服器沒有這些能力。

按官方文件先單獨綁定實際 App、取得其工具說明及授權，再於後續工具呼叫匯入：

```js
var jevURL = await import('node:url');
var jev = await import(jevURL.pathToFileURL('{{REPO_DIR}}/scripts/chatgpt-harness.mjs').href);
// cua 必須是當前官方 Computer Use 提供的真實物件，不可自行建立。
var capability = jev.inspectChatGPTRuntime(typeof cua === 'undefined' ? null : cua);
// 這只是方法形狀檢查，不是證明已授權／來源可信。
```

先從**真實當前觀察**確定目標，再設定單一任務；以下月份只是示意，不能照抄成虛構的已觀察內容：

```js
var result = await jev.runChatGPTTask({
  cua,
  appName: 'Calendar',
  goal: 'Switch the visible calendar to the next month.',
  dryRun: true,
  maxSteps: 2,
  // 由 GPT 依實際觀察設定；例如原頁為 September 2026 才用此判據。
  verify: ax => ax.includes('October 2026'),
});
// 依當前 runtime 文件指定的方法顯示 result。
```

dry-run 通過且授權覆蓋後，才設定 dryRun:false。input text/key/direction 用 resources 明確給定；不可提供替換 driver/decide/thresholds/jevOptions。任務很長時 GPT 拆小目標；每次 maxSteps 上限30，預設候選最多40。

若介面不同，不要把 screenshot JSON轉成假 AX，或改用 windows_* 工具。回報 `official_state_interface_unsupported`，由 GPT 依官方文件決定是否可在同一工具中接管；沒有可用官方工具就停下。
