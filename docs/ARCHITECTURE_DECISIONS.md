# Architecture decisions

## ADR-001: mutable drafts, immutable decisions

The original spec called `edits` append-only while also requiring status transitions. Those requirements conflict. FORGE stores pending workflow state in the revisioned `workspace_state.snapshot` JSONB (notes and pending drafts). Every terminal decision is also inserted into immutable `edit_events` plus `audit_events` in the same PostgreSQL transaction. Database triggers reject UPDATE and DELETE on both event tables, and each audit row carries a SHA-256 hash chain (`previous_hash` → `content_hash` → `link_hash`). Tampering a stored content hash fails chain verification. SQL `notes`/`drafts` tables exist in `001_schema.sql` but are not the runtime write path.

## ADR-002: 9 personal tools

The original spec labels the personal surface as 8 tools but enumerates 9. The implementation exposes 9 exact tools: `list_notes`, `get_note`, `search_notes`, `get_drafts`, `propose_note_edit`, `confirm_edit`, `reject_edit`, `create_note`, and `run_scan_now`.

## ADR-003: WebMCP primary, capability-probed fallback

Cross-origin WebMCP requires `document.modelContext.getTools({fromOrigins})` and `executeTool`, a provider document loaded with `allow="tools"`, and exact provider-side `exposedTo`. Support is probed at runtime, never inferred from user agent. A compatibility transport may keep the UI usable, but its kind is visible and it is never reported as WebMCP.

## ADR-004: one verification service

WebMCP tools, the preventive editor, the reactive scan, and compatibility endpoints share the same canonical DOI normalizer, source adapters, AJV firewall, classifier, and cache. No surface may maintain a separate signal emitter.

## ADR-005: source disagreement is preserved

OpenAlex retracted + Crossref EOC emits amber `disagree`; OpenAlex-only retracted emits red `openalex_only`; Crossref EOC-only emits amber `eoc_only`. FORGE never silently resolves conflicting source states.

## ADR-006: normalize both Crossref relation directions

Live API verification found that original article records commonly expose notices under `updated-by`, while notice records expose their targets under `update-to`. Source projection parses both and normalizes them into one constrained `integrity_events` list. The real EOC-only acceptance DOI is `10.1177/1475090218792382`: OpenAlex reports `is_retracted=false`; Crossref reports a publisher `expression_of_concern` under `updated-by` dated 2025-08-07.

## ADR-007: live seed truth outranks historical pitch copy

The current OpenAlex-only retraction acceptance DOI is `10.1038/nrg2336` (OpenAlex `is_retracted=true`; Crossref has no retraction/EOC event). Lesné `10.1038/nature04533` now has both an EOC and a later retraction in normalized Crossref history, so it is red/corroborated, not amber/disagreement. The real amber EOC-only case is `10.1177/1475090218792382`. No stale historical status is hard-coded into the product.
