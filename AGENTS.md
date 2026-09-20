# Jev-cu project contract — v0.4.0

Use GPT in the current ChatGPT desktop session as the sole planner and owner. Read skill/jev-use/SKILL.md and the current official Computer Use tool documentation before desktop actions.

Execution backend: the official ChatGPT desktop Computer Use plugin only. Do not install or launch Pi, AGY, OpenCode, a second Codex CLI agent, a custom Windows UIA/SendInput process, an alternate browser driver, remote-control bridge, or an external desktop automation package. Do not recreate the removed windows/ companion.

Keep the corrected original workflow: plan -> full AX -> select <=40 candidates -> concise text state -> Jev target/action/done/risk -> local Policy -> official App execution -> fresh observation and verification. Jev is a decision helper, not a replacement main agent and not the later approve/risk reviewer.

The user entry is scripts/chatgpt-harness.mjs:runChatGPTTask. scripts/loop.mjs retains the original core for compatibility and regression testing; do not bypass the GPT entry's restrictions by invoking raw executor internals. Mock objects and injected decision functions belong only in offline tests.

The current host must actually expose the documented cua App interface. Method-shape checks are not proof of OpenAI provenance or authorization. Never fake the runtime, AX, IDs, screenshots or completion; missing capabilities require stopping or GPT takeover through the same official tool.

No policy lowering, no implicit input text/key, no target override through coordinates. Preserve official app permissions, required confirmations and scope. Do not use the GUI to automate terminal apps, ChatGPT itself or security prompts contrary to official plugin restrictions. Jev receives minimized text only, never raw screenshots or credentials.

Validate actual outcomes. A changed UI or model done probability alone is not proof of success. Report mock tests, paid snapshot evaluations and real desktop tests separately. Do not modify Jev-ocu as part of this project task.
