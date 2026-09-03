# FORGE — Specification

**A citation integrity tool for the agent-native web.**

This is the build spec for the WebMCP Challenge submission. The pitch is locked; this document defines what gets built, how it ships, and what proves it works.

---

## 1. Scope (do not exceed)

**One job:** citation integrity.
**Two surfaces:** preventive (editor live check) + reactive (overnight worker).
**Two sources:** OpenAlex + CrossRef. No others.
**Two signals:** OpenAlex `is_retracted`, CrossRef formal notices normalized from both `updated-by` and `update-to`. Live verification found that original article records commonly carry notices under `updated-by`, while notice records carry their targets under `update-to`; supporting only one direction is incorrect.
**Five draft card types:** corroborated, OpenAlex-only, Crossref-only, signals-disagree, EOC-only. Only card types supported by current live source evidence are seeded; disagreement remains a tested classifier state, not synthetic demo data.
**Two origins:** `forge.local` (personal) + `enrich.forge.local` (public enrichment).

**Out of scope:** team features, enterprise tier, public API, plugin marketplace, arXiv/Wikipedia/Wikidata, supersession, scoring, ranking, recommendations, social, sharing.

---

## 2. Repository layout

```
C:\Users\arjun\Desktop\Forge\
├── SPEC.md                           # this file
├── README.md                         # submission readme
├── forge-personal\                   # user's personal origin
│   ├── package.json
│   ├── next.config.mjs
│   ├── tsconfig.json
│   ├── .env.example
│   ├── forge-schemas\                # single source of truth (JSON Schema)
│   │   ├── tool.input.json
│   │   ├── tool.output.json
│   │   ├── note.json
│   │   ├── edit.json
│   │   ├── enrichment.json
│   │   └── doi.check.json
│   ├── src\
│   │   ├── app\
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # notes index
│   │   │   ├── notes\[id]\page.tsx    # note editor (preventive surface)
│   │   │   ├── drafts\page.tsx       # draft queue
│   │   │   ├── audit\page.tsx        # hash chain + edit log
│   │   │   └── api\
│   │   │       ├── notes\route.ts
│   │   │       ├── notes\[id]\route.ts
│   │   │       ├── notes\[id]\scan\route.ts   # "Run scan now"
│   │   │       ├── notes\[id]\confirm\route.ts
│   │   │       └── edits\[id]\route.ts
│   │   ├── lib\
│   │   │   ├── webmcp\
│   │   │   │   ├── registerTools.ts          # state-aware registerTool calls
│   │   │   │   ├── registerConformantTool.ts # conformance wrapper
│   │   │   │   ├── federation.ts            # getTools({fromOrigins}) client
│   │   │   │   └── executeTool.ts            # executeTool with null branch
│   │   │   ├── trust\
│   │   │   │   ├── firewall.ts              # Ajv strict + projection
│   │   │   │   └── quota.ts                 # per-source rate budgets
│   │   │   ├── domain\
│   │   │   │   ├── classify.ts              # signal combination → card type
│   │   │   │   ├── hash.ts                  # SHA-256 + chain verification
│   │   │   │   └── projection.ts            # source response → note patch
│   │   │   └── store\
│   │   │       ├── notes.ts
│   │   │       ├── edits.ts
│   │   │       ├── doiCache.ts              # global DOI cache
│   │   │       └── sourceQuotas.ts
│   │   ├── components\
│   │   │   ├── NoteEditor.tsx               # debounced preventive check
│   │   │   ├── CitationChip.tsx             # red/amber/green/gray treatment
│   │   │   ├── DraftCard.tsx                # Card 1/2/3 + confirm/reject
│   │   │   ├── AuditTrail.tsx               # hash chain visualization
│   │   │   └── RunScanButton.tsx
│   │   └── worker\
│   │       └── scan.ts                      # overnight job logic
│   ├── tests\
│   │   ├── unit\
│   │   │   ├── classify.test.ts
│   │   │   ├── firewall.test.ts
│   │   │   ├── hash.test.ts
│   │   │   └── doiRegex.test.ts
│   │   ├── integration\
│   │   │   ├── openalex.live.test.ts        # skipped in CI, manual
│   │   │   ├── crossref.live.test.ts        # skipped in CI, manual
│   │   │   └── federation.test.ts
│   │   └── e2e\
│   │       └── demo.spec.ts                 # Playwright, live demo path
│   └── Dockerfile
├── forge-enrich\                     # public enrichment origin
│   ├── package.json
│   ├── next.config.mjs
│   ├── tsconfig.json
│   ├── forge-schemas\                # SAME contracts, reused
│   │   ├── enrichment.json
│   │   └── doi.check.json
│   ├── src\
│   │   ├── app\
│   │   │   ├── layout.tsx
│   │   │   └── api\
│   │   │       ├── tools\route.ts            # WebMCP tool endpoint
│   │   │       ├── enrich\route.ts           # POST /api/enrich
│   │   │       └── verify\route.ts          # POST /api/verify (single DOI)
│   │   ├── lib\
│   │   │   ├── webmcp\
│   │   │   │   ├── registerProviderTools.ts # exposes with exposedTo: forge.local
│   │   │   │   └── providerKit.ts           # 3-tool contract
│   │   │   ├── sources\
│   │   │   │   ├── openalex.ts
│   │   │   │   ├── crossref.ts              # normalizes updated-by + update-to
│   │   │   │   └── classify.ts              # local classify for single DOI
│   │   │   └── cache.ts
│   │   └── cache\
│   │       └── doi-cache.json               # build-time captured responses
│   ├── tests\
│   │   ├── unit\
│   │   └── capture-cache.ts                 # captures live responses at build
│   └── Dockerfile
├── infra\
│   ├── render.yaml                          # two-service blueprint
│   ├── docker-compose.yml                   # local dev
│   └── nginx.conf                           # local CORS + federation setup
├── scripts\
│   ├── capture-cache.ts                     # run once to populate cache
│   ├── seed-notes.ts                        # populate demo vault
│   └── verify-e2e.sh                        # full demo path check
├── .gitignore
├── LICENSE
└── DEVPOST.md                               # submission text
```

