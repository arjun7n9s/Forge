# Live source verification

Captured by `node scripts/verify-live-sources.mjs` against public APIs on 2026-09-02. This is not synthetic seed data. The app rechecks these sources at runtime; this file records why each acceptance DOI was selected.

| Case | DOI | OpenAlex | Crossref normalized integrity events | Expected UI |
|---|---|---|---|---|
| Corroborated retraction | `10.1016/j.ijantimicag.2020.105949` | `W3010930696`, `is_retracted=true` | `retraction`, `erratum` | Red, strike-through, save warning |
| Retraction history | `10.1038/nature04533` | `W2075481535`, `is_retracted=true` | `expression_of_concern`, later `retraction` | Red; provenance preserves both events |
| OpenAlex-only retraction | `10.1038/nrg2336` | `W2008098614`, `is_retracted=true` | correction only; no retraction/EOC | Red, labeled OpenAlex-only |
| EOC only | `10.1177/1475090218792382` | `W2886770338`, `is_retracted=false` | publisher `expression_of_concern` under `updated-by`, 2025-08-07 | Amber, no save warning |
| Clean | `10.1038/nature14539` | `W2919115771`, `is_retracted=false` | no retraction/EOC | Green dot, no text treatment |

## Reproduce

```bash
node scripts/verify-live-sources.mjs
```

The command exits non-zero if any expected source relationship is no longer true. FORGE treats that failure as a prompt to update the seed scenario, never to hard-code the old status.

## Crossref relation-direction finding

Original articles commonly carry notices under `updated-by`. Notice records commonly target the original under `update-to`. FORGE normalizes both arrays and retains the relation direction in provenance. Retraction outranks EOC for current visual treatment; prior EOC events remain visible in history.
