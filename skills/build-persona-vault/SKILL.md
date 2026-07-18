---
name: build-persona-vault
description: Build and maintain one verified, cross-platform knowledge vault for a public person or creator from WeChat public-account and Weibo archives, with full-first then incremental synchronization, stable source IDs, provenance, unavailable-state evidence, Markdown/JSONL exports, and verification. Use when Codex, Claude, or WorkBuddy is asked to 建立人物知识库、汇总某个人的公众号和微博、跨平台归档创作者内容、持续增量更新人物语料、合并 MPVault 与微博 Markdown, or operate PersonaVault.
---

# Build a PersonaVault

Create one living knowledge asset without merging platform collectors into a brittle monolith. Keep acquisition platform-specific; normalize, merge, render, and verify through the shared PersonaVault protocol.

## Resolve the runtime

1. Resolve the repository root two directories above this `SKILL.md`; require its `package.json` name to be `persona-vault`.
2. Use Node.js 22 or newer. Invoke the CLI as `node <repo-root>/bin/personavault.mjs` when `personavault` is not on `PATH`.
3. Use an absolute local vault directory. Never store credentials, sessions, browser state, or raw private archives inside the repository.
4. Read [references/connectors.md](references/connectors.md) before collecting. Read [references/protocol.md](references/protocol.md) before changing the canonical schema. Read [references/recovery.md](references/recovery.md) after any partial or failed run.

## Lock the person and sources

Treat the person, platform account, and content item as different identities. Confirm each platform's stable account ID and display name. Ask only when the evidence cannot establish that multiple accounts belong to the same person.

Initialize once:

```bash
personavault init --name "Display Name" --output "/absolute/vault/path"
```

Reuse the same vault on later runs. Refuse silent person-ID or source-account substitution.

## Collect through platform connectors

- For WeChat public accounts, use `$mpvault-archive` or its `mpvault` CLI. Preserve its `manifest.json`, `verification.json`, article Markdown, local assets, and checkpoint state.
- For Weibo users, use `$archive-weibo-user`. Preserve its `.state/archive.json`, `manifest.json`, Markdown, Excel, and verification evidence.
- On the first run, require each connector's full-sync evidence. On later runs, let the connector choose incremental mode from its existing state. Never delete connector state before a retry.

Do not describe deleted, access-restricted, or platform-omitted records as captured. Report platform header counts and accessible unique counts separately.

## Merge idempotently

After each connector finishes, import its local archive:

```bash
personavault import wechat --vault "/absolute/vault/path" --archive "/absolute/mpvault/export"
personavault import weibo --vault "/absolute/vault/path" --archive "/absolute/weibo/archive"
```

The importer uses `platform + account ID + source item ID` as the global key. Repeated imports remain unchanged; edited source content updates under the same ID; new content appends. Keep unavailable records as explicit states without inventing text.

## Verify before reporting success

Run:

```bash
personavault verify --vault "/absolute/vault/path"
```

Require `ok: true`, matching Markdown and JSONL row counts, zero duplicate or malformed IDs, zero invalid dates, zero empty captured content, valid source identities, and complete connector-specific evidence. Report per-source full/incremental mode, scanned/new/updated totals, accessible-versus-reported gaps, overall date range, and final output files.

## Protect the product boundary

Keep platform authentication and pagination inside connectors. Keep canonical identity, item state, provenance, idempotent merge, renderers, and verification inside PersonaVault. Add new platforms as connectors; do not add platform conditionals to the shared core unless they describe a genuine canonical concept.
