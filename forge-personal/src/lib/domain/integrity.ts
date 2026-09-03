import type { IntegrityStatus } from './types';

const PRESENTATIONS = {
  retracted: { tone: 'danger', decoration: 'line-through', label: 'Retracted' },
  eoc: { tone: 'caution', decoration: 'dotted', label: 'Editorial concern' },
  ok: { tone: 'safe', decoration: 'none', label: 'Verified clean' },
  unknown: { tone: 'neutral', decoration: 'none', label: 'Status unknown' },
} as const;

export function integrityPresentation(status: IntegrityStatus) {
  return PRESENTATIONS[status];
}

export function shouldWarnOnSave(status: IntegrityStatus): boolean {
  return status === 'retracted';
}
