# ChatGPT 桌面官方工具 runtime 範例

## Windows：官方 node_repl + @oai/sky

先讀取當次 Computer Use Skill、guidance、api、confirmations。按官方初始化方式在獨立工具呼叫匯入：

```js
if (!globalThis.sky) {
  const { sky } = await import('@oai/sky');
  globalThis.sky = sky;
}
```

下一次呼叫列出 App／視窗並匯入入口；不要從範例猜 app id 或 windowId。

```js
globalThis.jev = await import((await import('node:url')).pathToFileURL('{{REPO_DIR}}/scripts/chatgpt-harness.mjs').href);
globalThis.jevApps = await sky.list_apps();
nodeRepl.write(JSON.stringify(jevApps));
nodeRepl.write(JSON.stringify(jev.inspectWindowsRuntime(sky)));
```

從真實結果選定已授權的唯一 App 與視窗。若尚未開啟，以官方 `sky.launch_app` 開啟後重新列出。下面 `chosenApp` / `chosenWindow` 必須取自前一呼叫的回傳物件；`taskGoal` 是使用者授權的單一目標。先預覽：

```js
globalThis.preview = await jev.runChatGPTTask({
  sky,
  appName: chosenApp.displayName ?? chosenApp.id,
  windowId: chosenWindow.id,
  goal: taskGoal,
  maxSteps: 1,
  dryRun: true,
  // 僅在使用者授權該 App 時明確列入。不是更改官方工具權限。
  allowedApps: [chosenApp.displayName ?? chosenApp.id],
  // 需要時提供 resources: { text: '明確文字' } 或 { key: 'Escape' }。
  // verify: ax => ... 必須以真實可觀察結果定義，不用單純 UI 有變化代替成功。
});
nodeRepl.write(JSON.stringify(preview));
```

預覽成功且授權覆蓋後，以同樣參數 `dryRun:false` 重新準備 `globalThis.proposal`，印出 observation 與 planned，**結束工具呼叫並由 GPT 檢視**。只有 `awaiting_review` 可以在下一個工具呼叫執行：

```js
globalThis.stepResult = await jev.executeWindowsStep(proposal);
nodeRepl.write(JSON.stringify(stepResult));
```

不可在同一 cell 或自動迴圈內準備並執行。`dry_run` 不能直接轉成執行；`confirm` 仍依官方確認規則由 GPT 處理，沒有「approve=true」繞過。提案只用一次、兩分鐘後過期；中間有人工操作、其他工具操作或畫面改變時，重新準備並檢視。新準備會使同一視窗舊提案失效。

執行會立即重讀文字樹；`done/verified:true` 表示 verify 通過，`step_complete` 只表示單步完成。下一步再次準備，GPT 以 plan/constraints 帶入必要進度。最多連續嘗試30個人工分隔的步驟；兩次無進展即重新規劃。Windows 捲動、拖曳、座標與缺少文字候選的畫面，交回 GPT 透過同一官方工具處理。

## 提供舊 cua App 介面的環境

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
