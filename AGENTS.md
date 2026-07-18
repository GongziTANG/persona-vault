# Agent instructions

Use `skills/build-persona-vault/SKILL.md` as the product entry point. Keep WeChat and Weibo collection in their connector skills, then import into the canonical vault and run verification.

Never commit runtime archives, account sessions, cookies, tokens, target content, local absolute paths, or generated vaults. Use fictional examples in tests and documentation. Run `npm run validate` before publishing changes.
