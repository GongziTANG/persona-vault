# PersonaVault protocol v1

## Identity hierarchy

`Person` is the human or public identity being studied. `SourceAccount` is one platform presence owned by that person. `ContentItem` is one platform record. Do not use a nickname as a stable key.

## Global item key

Build the canonical ID as:

```text
<platform>:<source-account-id>:<source-item-id>
```

Never deduplicate by text or publication date. Cross-post similarity is a derived relationship, not identity.

## Item states

- `captured`: source content is locally present and non-empty.
- `deleted`: the platform explicitly reports deletion.
- `unavailable`: the platform explicitly reports an access restriction or unavailable state.
- `failed`: acquisition or parsing failed without valid terminal evidence.
- `pending`: work remains.

Only `captured` requires non-empty content. Never synthesize content for terminal states.

## Source of truth

- `vault.json`: canonical person, sources, items, and import runs.
- `manifest.json`: human-readable inventory and counts.
- `verification.json`: independent completion checks.
- `exports/timeline.md`: human-readable cross-platform timeline.
- `exports/content.jsonl`: agent-ready canonical records.

Connector manifests remain authoritative for platform-specific completeness and recovery.

## Compatibility

Add new fields without changing existing meanings. Bump `version` before a breaking schema change and provide an explicit migration. Renderers read canonical items; they never re-fetch source platforms.