---

## 3. Data model (Postgres)

The implemented schema is `infra/sql/001_schema.sql` plus `002_workspace_state.sql`. Mutable workflow state lives in `drafts` and the revisioned `workspace_state.snapshot`. Terminal decisions are inserted into append-only `edit_events` and `audit_events` in the same transaction as the snapshot write. Triggers reject UPDATE/DELETE. `workspace_sessions` stores hashed bearer material with server-side revocation. The historical sketch below is not what the runtime executes.

```sql
-- users (single-user for hackathon, schema supports multi)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- notes
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,                    -- markdown
  content_hash TEXT NOT NULL,            -- SHA-256 of body
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX notes_user_idx ON notes(user_id);

-- edits: append-only, no UPDATE statements
CREATE TABLE edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  prev_hash TEXT NOT NULL,
  new_hash TEXT NOT NULL,
  agent_id TEXT NOT NULL,                -- e.g. 'openai/gpt-4o-mini'
  user_id UUID NOT NULL,                 -- human approver
  card_type TEXT NOT NULL,               -- corroborated | openalex_only | crossref_only | disagree | eoc_only
  draft_payload JSONB NOT NULL,          -- the proposed edit
  source_provenance JSONB NOT NULL,      -- {openalex: {...}, crossref: {...}}
  status TEXT NOT NULL DEFAULT 'pending',-- 'pending' | 'confirmed' | 'rejected'
  confirmed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX edits_note_status_idx ON edits(note_id, status);
-- APPEND-ONLY: no UPDATE allowed on edits except status transition via RPC

-- source quotas
CREATE TABLE source_quotas (
  source TEXT PRIMARY KEY,               -- 'openalex' | 'crossref'
  used INTEGER NOT NULL DEFAULT 0,
  limit INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);

-- DOI cache (global, TTL-bounded)
CREATE TABLE doi_cache (
  doi TEXT PRIMARY KEY,
  status TEXT NOT NULL,                  -- 'ok' | 'retracted' | 'eoc' | 'unknown'
  openalex_response JSONB,
  crossref_response JSONB,             -- projected fields only; raw payload never stored
  classified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL        -- TTL: 24h for ok, 1h for retracted
);
CREATE INDEX doi_cache_expires_idx ON doi_cache(expires_at);

-- audit events
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,              -- 'edit.confirmed' | 'edit.rejected' |
                                         -- 'tool.registered' | 'tool.unregistered' |
                                         -- 'check.performed' | 'consent.granted' |
                                         -- 'firewall.rejected'
  agent_id TEXT,
  user_id UUID,
  resource_id TEXT,                      -- note_id | edit_id | tool_name | doi
  rule_fired TEXT,                       -- 'EXPOSED_TO_WILDCARD' | 'INPUT_SCHEMA_REQUIRED' | ...
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX audit_events_type_idx ON audit_events(event_type, created_at);
```

