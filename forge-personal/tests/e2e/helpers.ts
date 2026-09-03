import type { Page } from '@playwright/test';

const HASH = 'a'.repeat(64);

export const SEEDED_PENDING_SNAPSHOT = {
  notes: [{
    id: 'note-gautret',
    title: 'Hydroxychloroquine evidence review',
    body: 'Citation: 10.1016/j.ijantimicag.2020.105949',
    doi: '10.1016/j.ijantimicag.2020.105949',
    contentHash: HASH,
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  }],
  drafts: [{
    id: 'draft-review-gate',
    noteId: 'note-gautret',
    proposedBody: 'Citation: 10.1016/j.ijantimicag.2020.105949\n\n> Integrity notice: verify this citation before relying on its findings.',
    prevHash: HASH,
    status: 'pending',
    cardType: 'corroborated',
    provenance: {},
    createdAt: '2026-09-02T00:00:00.000Z',
  }],
  auditEvents: [],
  hashChains: {
    'note-gautret': [{ noteId: 'note-gautret', body: 'Citation: 10.1016/j.ijantimicag.2020.105949', prevHash: 'GENESIS', hash: HASH, createdAt: '2026-09-02T00:00:00.000Z' }],
  },
};

export async function openApp(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

export async function installFakeModelContext(page: Page): Promise<void> {
  await page.addInitScript((snapshot) => {
    class FakeModelContext extends EventTarget {
      tools = new Map<string, { name: string; description?: string }>();
      ontoolchange: ((this: EventTarget, event: Event) => unknown) | null = null;
      async registerTool(tool: { name: string; description?: string }, options?: { signal?: AbortSignal }) {
        this.tools.set(tool.name, tool.description === undefined ? { name: tool.name } : { name: tool.name, description: tool.description });
        this.emitChange();
        options?.signal?.addEventListener('abort', () => {
          this.tools.delete(tool.name);
          this.emitChange();
        });
      }
      async getTools(options?: { fromOrigins?: string[] }) {
        if (options?.fromOrigins?.length) {
          const allowed = new Set(['http://localhost:3001', 'https://enrich.forge.local']);
          if (options.fromOrigins.some((origin) => !allowed.has(origin))) return [];
        }
        return [...this.tools.values()];
      }
      async executeTool() { return null; }
      emitChange() {
        const event = new Event('toolchange');
        this.dispatchEvent(event);
        this.ontoolchange?.(event);
      }
    }
    const context = new FakeModelContext();
    Object.defineProperty(Document.prototype, 'modelContext', { configurable: true, enumerable: true, get() { return context; } });
    Object.defineProperty(Navigator.prototype, 'modelContext', { configurable: true, enumerable: true, get() { return undefined; } });
    localStorage.setItem('forge.personal.v2', JSON.stringify(snapshot));
  }, SEEDED_PENDING_SNAPSHOT);
}

export async function registeredToolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const tools = await document.modelContext?.getTools?.() ?? [];
    return tools.map((tool) => tool.name).sort();
  });
}
