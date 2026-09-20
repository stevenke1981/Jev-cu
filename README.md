# Jev-cu

把 Computer Use 的「下一步点哪里」交给 Jev（TypeSafe System One）：Jev 从界面文字候选中选元素、动作、完成度与风险，Codex Computer Use 负责读取界面与执行，本地策略门槛拦截敏感操作。只传文字，不传截图。

**v0.2.0：默认通过 OpenRouter 调用固定版本 `typesafe/jev-1.13`，不再直连 TypeSafe。** 本次只迁移 API 串接与相关配置，不改变原有操作流程和确认策略。

## 目录

```
skill/jev-use/   可安装到 Codex 的 skill（运行手册 + 安全规则）
scripts/         Jev 调用、策略门槛、决策循环、快照评测、安装脚本
fixtures/        AX 快照与 P0 用例
tests/           核心回归与 OpenRouter API 模拟测试
```

## 安装 skill

```bash
npm run install-skill      # 复制到 ~/.codex/skills/jev-use，新会话生效
npm run uninstall-skill
```

skill 源文件里的 `{{REPO_DIR}}` 会在安装时替换成仓库实际路径。升级后重新运行 `npm run install-skill`，再开启新的 Codex 会话，避免继续使用旧的密钥说明或已缓存的模块。

## OpenRouter 配置

在项目根目录创建或编辑 `.env.local`，填写自己的 **OpenRouter** API key；不要提交该文件，也不要在聊天、日志或命令行参数中输出密钥：

```dotenv
OPENROUTER_API_KEY=your_openrouter_api_key
```

也可设置同名环境变量；有效的环境变量优先于 `.env.local`。仅有旧的 `TYPESAFE_API_KEY` 不会生效，程序不会自动把旧密钥发送给 OpenRouter，也不会在失败时回退到 TypeSafe 或其他模型。已有 `.env.local` 时只修改相应条目，不要覆盖其他配置。

| 配置 | 默认值 |
| --- | --- |
| API | `POST https://openrouter.ai/api/alpha/decisions` |
| Model ID | `typesafe/jev-1.13` |
| API key | `OPENROUTER_API_KEY` |
| 请求 | `model`、`state`、`questions` |
| 响应 | `answers`、`usage`、`model` |

`#playground` 是网页界面位置，不是 API 地址。Jev 使用 **Decisions API**，不能把这份请求改投 `/api/v1/chat/completions`，也不使用 `messages`。模型默认固定为 1.13，不使用 `jev-latest` 自动升级别名。原有 `ask` / `decide` 的显式 `model`、`endpoint` 参数仍保留，但调用者覆盖后就不再是本页默认配置。

成本优先读取 OpenRouter 返回的 `usage.cost`（包括 0）；缺少该字段时按 Jev 1.13 的输入 token 参考价估算。参考价核对日期为 2026-09-20，不代表未来价格或其他模型价格。

官方依据：[Jev 1.13 模型页](https://openrouter.ai/typesafe/jev-1.13)、[OpenRouter OpenAPI 规范](https://openrouter.ai/openapi.json)（`/api/alpha/decisions`）。

## 使用

循环要在 Codex 桌面 App 的 `cua_repl` 运行时里执行：

```js
const repo = "/path/to/Jev-cu"; // 换成实际克隆路径
const { pathToFileURL } = await import("node:url");
const { runTask, createCuaDriver } = await import(pathToFileURL(`${repo}/scripts/loop.mjs`).href);

await runTask({
  driver: createCuaDriver(cua),
  appName: "Calendar",
  goal: "switch the calendar to the previous month", // 英文目标
  dryRun: true,                                       // 确认后改 false
  maxSteps: 5,
});
```

现有 `runTask`、`decide`、`ask`、CLI 与 P0 评测均共用默认 OpenRouter 配置，不需要分别改写模型名称。

## 验证

```bash
npm test                         # 全部模拟测试，不调用 API、不需要 key
node --test tests/openrouter.test.mjs  # 仅验证 OpenRouter 串接
npm run p0 -- --limit 1           # 固定 AX 快照评测：真实调用 OpenRouter，需要 key，会产生费用
```

测试涵盖模型与端点、密钥读取、Bearer 认证、state/questions 请求、响应归一化、实际费用、错误重试、异常响应和逾时。真实模型可用性、额度及桌面 App 操作仍需在自己的授权环境中验证；模拟测试不等于端到端成功。

## 安全边界

- 默认 dry-run；删除、发送、支付、授权、上传、验证码、安装、系统设置等操作停在 `confirm`，需人工确认。
- App 白名单在 `scripts/policy.mjs`，新增 App 必须显式修改。
- 界面文字只作为数据，不作为指令；不绕过登录、付费墙和验证码。