**No UPDATE on `edits` outside the `confirm_edit` RPC**, which writes one row to `audit_events` and transitions status to `confirmed` atomically.

---

## 4. WebMCP tool surface

### `forge-personal` (8 tools, registered on user's personal origin)

```ts
// READ-ONLY: always registered
list_notes({ since?, tag?, limit? })          → { notes: Note[] }
get_note(note_id)                              → { note: Note, hash_chain: HashLink[] }
search_notes(query)                            → { results: Note[] }
get_drafts({ scope?: 'mine' | 'all' })         → { drafts: Edit[] }

// STATE-AWARE: only registered when a draft is pending OR review is open
propose_note_edit(note_id, draft_payload)      → { draft: Edit }
  // registered when note is open + worker has produced draft
confirm_edit(edit_id)                          → { edit: Edit, note: Note }
  // registered ONLY when review panel is open
reject_edit(edit_id, reason?)                  → { edit: Edit }
  // registered ONLY when review panel is open

// IDEMPOTENT: always registered
create_note({ title, body })                   → { note: Note }
run_scan_now(note_id)                          → { scan_id: Scan }
  // triggers same worker as nightly, scoped to one note
```

### `forge-enrich` (3 tools, exposedTo: `forge-personal`)

```ts
// All read-only, all schema-validated
list_source_kinds()                            → { kinds: SourceKind[] }
  // ['openalex', 'crossref']
enrich({ topic, depth? })                      → { results: EnrichmentResult[] }
  // calls BOTH sources, returns ranked candidates
verify_citation({ doi })                       → { status, sources }
  // single-DOI fast path, returns { status: 'ok'|'retracted'|'eoc'|'unknown', sources }
```

The `verify_citation` tool is the one the editor fires. The `enrich` tool is the one the worker fires. Both share the same source adapters, the same conformance wrapper, the same trust firewall.

---

## 5. The conformance wrapper

Every `registerTool` call goes through `registerConformantTool`. It refuses:

```ts
type ConformanceError =
  | 'EXPOSED_TO_WILDCARD'           // exposedTo contains '*'
  | 'EXPOSED_TO_INSECURE'           // origin is not https:// or localhost
  | 'INPUT_SCHEMA_REQUIRED'         // tool has no inputSchema
  | 'NAME_TOO_LONG'                 // name > 30 chars
  | 'DESCRIPTION_TOO_LONG'          // description > 500 chars
  | 'ANNOTATIONS_MISSING'           // no annotations object
```

The wrapper is the only path to `modelContext.registerTool`. There is no bypass. Every registration attempt is logged to `audit_events`.

---

## 6. The trust firewall

Every response from OpenAlex or CrossRef passes through `firewall.parse`:

```ts
// 1. JSON parse → typed
// 2. Ajv strict validate against forge-schemas/*.json
// 3. Project to internal shape (only the fields we use)
// 4. Reject if any step fails

// A rejected payload is NEVER carried forward.
// Not into a return value, not into a log line, not into an exception message.
// Only the rule that rejected it and the offending field name survive.
```

This applies to:
- Worker responses from OpenAlex
- Worker responses from CrossRef
- Editor responses from `verify_citation`
- Any `enrich` call

The wrapper logs `firewall.rejected` to `audit_events` with rule name and field name only.

---

## 7. State machine

The editor has three states. Tool registration follows the state.

| State | Tools registered |
|---|---|
| `EDITOR_IDLE` | `list_notes`, `get_note`, `search_notes`, `get_drafts`, `create_note`, `run_scan_now` |
| `EDITOR_DRAFT_READY` | Above + `propose_note_edit` |
| `EDITOR_REVIEW_OPEN` | Above + `confirm_edit`, `reject_edit` |

