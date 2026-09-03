import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DraftCard } from '@/components/DraftCard';
import { NoteEditor } from '@/components/NoteEditor';

describe('workflow surfaces', () => {
  it('nests integrity badge inside the blue pending wrapper', () => {
    const { container } = render(<DraftCard draft={{ id: 'd1', noteId: 'n1', proposedBody: 'x', prevHash: 'h', status: 'pending', cardType: 'corroborated', provenance: {}, createdAt: 'now' }} onReview={() => undefined} />);
    const wrapper = screen.getByTestId('pending-wrapper');
    expect(wrapper).toHaveClass('pendingWrapper');
    expect(wrapper.querySelector('[data-integrity="retracted"]')).not.toBeNull();
    expect(container.textContent).toContain('Pending review');
  });

  it('requires explicit acknowledgement before saving a retracted citation', async () => {
    const onSave = vi.fn();
    render(<NoteEditor initialBody="Cite 10.1016/j.ijantimicag.2020.105949" verify={vi.fn().mockResolvedValue({ status: 'retracted', cardType: 'corroborated', sources: {} })} onSave={onSave} debounceMs={0} />);
    await screen.findByText('Retracted');
    fireEvent.click(screen.getByRole('button', { name: /save note/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /save with warning acknowledged/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });
});
