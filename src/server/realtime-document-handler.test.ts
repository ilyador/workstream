import { describe, expect, it, vi, beforeEach } from 'vitest';

const broadcastMock = vi.hoisted(() => vi.fn());
vi.mock('./realtime-listeners.js', () => ({
  broadcast: broadcastMock,
}));

import { broadcastDocumentChange } from './realtime-document-handler.js';

describe('broadcastDocumentChange', () => {
  beforeEach(() => {
    broadcastMock.mockClear();
  });

  it('broadcasts document_changed with project_id from the new record on insert/update', () => {
    broadcastDocumentChange({
      eventType: 'INSERT',
      new: { id: 'doc-1', project_id: 'proj-1', file_name: 'spec.md' },
      old: null,
    });
    expect(broadcastMock).toHaveBeenCalledWith('proj-1', { type: 'document_changed' });
  });

  it('falls back to old record on DELETE', () => {
    broadcastDocumentChange({
      eventType: 'DELETE',
      new: {},
      old: { id: 'doc-1', project_id: 'proj-1' },
    });
    expect(broadcastMock).toHaveBeenCalledWith('proj-1', { type: 'document_changed' });
  });

  it('does not broadcast when project_id is missing', () => {
    broadcastDocumentChange({
      eventType: 'INSERT',
      new: { id: 'doc-1' },
      old: null,
    });
    expect(broadcastMock).not.toHaveBeenCalled();
  });
});
