import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ENDPOINT, DEFAULT_MODEL, PRICE_PER_INPUT_TOKEN_USD,
  ask, decide, estimateCostUsd, loadApiKey,
} from "../scripts/jev-decide.mjs";

// Every request is mocked. These tests never call a provider or operate an App.
const TEST_KEY = "openrouter-test-key-not-a-real-secret";
const questions = { ready: { type: "noul", instructions: "Is the status ready?" } };
const state = { status: "ready" };
const responseBody = {
  id: "test-decision",
  model: "typesafe/jev-1.13-20260917",
  provider: "TypeSafe",
  answers: { ready: { type: "noul", noul: 0.96 } },
  usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 },
};
const ok = () => new Response(JSON.stringify(responseBody), { status: 200 });
const request = (options = {}) => ask({ state, questions, apiKey: TEST_KEY, ...options });

function withKeyEnvironment(values, fn) {
  const names = ["OPENROUTER_API_KEY", "TYPESAFE_API_KEY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    return fn();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

function withEnvFile(content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jev-openrouter-"));
  const envFile = path.join(dir, ".env.local");
  try {
    if (content !== null) fs.writeFileSync(envFile, content);
    return fn(envFile);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("default provider is OpenRouter Decisions with pinned Jev 1.13", () => {
  assert.equal(DEFAULT_ENDPOINT, "https://openrouter.ai/api/alpha/decisions");
  assert.equal(DEFAULT_MODEL, "typesafe/jev-1.13");
});

test("OPENROUTER_API_KEY environment takes precedence over .env.local", () => {
  withKeyEnvironment({ OPENROUTER_API_KEY: `  ${TEST_KEY}  `, TYPESAFE_API_KEY: "old-key" }, () => {
    withEnvFile('OPENROUTER_API_KEY="file-key"\n', envFile => {
      assert.equal(loadApiKey({ envFile, configFile: null }), TEST_KEY);
    });
  });
});

test("quoted .env.local key supports BOM, CRLF and blank environment", () => {
  withKeyEnvironment({ OPENROUTER_API_KEY: "   " }, () => {
    for (const quote of ['"', "'"]) {
      withEnvFile(`\uFEFF# local configuration\r\nOPENROUTER_API_KEY=${quote}${TEST_KEY}${quote}\r\n`, envFile => {
        assert.equal(loadApiKey({ envFile, configFile: null }), TEST_KEY);
      });
    }
  });
});

test("legacy TypeSafe credentials are never an automatic fallback", () => {
  withKeyEnvironment({ TYPESAFE_API_KEY: "legacy-secret" }, () => {
    withEnvFile("TYPESAFE_API_KEY=legacy-file-secret\n", envFile => {
      assert.throws(() => loadApiKey({ envFile, configFile: null }), /未找到 OPENROUTER_API_KEY/);
    });
  });
});

test("missing or empty OpenRouter credentials fail locally", () => {
  withKeyEnvironment({}, () => {
    for (const content of [null, "OPENROUTER_API_KEY=\n", 'OPENROUTER_API_KEY="   "\n']) {
      withEnvFile(content, envFile => {
        assert.throws(() => loadApiKey({ envFile, configFile: null }), /未找到 OPENROUTER_API_KEY/);
      });
    }
  });
});

test("blank explicit API key does not send a request", async () => {
  let calls = 0;
  await assert.rejects(request({ apiKey: " \t ", fetchImpl: async () => { calls++; return ok(); } }), /OPENROUTER_API_KEY/);
  assert.equal(calls, 0);
});

test('network permission denial is distinguished from authentication and never retried', async () => {
  let calls = 0;
  await assert.rejects(request({ fetchImpl: async () => {
    calls++;
    throw new TypeError('fetch failed', { cause: Object.assign(new AggregateError([]), { code: 'EACCES' }) });
  } }), err => {
    assert.equal(err.code, 'NETWORK_ACCESS_DENIED');
    assert.match(err.message, /不是 API key 驗證結果/);
    assert.ok(!err.message.includes(TEST_KEY));
    return true;
  });
  assert.equal(calls, 1);
});

test("ask sends Bearer auth and state/questions, not Chat Completions messages", async () => {
  const result = await request({
    fetchImpl: async (url, init) => {
      assert.equal(url, DEFAULT_ENDPOINT);
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, `Bearer ${TEST_KEY}`);
      assert.equal(init.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(init.body), { state, model: DEFAULT_MODEL, questions });
      assert.ok(init.signal instanceof AbortSignal);
      return ok();
    },
  });
  assert.deepEqual(result.answers, responseBody.answers);
  assert.deepEqual(result.usage, responseBody.usage);
  assert.equal(result.model, responseBody.model);
  assert.equal(result.costUsd, responseBody.usage.cost);
  assert.ok(result.latencyMs >= 0);
  assert.deepEqual(result.raw, responseBody);
});

test("explicit model override remains supported without changing the default", async () => {
  await request({ model: "typesafe/custom-test-model", fetchImpl: async (url, init) => {
    assert.equal(url, DEFAULT_ENDPOINT);
    assert.equal(JSON.parse(init.body).model, "typesafe/custom-test-model");
    return ok();
  } });
  assert.equal(DEFAULT_MODEL, "typesafe/jev-1.13");
});

test("decide preserves the four questions and typed decision normalization", async () => {
  const answers = {
    target: { type: "choice", choice: "i56", confidence: 0.98, probabilities: { i56: 0.99, i58: 0.01 } },
    action: { type: "choice", choice: "click_element" },
    done: { type: "noul", noul: 0.01 },
    risk: { type: "noul", noul: 0.02 },
  };
  const result = await decide({
    goal: "previous month", app: "Calendar", apiKey: TEST_KEY,
    candidates: [{ index: 56, role: "button", label: "previous month" }, { index: 58, role: "button", label: "next month" }],
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(url, DEFAULT_ENDPOINT);
      assert.equal(body.model, DEFAULT_MODEL);
      assert.deepEqual(Object.keys(body.questions), ["target", "action", "done", "risk"]);
      assert.deepEqual(body.state.candidates.map(c => c.id), ["i56", "i58"]);
      return new Response(JSON.stringify({ answers, usage: { input_tokens: 100 }, model: DEFAULT_MODEL }));
    },
  });
  assert.equal(result.targetIndex, 56);
  assert.equal(result.action, "click_element");
  assert.equal(result.confidence, 0.98);
  assert.equal(result.done, 0.01);
  assert.equal(result.risk, 0.02);
  assert.deepEqual(result.probabilities, answers.target.probabilities);
});

test("provider-reported cost takes precedence, including zero", () => {
  assert.equal(estimateCostUsd({ input_tokens: 1_000_000, cost: 0.0123 }), 0.0123);
  assert.equal(estimateCostUsd({ input_tokens: 1_000_000, cost: 0 }), 0);
});

test("cost falls back to Jev 1.13 input estimate only when unavailable", () => {
  assert.equal(estimateCostUsd({ input_tokens: 1_000_000 }), 0.042);
  assert.equal(estimateCostUsd({ inputTokens: 100 }), 100 * PRICE_PER_INPUT_TOKEN_USD);
  for (const cost of [null, undefined, -1, NaN, Infinity, "invalid"]) {
    assert.equal(estimateCostUsd({ input_tokens: 100, cost }), 100 * PRICE_PER_INPUT_TOKEN_USD);
  }
  for (const usage of [null, undefined, {}, { input_tokens: -1 }, { input_tokens: "invalid" }]) {
    assert.equal(estimateCostUsd(usage), 0);
  }
});

test("4xx errors do not retry or switch provider/model; echoed key is redacted", async () => {
  for (const status of [400, 401, 402, 403, 404]) {
    let calls = 0;
    await assert.rejects(request({ fetchImpl: async (url, init) => {
      calls++;
      assert.equal(url, DEFAULT_ENDPOINT);
      assert.equal(JSON.parse(init.body).model, DEFAULT_MODEL);
      return new Response(JSON.stringify({ error: { message: `Rejected ${TEST_KEY}` } }), { status });
    } }), err => {
      assert.equal(err.status, status);
      assert.ok(err.message.includes("[REDACTED]"));
      assert.ok(!err.message.includes(TEST_KEY));
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("429 retries the same request and provider within the retry budget", async () => {
  let calls = 0;
  const result = await request({ maxRetries: 1, fetchImpl: async (url, init) => {
    assert.equal(url, DEFAULT_ENDPOINT);
    assert.equal(JSON.parse(init.body).model, DEFAULT_MODEL);
    return ++calls === 1 ? new Response('{"error":{"message":"rate limited"}}', { status: 429 }) : ok();
  } });
  assert.equal(calls, 2);
  assert.equal(result.costUsd, responseBody.usage.cost);
});

test("5xx retries stop at the configured limit without provider fallback", async () => {
  let calls = 0;
  await assert.rejects(request({ maxRetries: 1, fetchImpl: async (url) => {
    assert.equal(url, DEFAULT_ENDPOINT);
    calls++;
    return new Response('{"error":{"message":"unavailable"}}', { status: 503 });
  } }), err => err.status === 503);
  assert.equal(calls, 2);
});

test("invalid JSON and malformed answers are rejected, not interpreted as success", async () => {
  for (const content of ["not-json", "{}", '{"answers":null}', '{"answers":"allow"}', '{"answers":[]}']) {
    let calls = 0;
    await assert.rejects(request({ fetchImpl: async () => {
      calls++;
      return new Response(content, { status: 200 });
    } }), /无效的 Decisions 响应/);
    assert.equal(calls, 1);
  }
});

test("request timeout aborts pending fetch", async () => {
  await assert.rejects(request({ timeoutMs: 20, fetchImpl: async (_url, { signal }) => {
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } }), err => err.name === "AbortError");
});

test("timeout also covers reading the response body", async () => {
  await assert.rejects(request({ timeoutMs: 20, fetchImpl: async (_url, { signal }) => ({
    ok: true, status: 200,
    json: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
  }) }), err => err.name === "AbortError");
});

test("CLI uses the pinned OpenRouter route and environment key", () => {
  const script = fileURLToPath(new URL("../scripts/jev-decide.mjs", import.meta.url));
  const bootstrap = `
    import { pathToFileURL } from "node:url";
    process.argv[1] = ${JSON.stringify(script)};
    process.argv.length = 2;
    globalThis.fetch = async (url, init) => {
      if (url !== ${JSON.stringify(DEFAULT_ENDPOINT)}) throw new Error("wrong endpoint");
      if (JSON.parse(init.body).model !== ${JSON.stringify(DEFAULT_MODEL)}) throw new Error("wrong model");
      if (init.headers.Authorization !== ${JSON.stringify(`Bearer ${TEST_KEY}`)}) throw new Error("wrong key");
      return new Response(${JSON.stringify(JSON.stringify(responseBody))});
    };
    await import(pathToFileURL(process.argv[1]).href);
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", bootstrap], {
    input: JSON.stringify({ state, questions }), encoding: "utf8", timeout: 5000,
    env: { ...process.env, OPENROUTER_API_KEY: TEST_KEY },
  });
  assert.equal(JSON.parse(output).model, responseBody.model);
});
