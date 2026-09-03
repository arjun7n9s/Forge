# FORGE

**A citation integrity tool for the agent-native web.**

FORGE catches compromised citations before they enter a note and revisits existing notes when source status changes. It uses WebMCP as a consentful cross-origin trust boundary, not as a CRUD wrapper: the personal workspace discovers tools exposed by a separate enrichment origin, executes them through `document.modelContext`, validates constrained source projections, and keeps every consequential write behind visible human review.

## Product loop

1. Type a DOI into a note.
2. The personal origin discovers `verify_citation` from the enrichment origin with `getTools({ fromOrigins })`.
3. The provider checks OpenAlex and Crossref through one shared verification service.
4. FORGE renders the result before save:
   - **Red:** retracted; strike-through, provenance chip, explicit save warning.
   - **Amber:** expression of concern or source disagreement; dotted underline, no save warning.
   - **Green:** neither source reports an integrity event.
   - **Gray:** unknown or timed out; never blocks save.
5. A reactive scan creates a blue pending workflow wrapper with the red/amber integrity signal inside it.
6. `confirm_edit` exists only while the review surface is open. Confirming extends the note's SHA-256 chain and appends an immutable decision event.

## Why two origins

- `forge-personal` owns the notes, editor, draft workflow, audit history, and nine personal WebMCP tools.
- `forge-enrich` owns public-source adapters and exposes exactly three read-only tools to the configured personal origin.
- `packages/core` owns DOI normalization, source contracts, classification, firewall, hashing, and WebMCP transport semantics.

The browser capability is probed. When cross-origin WebMCP is available, the UI labels the transport **Cross-origin WebMCP**. A compatibility path is visibly labeled and never presented as WebMCP.

## Source truth

Only OpenAlex and Crossref are used. Raw provider documents are not returned to the agent. FORGE projects the allowed fields, validates them, and normalizes both Crossref relation directions (`updated-by` and `update-to`) into constrained integrity events.

The current live acceptance cases and reproducible source URLs are documented in [docs/LIVE_SOURCE_EVIDENCE.md](docs/LIVE_SOURCE_EVIDENCE.md).

```bash
node scripts/verify-live-sources.mjs
```

## Run locally

```bash
npm install
npm run build
npm run dev
```

- Personal workspace: http://localhost:3000
- Enrichment provider: http://localhost:3001
- Readiness (database only, no upstream claim): http://localhost:3000/api/readiness
- Proof surface: http://localhost:3000/proof

No source API key is required. OpenAlex and Crossref are public. Configure the local origin boundary if using non-default ports:

```bash
# forge-enrich
NEXT_PUBLIC_FORGE_ORIGIN=http://localhost:3000
NEXT_PUBLIC_ORIGIN_TOKEN=

# forge-personal
NEXT_PUBLIC_ENRICH_ORIGIN=http://localhost:3001
NEXT_PUBLIC_ORIGIN_TOKEN=
```

Durable PostgreSQL persistence is optional locally. Without `DATABASE_URL` the workspace stays in labeled local-only mode. To enable the server path:

```bash
DATABASE_URL=postgres://...
FORGE_ACCESS_KEY_SHA256=<sha256 hex of the workspace access key>
FORGE_SESSION_SECRET=<at least 32 random characters>
npm run migrate
```

Production origins fail closed on WebMCP if `NEXT_PUBLIC_ORIGIN_TOKEN` is missing: a visible banner is shown and the transport is not labeled Cross-origin WebMCP.

## Verification commands

```bash
npm run test:run
npm run typecheck
npm run build
node scripts/verify-live-sources.mjs
```

The browser acceptance surface lives at `/proof`. It probes `getTools()`, listens for `toolchange`, and renders the live registered set plus `EDITOR_IDLE` / `EDITOR_DRAFT_READY` / `EDITOR_REVIEW_OPEN`. Discovery is shown as unsupported, probing, or supported. The negative-origin card uses a 2s timeout and an honest pass/fail.

## Architecture decisions

See [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md). Two corrections are especially important:

- Pending drafts are mutable workflow state; confirmed/rejected edit events and audit events are append-only. An "append-only row that changes status" is a contradiction, so FORGE does not claim one.
- The personal surface contains nine tools, not eight. The older count was arithmetic drift in the initial spec.

## Scope

FORGE does citation integrity only. It does not recommend replacement papers, score authors, summarize literature, scrape arbitrary pages, or pretend to be a general-purpose knowledge base.

## License

MIT