State transitions:
- `EDITOR_IDLE → EDITOR_DRAFT_READY`: worker writes a draft, editor sees it
- `EDITOR_DRAFT_READY → EDITOR_REVIEW_OPEN`: user clicks "Review"
- `EDITOR_REVIEW_OPEN → EDITOR_DRAFT_READY`: user confirms or rejects one draft
- `EDITOR_REVIEW_OPEN → EDITOR_IDLE`: user closes Review panel
- Any state → `EDITOR_IDLE`: signal abort fires, all tools unregister

Each transition is logged to `audit_events` with `event_type: 'tool.registered' | 'tool.unregistered'`.

---

## 8. Signal classification

`classify.ts` produces one of four statuses per DOI check:

```ts
type Status = 'ok' | 'retracted' | 'eoc' | 'unknown';

function classify(openalex, crossref): { status, card_type?, sources } {
  // OpenAlex retracted + any Crossref retraction event
  //                        → status: 'retracted', card_type: 'corroborated'
  // openalex retracted, crossref silent
  //                        → status: 'retracted', card_type: 'openalex_only'
  // openalex retracted, crossref EOC only (no retraction event)
  //                        → status: 'eoc', card_type: 'disagree'
  // crossref EOC (from updated-by or update-to), openalex clean
  //                        → status: 'eoc', card_type: 'eoc_only'
  // crossref retraction, openalex clean
  //                        → status: 'retracted', card_type: 'crossref_only'
  // both clean            → status: 'ok'
  // any timeout/error     → status: 'unknown'
  // Crossref may contain event history; severity is retraction > EOC.
}
```

The editor uses `status` directly. The worker uses `card_type` to render the right draft card.

---

## 9. DOI regex

```ts
const DOI_REGEX = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;
```

Match starts at end of typed string. Fires only when full DOI is typed. No partial fires.

The DOI cache lookup is global, keyed by lowercased DOI string. TTL: 24h for `ok`, 1h for `retracted`/`eoc`. Stale entries are not deleted; they are re-validated on the next check.

---

## 10. Visual treatment (locked)

| Signal | Editor color | Editor treatment | Draft badge |
|---|---|---|---|
| `status: 'retracted'`, `card_type: 'corroborated'` | **Red** | strike-through + red chip + save warning | **Red** badge |
| `status: 'retracted'`, `card_type: 'openalex_only'` | **Red** | strike-through + red chip + save warning | **Red** badge |
| `status: 'retracted'`, `card_type: 'crossref_only'` | **Red** | strike-through + red chip + save warning | **Red** badge |
| `status: 'eoc'`, `card_type: 'disagree'` | **Amber** | dotted underline + amber chip, no save warning | **Amber** badge |
| `status: 'eoc'`, `card_type: 'eoc_only'` | **Amber** | dotted underline + amber chip, no save warning | **Amber** badge |
| `status: 'ok'` | **Green** | green dot only | — |
| `status: 'unknown'` | **Gray** | gray dot only | — |
| Draft pending | — | — | **Blue** badge (never in editor) |

**Stack order in draft card:** blue "pending" wrapper is the outer badge; red/amber integrity badge is inside the card content. A draft is always pending before it's confirmed; once confirmed, only the integrity badge persists in the audit log.

---

## 11. Build sequence (6 days)

### Day 1 — Personal origin foundation
- `forge-personal/` scaffold: Next.js 16, React 19, TS strict, Postgres (Neon), R2 (or local fs for dev)
- `forge-schemas/*.json` — all 6 schema files
- `src/lib/webmcp/registerConformantTool.ts` — wrapper
- `src/lib/trust/firewall.ts` — Ajv strict + projection
- `src/lib/domain/classify.ts` + `hash.ts` + `projection.ts`
- `src/lib/store/{notes,edits,doiCache,sourceQuotas}.ts`
- `src/lib/webmcp/registerTools.ts` — register read-only tools
- `src/app/page.tsx` — notes index (read-only)
- `src/app/notes/[id]/page.tsx` — note view (read-only)
- **Acceptance:** Open ChatGPT in-app browser, ask agent to list notes. Agent calls `list_notes`. Returns seeded notes.

