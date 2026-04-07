// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilePreviewProvider } from './FilePreview';
import { useFilePreview, type PreviewFile } from './filePreviewContext';

function PreviewButton({ file }: { file: PreviewFile }) {
  const { preview } = useFilePreview();
  return (
    <button
      type="button"
      onClick={() => preview(file)}
    >
      Open file
    </button>
  );
}

describe('FilePreviewProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens unsupported files in the preview modal instead of downloading immediately', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <FilePreviewProvider>
        <PreviewButton file={{
          id: 'artifact-1',
          url: '/api/artifacts/artifact-1/download',
          filename: 'archive.zip',
          mime_type: 'application/zip',
          size_bytes: 123,
        }} />
      </FilePreviewProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }));

    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Preview not available for this file type')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Download file' }).getAttribute('href')).toBe('/api/artifacts/artifact-1/download');
  });

  it('previews markdown files even when their MIME type is generic', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      text: async () => '# Plan\n\nReview this.',
    })));

    render(
      <FilePreviewProvider>
        <PreviewButton file={{
          id: 'artifact-2',
          url: '/api/artifacts/artifact-2/download',
          filename: 'plan.md',
          mime_type: 'application/octet-stream',
          size_bytes: 456,
        }} />
      </FilePreviewProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }));

    expect(screen.queryByText('Preview not available for this file type')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Plan' })).not.toBeNull();
  });

  it('opens markdown artifact edit mode in a rich editor surface', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      text: async () => '# Plan\n\n| Item | Status |\n| --- | --- |\n| Table | visible |\n\n```ts\nconst ok = true\n```',
    })));

    render(
      <FilePreviewProvider>
        <PreviewButton file={{
          id: 'artifact-3',
          url: '/api/artifacts/artifact-3/download',
          filename: 'plan.md',
          mime_type: 'application/octet-stream',
          size_bytes: 789,
        }} />
      </FilePreviewProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }));

    expect(await screen.findByRole('heading', { name: 'Plan' })).not.toBeNull();
    fireEvent.click(screen.getByTitle('Edit'));

    await waitFor(() => {
      expect(document.querySelector('[contenteditable]')).not.toBeNull();
    });
  });
});
