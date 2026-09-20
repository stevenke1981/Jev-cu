#!/usr/bin/env node
/**
 * Jev 决策封装（OpenRouter Decisions API）。
 *
 * - 读取 key：环境变量 OPENROUTER_API_KEY，或项目根目录 .env.local
 * - ask()   ：发一次 Decisions 请求（可并发多问）
 * - decide()：Computer Use 循环用的标准四问（target/action/done/risk）
 *
 * CLI（调试用）：
 *   node scripts/jev-decide.mjs payload.json
 *   cat payload.json | node scripts/jev-decide.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { configEnvFile, readEnvKey } from './credentials.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
export const DEFAULT_MODEL = "typesafe/jev-1.13";
/** Jev 1.13 估算价（2026-09-20）：$0.042/Mtok 输入；优先使用 usage.cost。 */
export const PRICE_PER_INPUT_TOKEN_USD = 0.042 / 1e6;

export function loadApiKey({
  envVar = "OPENROUTER_API_KEY",
  envFile = path.join(PROJECT_DIR, ".env.local"),
  configFile = configEnvFile(),
} = {}) {
  const env = globalThis.process?.env ?? {};
  const envKey = String(env[envVar] ?? "").trim();
  if (envKey) return envKey;
  for (const file of [envFile, configFile]) {
    const key = readEnvKey(file, envVar);
    if (key) return key;
  }
  throw new Error(`未找到 ${envVar}：请设置环境变量、项目 .env.local 或本机 Jev 设置文件。`);
}

export function estimateCostUsd(usage = {}) {
  const cost = toNumber(usage?.cost);
  if (cost != null && cost >= 0) return cost;
  const tokens = toNumber(usage?.input_tokens ?? usage?.inputTokens ?? 0);
  return tokens != null && tokens >= 0 ? tokens * PRICE_PER_INPUT_TOKEN_USD : 0;
}

