# FORGE — Audit, Loopholes, and Vision Refinement

Audit date: 2026-09-02
Target: [The WebMCP Challenge](https://webmcp.devpost.com/) — deadline 2026-09-03 1:00 PM PDT
Auditor scope: full repository, live API verification, WebMCP spec conformance, product/vision critique

---

## 0. Executive verdict

**The good news, stated plainly:** your central architectural bet is correct and rare. I verified against the [WebMCP spec](https://webmachinelearning.github.io/webmcp/) and [Chrome's docs](https://developer.chrome.com/docs/ai/webmcp) that `getTools({fromOrigins})`, `executeTool()`, and `registerTool(..., {exposedTo})` are all real, current API. Cross-origin tool federation is the *deepest* part of the WebMCP spec, and the overwhelming majority of hackathon entries will be single-origin `registerTool` wrappers around a form. You built the two-sided handshake. That is a genuine "WebMCP Leverage" moat.

**The bad news:** the repository does not yet deliver what the README claims, and several of the gaps are exactly the ones a technical judge will find first. The three most damaging are:

1. **The trust firewall — your headline thesis — is not applied on the personal origin at all.** Provider data crosses the boundary unvalidated.
2. **The `/proof` page, your evidence surface, displays a hardcoded simulation of the tool registry instead of reading the real one.**
3. **The append-only audit integrity claim is contradicted by the storage layer.** The tables with the append-only triggers are never written to; everything lives in one mutable JSONB blob that is overwritten wholesale on every save.

None of these are hard to fix. All three are currently *load-bearing claims in your README*, which is what makes them severe rather than cosmetic.

### Scored against the four published criteria

| Criterion | Current | Ceiling after fixes | Gap |
|---|---|---|---|
| **WebMCP Leverage** | 7/10 | 10/10 | Real federation, but proof surface is faked and `packages/core` WebMCP layer is dead code |
| **Execution** | 5/10 | 9/10 | Nothing committed to git; no live URL; no origin trial token; integrity claims unbacked |
| **Potential Impact** | 7/10 | 9/10 | Real problem, real data — but the prompt-injection story is under-told |
| **Creativity & Ambition** | 8/10 | 10/10 | Review-gated tool registration is a genuinely novel idea that you are badly under-selling |

---

## P0 — Submission blockers and credibility breaks

### P0-1. Nothing is committed. There is no repository to submit.

`git log` fails: branch `master`, **zero commits**. All 1,290 files are untracked. The rules require a **public repo with an OSS license visible in the About section**.

Worse: `.gitignore` contains `.next/`, which does **not** match `.next-acceptance/`, `.next-prod2/`, `.next-prod3/`. Those directories exist and account for **889 of the 1,290 untracked files**. A naive `git add -A` commits ~900 build artifacts.

```bash
printf '.next*/\n*.tsbuildinfo\ntest-results/\n' >> .gitignore
git rm -r --cached . 2>/dev/null; git add -A && git status --short | wc -l   # expect ~120, not 1290
```

Then commit, push, make public, confirm MIT shows in the GitHub About sidebar.

---

### P0-2. The trust firewall does not exist on the personal origin

This is the most serious finding, because it is the exact claim your README leads with:

> "validates constrained source projections" … "Raw provider documents are not returned to the agent."

**Reality:** `forge-enrich` runs the Ajv firewall on the way *in* from OpenAlex/Crossref ([crossref.ts:25](forge-enrich/src/lib/sources/crossref.ts:25), [openalex.ts:28](forge-enrich/src/lib/sources/openalex.ts:28)) — good. But when that result crosses into `forge-personal`, the only validation is a hand-rolled shape check in [federation.ts:16](forge-personal/src/lib/webmcp/federation.ts:16), and `sources` is waved through untouched:

```ts
return cardType ? { status, cardType, sources: sources as Record<string, unknown> } : ...
```

`SPEC.md §6` explicitly lists "Editor responses from `verify_citation`" as firewall-covered. `ADR-004` says one verification service governs every surface. Neither is true.

**Why it matters beyond pedantry.** The whole premise of a *cross-origin trust boundary* is that the consuming origin does not trust the providing origin. Right now `forge-personal` trusts `forge-enrich` completely. If a judge asks "what happens if the enrichment origin is compromised?", the honest answer today is "arbitrary JSON enters the personal workspace, gets written into audit provenance, and gets rendered."

**Concrete downstream sink.** [ForgeProvider.tsx:117](forge-personal/src/components/ForgeProvider.tsx:117) does `String(value.source_url)` on that unvalidated object and stores it as provenance; [ReviewDrawer.tsx](forge-personal/src/components/ReviewDrawer.tsx) renders it as `<a href={url}>`. A hostile provider returning `source_url: "javascript:…"` reaches an href sink. React will likely neutralize it — but *relying on framework behavior for a security boundary you explicitly claim to enforce yourself* is precisely the gap. Validate the scheme and host against an allowlist (`https:` + `api.openalex.org` / `api.crossref.org`).

**Fix:** export an Ajv `verificationResultSchema` from `packages/core`, compile it once in `forge-personal`, and run every federated response through it before it touches state. Log rejections as `firewall.rejected` with rule code + JSON pointer only. This turns your biggest liability into your headline demo (see §Vision).

---

### P0-3. `/proof` shows a hardcoded fake of the tool registry

[ProofPanel.tsx:13](forge-personal/src/components/ProofPanel.tsx:13):

```ts
const registered = state === 'EDITOR_IDLE' ? PERSONAL_TOOL_NAMES.slice(0, 6) : PERSONAL_TOOL_NAMES.slice(0, 7);
```

Your README says `/proof` "exposes runtime transport kind, **registered tool names**, … and review-gated tool lifecycle without requiring hidden narration."

It does not. It slices a constant array. It never calls `document.modelContext.getTools()` for the same-origin manifest. It also cannot show `EDITOR_REVIEW_OPEN` because `ProofPanel` never reads `review` from context — so the single most impressive behavior in the project (confirm_edit materializing on human intent) is **invisible on the page built to prove it**.

Google ships a [Model Context Tool Inspector extension](https://developer.chrome.com/docs/ai/webmcp). A judge using it will see the real registry next to your claimed one. If they ever disagree, your credibility on every other claim evaporates.

**Fix:** make it real and make it live.

```ts
const [tools, setTools] = useState<string[]>([]);
useEffect(() => {
  const read = async () => setTools(((await document.modelContext?.getTools?.() ) ?? []).map(t => t.name));
  void read();
  document.modelContext?.addEventListener?.('toolchange', read);
  return () => document.modelContext?.removeEventListener?.('toolchange', read);
}, []);
```

`toolchange` is in the spec IDL. Wiring it means the proof page updates *live* as you open the review drawer. That is a 3-second, undeniable demo beat.

---

### P0-4. The append-only integrity claim is contradicted by the storage layer

`ADR-001` and the README state that decisions are immutable and "Database triggers reject UPDATE and DELETE on both event tables."

The triggers in [001_schema.sql](infra/sql/001_schema.sql) are real. **The tables they protect are never read or written by any code.** I grepped: the only SQL the application executes touches `workspace_state`, and only in [workspaceStore.ts](forge-personal/src/lib/server/workspaceStore.ts).

Every note, draft, audit event, and hash chain lives inside **one `jsonb` column, in one row**, replaced wholesale on every save:

```sql
UPDATE workspace_state SET revision = revision + 1, snapshot = $3::jsonb ...
```

So the audit log is a JSON array inside a mutable cell. Any bug — or any client — can rewrite history and the revision counter simply increments. `001_schema.sql` is dead SQL that exists to make a claim the runtime does not honor.

This is the finding I would most expect a sharp judge to catch, because the README invites the scrutiny.

**Two honest paths:**

- **(A) Make it true.** Write `audit_events` and `edit_events` as real INSERTs alongside the snapshot write, inside one transaction. The triggers then actually protect the audit trail, and `/proof` can show a row count that only ever goes up. ~60 lines.
- **(B) Make the claim match.** Delete `001_schema.sql`, and rewrite ADR-001 to say "immutability is enforced in the domain layer and by hash-chain verification, not by the database." Weaker story, but honest.

Take (A). It is the difference between "audit theater" and an audit trail, and it is one evening of work.

Related: **`workspace_sessions` (plan Gate 1, item 3 — "hashed bearer material, expiry, rotation") was never implemented.** Sessions are stateless HMAC tokens ([auth.ts:40](forge-personal/src/lib/server/auth.ts:40)) with **no revocation path**. A leaked token is valid for its full 12 hours with no way to kill it. Either implement the table or strike the rotation claim from the plan.

---

### P0-5. No origin trial token — the live URL will not have WebMCP for judges

The rules require "a working live URL accessible via ChatGPT browser or Chrome with WebMCP enabled." I grepped the entire tree: **no origin trial token, no `<meta http-equiv="origin-trial">`, nothing.**

Without a token on stable Chrome, `document.modelContext` is `undefined`, `createCitationTransport` falls to `kind: 'compatibility'`, and your banner truthfully announces **"Compatibility transport"** to a judge scoring *WebMCP Leverage*. You would be showing them a postMessage app.

**Fix — do all three:**
1. Register both deployed origins for the [Chrome 149–156 WebMCP origin trial](https://developer.chrome.com/origintrials) and inject tokens via `metadata.other` in both `layout.tsx`. **Both origins need one** — enrich registers tools, personal calls `getTools`.
2. Put a visible one-line banner on `/` and `/proof`: *"WebMCP not detected — enable `chrome://flags/#enable-webmcp-testing` and reload."* Do not make a judge guess why they are on the fallback path.
3. Say it in the Devpost description and show the flag being flipped in the first 15 seconds of the video.

---

### P0-6. No `navigator.modelContext` fallback

The namespace migrated: Chrome 146–149 shipped `navigator.modelContext`; Chrome 150 deprecated it for `document.modelContext`. The origin trial spans **149 through 156**, so judges may land on either. You only check `document.modelContext` ([ForgeProvider.tsx:94](forge-personal/src/components/ForgeProvider.tsx:94), [ProviderClient.tsx:19](forge-enrich/src/app/provider/ProviderClient.tsx:19), [ProofPanel.tsx:16](forge-personal/src/components/ProofPanel.tsx:16)).

```ts
export const modelContext = () =>
  (globalThis as any).document?.modelContext ?? (globalThis as any).navigator?.modelContext;
```

One helper, three call sites. Cheap insurance against a judge on the wrong Chrome silently seeing your fallback.

---

### P0-7. `forge-personal` sets no security headers, including origin isolation

[forge-enrich/next.config.mjs](forge-enrich/next.config.mjs) correctly sets `Origin-Agent-Cluster: ?1` and `Permissions-Policy: tools=(self)`.
[forge-personal/next.config.mjs](forge-personal/next.config.mjs) sets **no headers at all.**

The spec states WebMCP requires origin-isolated documents and is disabled under `Origin-Agent-Cluster: ?0` or `document.domain` use. `getTools()` also rejects with `NotAllowedError` when the caller lacks the `tools` permissions-policy feature. Your *consumer* origin is the one calling `getTools` — it needs the same treatment as the provider.

Mirror the enrich header block into personal, and verify the enrich `Permissions-Policy` still permits the delegated case when embedded under `allow="tools"` (the `tools=(self)` + container-policy interaction is the one thing here I could not verify without a live browser — **test it explicitly before submitting**).

---

## P1 — High severity

### P1-1. `packages/core/src/webmcp/*` is dead code — including its 39 tests

`forge-personal` declares `@forge/core` as a dependency and **imports nothing from it**. Only `forge-enrich` uses core, and only for `firewall` / `classify` / `doi`.

That means `discover.ts`, `execute.ts`, `register.ts`, `transport.ts` — roughly 350 lines including the genuinely clever *argument-encoding latch* and the *capability probe that refuses to claim WebMCP until it actually finds a tool* — **never run in the product**. Their tests pass and prove nothing about shipped behavior.

Meanwhile `forge-personal` reimplements weaker versions of the same things:

| Concern | Core (unused) | Personal (shipped) | Enrich (shipped) |
|---|---|---|---|
| Conformance | `validateToolRegistration` — 8 codes, secure-origin parsing, budget warnings | `registerConformantTool.ts` — 5 checks, no origin validation | inline in `providerKit.ts` |
| Transport | `executeWebMcpTool` — latch, abort, timeout, navigation | `federation.ts` — try/catch retry, **no timeout** | n/a |
| DOI normalize | strict, returns `null` | lowercase + strip, **no validation** | wraps core, throws |
| Hash chain | `previousHash/contentHash/linkHash`, 64-zero genesis | different shape, `'GENESIS'` string literal | n/a |

This directly violates your own `ADR-004`. It is also a *scoring* problem: the most sophisticated WebMCP code you wrote is the code that does not execute.

**Fix:** delete `forge-personal/src/lib/webmcp/registerConformantTool.ts` and the bespoke transport in `federation.ts`; import `registerConformantTool`, `selectTransport`, and `executeWebMcpTool` from `@forge/core`. Delete `forge-personal/src/lib/doi/checker.ts`'s `normalizeDoi` in favour of core's. You will *delete* code, gain a timeout you currently lack, and make 39 passing tests actually mean something.

### P1-2. Tool registry churns on every state change — agents get aborted mid-call

The registration effect ([ForgeProvider.tsx:125-139](forge-personal/src/components/ForgeProvider.tsx:125)) depends on `snapshot`, `refresh`, `runScan`, `confirm`, `reject`. `refresh` is recreated whenever `persistenceMode` changes; `snapshot` is a **fresh object on every save, scan, and keystroke-triggered persist**.

Every one of those tears down all nine tools (`controller.abort()`) and re-registers them. An agent that called `run_scan_now` will have the very tools it is mid-conversation with ripped out from under it, and `toolchange` fires constantly. `registerTool` returns a Promise that is never awaited, so cleanup can race ahead of registration.

**Fix:** depend only on `[repo, state]` where `state` is the derived `EditorState` string. Keep the action closures in a `useRef` updated by a separate effect. Await registration before allowing abort.

### P1-3. Enrichment API is unauthenticated, unlimited, and leaks memory

`POST /api/verify` and `POST /api/scan` are public, uncapped, and unmetered. `scan` accepts 50 DOIs per call with no limit on call rate.

[cache.ts:3](forge-enrich/src/lib/cache.ts:3) — `VerificationCache.entries` is a `Map` that is **never evicted**. Expired entries are skipped on read but never deleted. Unbounded unique DOIs → unbounded heap → OOM.

Combined: anyone can use your deployed service as a free, anonymous proxy to hammer OpenAlex and Crossref *from your IP*, and crash it. Crossref throttles by User-Agent; you send a single shared `mailto`. Expect to be rate-limited or blocked mid-demo.

**Fix:** LRU cap (~5k entries) + periodic sweep; IP+DOI token bucket returning `429` with `Retry-After`; cap `scan` body size. This is plan Gate 2, still entirely unimplemented — no rate limiting, CSP, HSTS, or structured logging exists anywhere in the tree.

### P1-4. `compatibilityPostMessage` amplifies every check ~16×

[federation.ts:36](forge-personal/src/lib/webmcp/federation.ts:36) sends the request, then re-sends **every 250 ms for 4 s**. Each message causes the provider frame to fire a fresh `POST /api/verify`. That is up to 16 requests per DOI check. Provider-side single-flight collapses the upstream fan-out, but you are still self-DDoSing the fallback path — the exact path judges land on without a trial token.

**Fix:** handshake once (`ready` message from the frame on mount), or exponential backoff capped at 3 attempts.

### P1-5. Federated `executeTool` has no timeout

`ForgeProvider.verify` → `federation.verify` creates an `AbortController` and **never aborts it**. If the provider frame hangs, the editor's citation lens hangs forever. `SPEC.md §12.4 test 35` requires "both sources timeout → editor shows gray, save proceeds." That is currently unenforceable client-side.

Core's `executeWebMcpTool` already implements exactly this (2 s default, explicit `timeout`/`aborted`/`navigated` states). See P1-1 — adopting core fixes this for free.

### P1-6. Personal DOI cache never expires

[checker.ts:5](forge-personal/src/lib/doi/checker.ts:5) — `GLOBAL_CACHE` is a module-level `Map` with no TTL and no eviction. `SPEC.md §9` mandates 24 h for `ok`, 1 h for `retracted`/`eoc`.

**Consequence for the demo:** a DOI checked once is cached forever in that tab. If you demo a retraction, then want to show a re-check, the network never fires again. Also means a retraction discovered *after* first check is never surfaced — which contradicts the product's entire "revisits existing notes when source status changes" promise.

### P1-7. Repeated scans stack duplicate integrity notices

[ForgeProvider.tsx:118](forge-personal/src/components/ForgeProvider.tsx:118) appends a fixed string to the note body. `proposeEdit` dedupes only against *pending* drafts with an identical body. Once a draft is confirmed, the note already contains the notice — the next scan appends a **second** identical notice, and a third, forever.

**Fix:** skip proposal when `note.body` already contains the notice marker; or key the notice by DOI and make application idempotent.

### P1-8. Stale-draft and conflict failures are silent

`confirmEdit` throws `'Draft is stale'` ([repository.ts:71](forge-personal/src/lib/store/repository.ts:71)). `ForgeProvider.confirm` does not catch it — the drawer just does nothing, no toast, no message. Same for `persistenceMode === 'conflict'`: the banner says "Reload before editing again" but nothing *prevents* editing, and every subsequent change is silently dropped because `refresh` only persists when mode is `'server'`. **A user can type for ten minutes into a workspace that is no longer saving.**

---

## P2 — Medium

- **`get_note` returns `{ note: undefined }`** for unknown IDs instead of a typed error. Agents will hallucinate around `undefined`.
- **`confirm_edit` / `reject_edit` return `undefined`.** `SPEC.md §4` specifies `→ { edit, note }`. An agent gets no confirmation of what it just did. Return the updated draft + note.
- **`propose_note_edit` hardcodes `cardType: 'corroborated'`** ([ForgeProvider.tsx:134](forge-personal/src/components/ForgeProvider.tsx:134)) regardless of actual signal — an agent-proposed edit always renders a red badge. Actively misleading.
- **Nine tools have `annotations: { readOnlyHint }` only.** The spec supports `destructiveHint` / `idempotentHint`. `confirm_edit` is your one consequential write and it is not annotated as such — a missed opportunity to *show* you understand the annotation model.
- **Negative-origin proof is trivially true.** `getTools({fromOrigins:['https://attacker.example']})` returns `[]` because that origin is not in the frame tree at all — it proves nothing about `exposedTo`. **Much stronger:** add a second iframe from a third origin whose provider registers a tool with `exposedTo` *excluding* the personal origin, and show `getTools` returns zero for it while returning three for enrich. *That* demonstrates the handshake.
- **`registerPersonalTools` throws synchronously inside a loop** — one bad tool silently prevents all subsequent registrations.
- **Every hash link stores the full note body** ([types.ts:39](forge-personal/src/lib/domain/types.ts:39)). The entire revision history is duplicated into the snapshot and re-serialized to Postgres on every save. Store the content hash, not the content.
- **The whole workspace is one row keyed `'personal'`.** No multi-user path, and `workspaceId` is never derived from the session.
- **E2E covers ~3 of the plan's 10 acceptance scenarios.** No gray/timeout, no OpenAlex-only provenance label, no negative-origin assertion, no reload-persistence assertion. Plan Gate 3 is ~30% done.
- **CI never runs Playwright.** [ci.yml](.github/workflows/ci.yml) runs unit/typecheck/build/verify-sources only. Your one integration test is not enforced.
- **CI depends on live third-party APIs.** `npm run verify:sources` calls OpenAlex and Crossref on every push — a flaky upstream turns your repo red during judging. Make it a scheduled job, not a PR gate.
- **`globals.css` is a single 1-line minified file.** Judges do read repos.
- **`verification.ts`, `cache.ts`, `cors.ts` are near-minified**, unlike the rest of the codebase. Reads as machine-generated and undermines the craft signal the rest of the repo sends.

---

## P3 — Polish

- `README` "Run locally" omits `DATABASE_URL` / `FORGE_ACCESS_KEY_SHA256` setup, so a fresh clone lands in local-only mode with no explanation of how to reach the durable path you are proud of.
- No `docs/PRODUCTION_READINESS.md` (plan Gate 4.7).
- `infra/render.yaml` is written but unused; `docker-compose.yml` has no app services.
- `SPEC.md` still describes `forge-schemas/*.json` as "one source of truth" — those six files do not exist; schemas are inline TS.
- `forge-enrich` uses `node --test` while the others use Vitest — three runners for one repo.
- `DEVPOST.md` referenced in `SPEC.md §2` does not exist.

---

## Vision: what to sharpen

### Your real thesis is better than the one you are pitching

You are currently pitching **"a citation integrity tool that uses WebMCP."** The tool is the noun and WebMCP is the adjective. That framing caps you at "nice vertical app."

Your actual demonstrated insight is sharper:

> **The WebMCP tool registry is an access-control surface, not just an API surface.**

FORGE proves three things a server-side MCP server structurally *cannot* do:

1. **Capability that exists only while a human is looking at the thing being authorized.** `confirm_edit` is not permission-checked — it is *not registered*. The agent cannot call it, cannot see it, cannot be tricked into it. Consent is expressed as registry state, not as a policy check. **This is the best idea in your project and it is currently a footnote.**
2. **Browser-brokered cross-origin delegation.** `exposedTo` ∧ `fromOrigins` means the user's private notes never reach the enrichment origin, and the enrichment origin never learns what is in a note. The browser is the referee. No server-side MCP has this boundary.
3. **A data-flow constraint at the trust boundary.** Untrusted bibliographic prose is projected to a closed schema before it can enter the agent's context — a *structural* answer to indirect prompt injection, not a filter.

Point 3 is the most timely and impactful angle in the entire project, and it is currently your **weakest implementation** (P0-2). Fix the firewall and it becomes your headline.

### Reframed pitch

> Agents are getting write access to our notes, and the sources they read are adversarial. FORGE shows what a *consentful* agent boundary looks like on the web: private data stays on one origin, untrusted sources are projected to a closed schema on another, the browser brokers between them, and the one irreversible action does not exist as a callable tool until a human is looking at it.

Citation integrity stops being the product and becomes the *proof case* — a domain where being wrong is measurable, the data is public, and nobody can accuse you of a toy.

### The demo is the biggest missed opportunity

Right now the demo is **a human types a DOI and sees red.** That is a lookup, and it is scored under *Execution*, not *WebMCP Leverage*. The agent barely appears.

Judges are scoring "can an agent complete a task faster and more accurately." Show the agent hitting your wall:

> **"Check every citation in my vault and clean up whatever is compromised."**
>
> 1. Agent calls `list_notes` → 5 notes.
> 2. Agent calls `run_scan_now` on each → federated `verify_citation` fires cross-origin to enrich. *Network tab: requests go to the enrichment origin, not same-origin.*
> 3. Agent calls `get_drafts` → 3 pending, correctly classified.
> 4. Agent tries to apply them — **and cannot.** `confirm_edit` is not in `document.modelContext`. Show the Tool Inspector: six tools.
> 5. Human clicks **Review**. Tool Inspector updates live: **nine tools.** `confirm_edit` now exists.
> 6. Human confirms. Hash chain extends. Audit row appends.
> 7. Human closes review. `confirm_edit` disappears.

Beat 4 is your money shot: **an agent that wanted to act, and structurally could not.** Nobody else at this hackathon will have that frame. Put it at 0:45 of a 3-minute video, on screen, with the inspector visible.

Then land the second punch: return a poisoned `verify_citation` payload with injected instructions in a title field, and show the firewall rejecting it with a rule code and JSON pointer while the note stays clean. Two beats, both unique, both impossible server-side.

### Scope discipline: keep saying no

Your `SPEC.md §13` anti-goals are excellent and you should not relax them. Do not add a third source, recommendations, or scoring. The judges reward depth on WebMCP, not feature count. Every hour goes into making the three claims above *true and visible*, not into new surface area.

---

## Ordered work plan

**Tier 1 — do these or the submission underperforms regardless of everything else**
1. `.gitignore` fix → commit → push → public repo with visible MIT (P0-1)
2. Origin trial tokens on both origins + "WebMCP not detected" banner (P0-5)
3. `navigator.modelContext` fallback helper (P0-6)
4. Security headers + `Origin-Agent-Cluster: ?1` on personal; **live-verify the `allow="tools"` delegation** (P0-7)
5. Deploy both origins, HTTPS, exact origins configured both directions

**Tier 2 — makes your claims true**
6. Ajv firewall on federated responses + provenance URL allowlist (P0-2)
7. `/proof` reads real `getTools()` + `toolchange` listener, shows `EDITOR_REVIEW_OPEN` (P0-3)
8. Real `audit_events` / `edit_events` INSERTs, or strike the claim (P0-4)
9. Adopt `@forge/core` transport + conformance; delete the duplicates (P1-1)

**Tier 3 — robustness a judge might poke**
10. Stop the registry churn (P1-2)
11. Rate limits + LRU cache cap on enrich (P1-3)
12. `executeTool` timeout; postMessage amplification (P1-4, P1-5)
13. Personal cache TTL; idempotent scan; surface stale/conflict errors (P1-6, P1-7, P1-8)

**Tier 4 — presentation**
14. Rewrite README around the three structural claims
15. `DEVPOST.md` + 3-min video following the demo script above
16. Real negative-origin proof via a third origin (P2)
17. Un-minify `verification.ts` / `cache.ts` / `cors.ts` / `globals.css`

---

## Verified-working baseline (do not regress)

Confirmed live on 2026-09-02:

- **87 tests pass** — 39 core, 32 personal, 16 enrich. Zero failures.
- **Typecheck clean** across all three workspaces.
- **All 5 acceptance DOIs verified against live OpenAlex + Crossref**, exit 0: Gautret `[retraction, erratum]`; Lesné `[expression_of_concern, retraction]`; nrg2336 `[correction]` only; `10.1177/1475090218792382` EOC-only; `10.1038/nature14539` clean.
- **Playwright last run: passed.**
- Crossref dual-relation normalization (`updated-by` + `update-to`) is correct and is a genuinely non-obvious finding — `ADR-006` is the best-earned document in the repo. Keep it prominent.

---

## Sources

- [The WebMCP Challenge — Devpost](https://webmcp.devpost.com/)
- [WebMCP spec draft — W3C Web Machine Learning CG](https://webmachinelearning.github.io/webmcp/)
- [WebMCP explainer repo](https://github.com/webmachinelearning/webmcp)
- [Chrome — WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)
- [Chrome — WebMCP tool security (`exposedTo`)](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [Chrome — Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
