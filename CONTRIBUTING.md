# Contributing

Thanks for helping public knowledge stay attributable, recoverable, and useful to future agents.

## Start with user evidence

For a new connector, describe the user job, stable account identity, stable item identity, pagination or cursor behavior, terminal evidence, incremental boundary, and inaccessible states before writing code. Add the smallest sanitized fixture that proves the behavior.

## Connector contract

A connector must provide:

- stable platform account and item IDs;
- resumable full synchronization;
- an evidence-backed incremental strategy;
- explicit captured, deleted, unavailable, failed, and pending semantics;
- a verification report;
- normalized artifacts that can be imported without logging in again.

Keep platform login and parsing outside the canonical core. Keep person identity, merge, provenance, renderers, and verification inside the core.

## Development

```bash
npm run validate
```

Use fictional fixtures only. Read [PRIVACY.md](PRIVACY.md) and inspect the staged diff before pushing.

## Product feedback

Connector requests and concrete research or archival workflows are especially valuable. Explain what you are trying to preserve and what “complete enough to trust” means for that source. Reactions on existing requests help prioritize the roadmap.
