import { describe, expect, it } from 'vitest';
import { createRepository } from '@/lib/store/repository';

describe('append-only repository', () => {
  it('confirm creates a new note revision and immutable audit event', async () => {
    const repo = await createRepository();
    const draft = await repo.proposeEdit('note-gautret', 'Replacement text', { openalex: 'https://openalex.org/works/doi:10.1016/j.ijantimicag.2020.105949' }, 'corroborated');
    const before = repo.snapshot();
    await repo.confirmEdit(draft.id);
    const after = repo.snapshot();
    expect(after.drafts.find((item) => item.id === draft.id)?.status).toBe('confirmed');
    expect(after.auditEvents).toHaveLength(before.auditEvents.length + 1);
    expect(before.auditEvents.every((event, index) => event === after.auditEvents[index])).toBe(true);
    expect(after.notes.find((note) => note.id === draft.noteId)?.contentHash).not.toBe(draft.prevHash);
  });

  it('reject appends an event without editing the note', async () => {
    const repo = await createRepository();
    const draft = await repo.proposeEdit('note-lesne', 'No edit', {}, 'disagree');
    const noteBefore = repo.getNote('note-lesne');
    await repo.rejectEdit(draft.id, 'Keep contextual wording');
    expect(repo.getNote('note-lesne')).toEqual(noteBefore);
    expect(repo.snapshot().auditEvents.at(-1)?.eventType).toBe('edit.rejected');
  });
});
