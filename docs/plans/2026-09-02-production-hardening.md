# FORGE Production Hardening Implementation Plan

> **For Hermes:** Execute this plan task-by-task with TDD and independent review.

**Goal:** Move FORGE from a verified hackathon production build to a deployable single-user production service with durable state, authenticated writes, abuse controls, observable failures, and complete browser acceptance.

**Architecture:** Keep the two-origin WebMCP boundary unchanged. Replace personal-origin `localStorage` authority with a server-side workspace repository backed by PostgreSQL; use an HttpOnly same-site session cookie for personal writes and optimistic revisions for conflict safety. Keep a clearly labeled local-only fallback only when no database is configured. Treat enrichment as a public, bounded, cacheable read service with strict projections and per-client rate limits.

**Tech stack:** Next.js 16, TypeScript, PostgreSQL/`pg`, Web Crypto, Ajv, Vitest, Node test runner, Playwright Chromium.

---

## Gate 1: Durable authenticated personal state

1. Add `pg` and a server-only connection module under `forge-personal/src/lib/server/db.ts`.
2. Add a migration runner and reconcile `infra/sql/001_schema.sql` with the runtime repository contract.
3. Add `workspace_sessions` with hashed bearer material, expiry, rotation, and HttpOnly cookie issuance.
4. Add `GET/PUT /api/workspace` with a monotonically increasing revision and `409` on stale writes.
5. Add route tests proving unauthenticated writes fail, stale writes fail, and confirmed decisions append rather than overwrite.
6. Replace `ForgeProvider` localStorage authority with initial server hydration and debounced revisioned persistence.
7. Keep `localStorage` only as an explicitly labeled offline cache, never as source of truth when server persistence is active.

**Gate:** reload in a fresh browser context and recover notes, drafts, audit events, and hash chains from the server; stale concurrent save returns `409` without data loss.

## Gate 2: Boundary hardening and operations

1. Add request-body limits and closed input validation to `/api/verify`, `/api/scan`, and `/api/workspace`.
2. Add bounded rate limiting keyed by IP plus normalized DOI; emit `429` with `Retry-After`.
3. Add CSP, frame-ancestor, referrer, HSTS-on-HTTPS, and permissions-policy headers per origin.
4. Add structured JSON logs with request ID, route, source outcome, duration, cache state, and no note body or raw provider prose.
5. Add readiness endpoints that check configured dependencies separately from liveness endpoints.
6. Add graceful DB-unavailable behavior: read-only local mode is visible; writes never pretend to be durable.

**Gate:** malformed, oversized, unauthorized, stale, and rate-limited requests have deterministic tests and leak no provider/user prose.

## Gate 3: Complete acceptance matrix

1. Add E2E tests for Gautret red + strike-through + save warning.
2. Add clean DOI green dot + no treatment + no warning.
3. Add EOC-only amber + dotted underline + no warning.
4. Add OpenAlex-only red and provenance label.
5. Add timeout/unknown gray + save allowed.
6. Add blue pending wrapper with nested integrity signal.
7. Assert `confirm_edit` and `reject_edit` exist only while review is open.
8. Assert negative-origin discovery returns zero tools.
9. Assert confirmation persists a new chain head and immutable audit event across reload.
10. Run desktop and Pixel/Chromium projects.

**Gate:** the full matrix passes twice against production builds, not dev servers.

## Gate 4: Independent review and deployment

1. Run full unit, type, build, live-source, E2E, audit, and secret scans twice.
2. Run an independent code review focused on auth, CORS, SSR/client boundaries, race conditions, and audit integrity.
3. Fix all critical and important findings; rerun review.
4. Deploy enrichment first, set the exact personal origin, then deploy personal with the exact enrichment origin.
5. Verify both health/readiness endpoints and every acceptance DOI against deployed URLs.
6. Verify native WebMCP in the challenge-supported Chrome build; retain compatibility labeling elsewhere.
7. Record deployment evidence and known limits in `docs/PRODUCTION_READINESS.md`.

**Gate:** no critical/important review findings, both deployed origins healthy, native WebMCP proof captured, and all browser acceptance cases pass live.

## Explicit non-goals

- No multi-tenant organizations, billing, social sharing, replacement-paper recommendations, author scoring, or generic literature RAG.
- No claim of production readiness while localStorage is authoritative.
- No synthetic bibliographic status in the deployed demo.