function toNumber(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 候选描述清洗：去掉 URL 等噪声，控制 token 体积（导出以便单测） */
export function sanitizeLabel(text, max = 120) {
  return String(text ?? "")
    .replace(/\b(?:https?|orpheus|file|javascript|data):\S*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** 构造循环用的四个标准问题（导出以便单测） */
export function buildQuestions(goal, candidates = []) {
  const criteria = {};
  for (const c of candidates) criteria[`i${c.index}`] = sanitizeLabel(`${c.role}: ${c.label}`);

  return {
    criteria,
    questions: {
      target: {
        type: "choice",
        instructions: `Which single element should be acted on next to accomplish the goal? Goal: ${goal}`,
        criteria,
      },
      action: {
        type: "choice",
        instructions: "What is the next action type?",
        criteria: {
          click_element: "Click the chosen element",
          click_at: "Click a canvas position (coordinates come from the planner)",
          drag: "Drag on the canvas (coordinates come from the planner)",
          set_value: "Replace the value of a text input",
          type_text: "Type the provided text",
          press_key: "Press a keyboard key",
          scroll: "Scroll the current view",
          wait: "Wait for the UI to update",
          ask_user: "Stop and ask the user",
        },
      },
      done: {
        type: "noul",
        instructions: "Is the goal already visibly achieved in the current UI state?",
      },
      risk: {
        type: "noul",
        instructions:
          "Does the next action require explicit user confirmation (delete data, send/submit, pay/subscribe, change permissions, upload/share, solve CAPTCHA, install software, change system settings, enter credentials)?",
        criteria: {
          true: "delete / send / pay / permission / upload / captcha / install / system settings / credentials",
          false: "safe reversible navigation such as opening, searching, scrolling, selecting, reading",
        },
      },
    },
  };
}

/** 把 API answers 归一化成循环可用的结构（导出以便单测） */
export function normalizeDecision(answers = {}, criteria = {}) {
  const targetKey = answers.target?.choice ?? null;
  const valid = typeof targetKey === "string" && /^i\d+$/.test(targetKey) && Object.hasOwn(criteria, targetKey);
  return {
    action: answers.action?.choice ?? null,
    targetKey: valid ? targetKey : null,
    targetIndex: valid ? Number(targetKey.slice(1)) : null,
    targetLabel: valid ? (criteria[targetKey] ?? null) : null,
    done: toNumber(answers.done?.noul ?? answers.done?.probability),
    risk: toNumber(answers.risk?.noul ?? answers.risk?.probability),
    confidence: toNumber(answers.target?.confidence),
    probabilities: answers.target?.probabilities ?? {},
  };
}

export async function ask({
  state,
  questions,
  model = DEFAULT_MODEL,
  apiKey,
  endpoint = DEFAULT_ENDPOINT,
  maxRetries = 2,
  timeoutMs = 60_000,
  fetchImpl = fetch,
}) {
  const key = String(apiKey ?? loadApiKey()).trim();
  if (!key) throw new Error("OPENROUTER_API_KEY 不能为空");
  const backoff = [1_000, 3_000, 8_000];

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let res;
    let body;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state, model, questions }),
        signal: controller.signal,
      });
      body = await res.json().catch((err) => {
        if (controller.signal.aborted) throw err;
        return null;
      });
    } catch (err) {
      const codes = [err.code, err.cause?.code, ...(err.cause?.errors ?? []).map(item => item.code)];
      if (codes.some(code => code === 'EACCES' || code === 'EPERM')) {
        const denied = new Error('OpenRouter 連線被本機執行環境拒絕（EACCES/EPERM），未收到 HTTP 回應；這不是 API key 驗證結果。請檢查宿主網路權限，不要更換通道繞過限制。');
        denied.code = 'NETWORK_ACCESS_DENIED';
        throw denied;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const latencyMs = Date.now() - startedAt;

    if (res.ok && body?.answers && typeof body.answers === "object" && !Array.isArray(body.answers)) {
      return {
        answers: body.answers,
        usage: body.usage ?? {},
        model: body.model ?? model,
        latencyMs,
        costUsd: estimateCostUsd(body.usage),
        raw: body,
      };
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      const detail = body?.detail?.message ?? body?.error?.message ??
        (res.ok ? "无效的 Decisions 响应（缺少 answers 对象）" : res.statusText);
      const message = String(detail ?? "未知错误").replaceAll(key, "[REDACTED]").slice(0, 200);
      const err = new Error(`OpenRouter Jev 调用失败 HTTP ${res.status}（${latencyMs}ms）：${message}`);
      err.status = res.status;
      throw err;
    }
    await sleep(backoff[Math.min(attempt, backoff.length - 1)]);
  }
}

/**
 * Computer Use 循环的标准决策入口。
 * @param {object} input
 * @param {string} input.goal 英文目标（Jev 英文最准）
 * @param {string} input.app
 * @param {Array<{index:number, role:string, label:string}>} input.candidates
 * @param {string} [input.context] 少量界面上下文（窗口标题/焦点行）
 * @param {string[]} [input.recentActions]
 * @param {string} [input.constraints]
 */
export async function decide({
  goal,
  app,
  candidates = [],
  context = "",
  recentActions = [],
  constraints = "",
  ...askOptions
}) {
  const { criteria, questions } = buildQuestions(goal, candidates);
  const state = {
    goal,
    app,
    context: String(context).slice(0, 1_500),
    candidates: Object.entries(criteria).map(([id, desc]) => ({ id, desc })),
    recent_actions: recentActions.slice(-6),
    constraints,
  };
  const r = await ask({ state, questions, ...askOptions });
  return {
    ...normalizeDecision(r.answers, criteria),
    usage: r.usage,
    latencyMs: r.latencyMs,
    costUsd: r.costUsd,
    model: r.model,
    raw: r.raw,
  };
}

/* ------------------------------- CLI ------------------------------- */

async function main() {
  const file = process.argv[2];
  const raw = file
    ? await fs.promises.readFile(file, "utf8")
    : await new Promise((resolve, reject) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (c) => (data += c));
        process.stdin.on("end", () => resolve(data));
        process.stdin.on("error", reject);
      });
  const payload = JSON.parse(raw);
  const result = await ask({
    state: payload.state,
    questions: payload.questions,
    model: payload.model ?? DEFAULT_MODEL,
  });
  console.log(JSON.stringify(result, null, 2));
}

const isMain =
  typeof process !== "undefined" && process.argv?.[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`[jev-decide] ${err.message}`);
    process.exit(1);
  });
}
