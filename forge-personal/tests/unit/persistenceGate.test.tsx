import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PersistenceGate } from '@/components/PersistenceGate';

describe('persistence gate', () => {
  it('requires the workspace key without storing it in an input after success', async () => {
    const login = vi.fn().mockResolvedValue(true);
    render(<PersistenceGate mode="locked" login={login} />);
    fireEvent.change(screen.getByLabelText('Workspace access key'), { target: { value: 'correct horse battery staple' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock workspace' }));
    expect(login).toHaveBeenCalledWith('correct horse battery staple');
  });

  it('labels local-only state as non-durable', () => {
    render(<PersistenceGate mode="local" reason="PERSISTENCE_NOT_CONFIGURED" login={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Local-only mode');
    expect(screen.getByRole('status')).toHaveTextContent('not durable server storage');
  });
});