### Day 2 — Editor + state machine + preventive check
- `src/lib/webmcp/federation.ts` — `getTools({fromOrigins})` client
- `src/lib/webmcp/executeTool.ts` — executeTool with null branch handling
- `src/components/NoteEditor.tsx` — debounced editor with DOI regex
- `src/components/CitationChip.tsx` — red/amber/green/gray treatment
- State machine wiring: IDLE → DRAFT_READY → REVIEW_OPEN transitions
- `confirm_edit` and `reject_edit` registered only in REVIEW_OPEN
- `src/app/api/notes/[id]/confirm/route.ts` — atomic RPC
- **Acceptance:** Type a retracted DOI. Within 1s, strikethrough + red chip + save warning. Open Review. `confirm_edit` appears in `document.modelContext`. Confirm. Note updates. Hash chain extends.

### Day 3 — Enrichment origin
- `forge-enrich/` scaffold: Next.js, TS strict
- `src/lib/sources/openalex.ts` — OpenAlex adapter (DOI lookup, `is_retracted`)
- `src/lib/sources/crossref.ts` — CrossRef adapter (DOI lookup, normalize `updated-by` + `update-to`)
- `src/lib/sources/classify.ts` — local classify
- `src/lib/webmcp/registerProviderTools.ts` — register with `exposedTo: ['https://forge.local']`
- `src/lib/webmcp/providerKit.ts` — 3-tool contract
- `src/app/api/verify/route.ts` — `POST /api/verify` (called by editor's preventive check via federation)
- `src/app/api/enrich/route.ts` — `POST /api/enrich` (called by worker)
- `src/cache/doi-cache.json` — captured live projected responses for the verified acceptance DOIs (Gautret, Lesné history, OpenAlex-only, EOC-only, clean)
- **Acceptance:** Open editor. Type retracted DOI. Network tab shows request to `https://enrich.forge.local/api/verify` through federation, not to same-origin. Response is JSON-schema-validated.

### Day 4 — Worker + drafts + audit + tests
- `src/worker/scan.ts` — overnight job, idempotent
- `src/app/api/notes/[id]/scan/route.ts` — `POST /api/notes/:id/scan` (Run scan now)
- `src/components/DraftCard.tsx` — five classifier card types; only verified live cases are seeded
- `src/app/drafts/page.tsx` — drafts queue
- `src/components/AuditTrail.tsx` — hash chain visualization
- `src/app/audit/page.tsx` — audit log
- `tests/unit/{classify,firewall,hash,doiRegex}.test.ts`
- `tests/e2e/demo.spec.ts` — Playwright live demo path
- **Acceptance:** Click Run scan now on a note. Within 10s, draft card appears with correct card type. Open Review. Confirm. Audit row writes. Hash chain extends visibly.

### Day 5 — UI polish
- shadcn/ui components
- Framer Motion transitions on confirm
- Empty states, loading states, error states
- Dark/light theme toggle
- Mobile responsive (the demo will likely be shown on a laptop, but verify)
- **Acceptance:** Demo video can be recorded cleanly.

### Day 6 — README, demo, submission
- README.md with console proofs
- DEVPOST.md with the three demo DOIs and click-through verifications
- 3-minute demo video
- Deploy both origins
- Submit

---

## 12. Acceptance tests

### 12.1 WebMCP leverage (must pass in console)

| # | Test | Expected |
|---|---|---|
| 1 | `getTools({ fromOrigins: ['https://enrich.forge.local'] })` | Resolves to 3 tools |
| 2 | `getTools({ fromOrigins: ['https://attacker.example'] })` | Returns `[]` |
| 3 | Call `verify_citation({ doi: 'not-a-doi' })` | Rejected by Ajv, returns typed error |
| 4 | Call `verify_citation` directly with malformed response mock | Trust firewall rejects, no free-form text leaks |
| 5 | Inspect `document.modelContext` on note page (no Review open) | `confirm_edit` not present |
| 6 | Open Review, inspect `document.modelContext` | `confirm_edit` now present |
| 7 | Close Review, inspect `document.modelContext` | `confirm_edit` unregistered |
| 8 | Try `registerTool` with `exposedTo: ['*']` | Refused with `EXPOSED_TO_WILDCARD` |
| 9 | Try `registerTool` without `inputSchema` | Refused with `INPUT_SCHEMA_REQUIRED` |
| 10 | `forge-schemas/` directory listing | One source of truth, all 6 files |
| 11 | Network tab on editor with retracted DOI typed | Request goes to `https://enrich.forge.local`, not same-origin |
| 12 | Network tab on overnight worker log | Same enrichment origin |

### 12.2 Execution (the demo path)

| # | Test | Expected |
|---|---|---|
| 13 | Open editor, type `10.1016/j.ijantimicag.2020.105949` | Within 1s, citation is struck through, red chip appears, save button shows warning |
| 14 | Open editor, type a clean DOI (e.g. `10.1038/nature14539`) | Within 1s, green dot appears, no treatment |
| 15 | Open editor, type `10.1038/nature04533` (Lesné) | Red treatment: OpenAlex retracted + Crossref history contains EOC and later retraction; retraction wins while both events remain visible in provenance |
| 15a | Open editor, type `10.1177/1475090218792382` (real EOC-only case) | Within 1s, amber chip appears, no save warning; OpenAlex clean + Crossref `updated-by` EOC is visible |
| 16 | Type the same retracted DOI twice | Second check returns from cache (visible in network tab) |
| 17 | Open note, click "Run scan now" | Within 10s, draft card appears with correct card type |
| 18 | Open drafts panel | Blue "pending" badges visible on pending drafts |
| 19 | Click Review on a draft | Confirm/reject buttons appear |
| 20 | Click Confirm | Note updates, hash chain extends visibly, audit row writes |
| 21 | Open audit page | Edit appears with prev_hash → new_hash chain, all provenance URLs clickable |
| 22 | Open DevTools, fetch a known retracted DOI directly | DOI redirects to retraction page |
| 23 | Open DevTools, fetch `is_retracted` for the 3 seed DOIs | All three match expected status |

### 12.3 Color and treatment (must be visually locked)

| # | Test | Expected |
|---|---|---|
| 24 | Gautret typed → editor treatment | **Red** strike-through + red chip + save warning |
| 25 | Clean DOI typed → editor treatment | **Green** dot, no treatment |
| 26 | Lesné typed → editor treatment | **Red** strike-through + red chip + save warning; provenance preserves both EOC and retraction events |
| 26a | EOC-only DOI typed → editor treatment | **Amber** dotted underline + amber chip, no save warning |
| 27 | OpenAlex-only retracted (`10.1038/nrg2336`) → editor treatment | **Red** strike-through + red chip + save warning |
| 28 | Timeout → editor treatment | **Gray** dot, no treatment |
| 29 | Draft pending → badge | **Blue** badge only |
| 30 | Corroborated draft → badge | **Red** badge inside card |
| 31 | Disagree draft → badge | **Amber** badge inside card |

### 12.4 Performance and limits

| # | Test | Expected |
|---|---|---|
| 32 | Editor with 100 typed DOIs in 10 seconds | Debounced to ~10 checks, quota respected |
| 33 | Global DOI cache hit rate | Same DOI twice → second is cache hit |
| 34 | Source quota at 95% | Source deprioritized or skipped |
| 35 | Both sources timeout | Editor shows gray, save proceeds |

---

## 13. Anti-goals (do not do)

- Do not add a fourth source.
- Do not add Wikipedia / arXiv / Wikidata.
- Do not add team / enterprise / public API features.
- Do not add supersession / "find a replacement" logic.
- Do not add scoring / ranking / recommendations.
- Do not let the editor call a same-origin `/api/verify` shortcut — must go through federation.
- Do not bypass the conformance wrapper.
- Do not bypass the trust firewall.
- Do not UPDATE rows in `edits` table — use the `confirm_edit` RPC only.
- Do not block the editor on a network timeout.
- Do not surface retractions as amber. Corroborated, OpenAlex-only, and CrossRef-only retractions are red; disagreement and EOC-only are amber.
- Do not put the same color on "draft pending" and any integrity signal — blue is for pending only.
- Do not use synthetic data anywhere in the demo.

---

## 14. Environment

```bash
# Local dev
docker compose up -d                    # postgres + nginx
cd forge-personal && npm run dev       # :3000
cd forge-enrich && npm run dev          # :3001
# Editor configured to call enrich at http://localhost:3001

# Capture cache (run once)
npm run capture-cache -- --dois "10.1016/j.ijantimicag.2020.105949,..."

# Seed notes
npm run seed-notes

# Tests
npm test                                # unit + integration
npm run test:e2e                        # Playwright live demo

# Deploy
render blueprint launch                 # two-service blueprint
```

---

## 15. End

This spec is what gets built. The pitch is the why; the acceptance tests are the proof; the anti-goals are the guardrail. Anything not in this document is out of scope.
