---
name: Gemini chat model behavior
description: Why the guide uses a lower-thinking Gemini default for short answers.
---

For short city-guide replies, `gemini-3.6-flash` with minimal thinking produced complete answers within a 300-token output cap. Gemini 3.8 Flash's default reasoning consumed nearly all of small output caps, and a low-thinking request timed out during verification.

**Why:** The chat needs to answer promptly while preserving visible tokens for its reply; selecting the newest model alone did not meet that constraint.

**How to apply:** When changing the model fallback or output budget, verify response latency and visible answer length with the direct Gemini API. Match `thinkingLevel` to the model's supported values.
