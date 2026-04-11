// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
  // Preload the lazy-loaded MarkdownArtifactEditor so the edit-mode test
  // doesn't race React.lazy's dynamic import against waitFor's default
  // 1s timeout under full-suite load.
  beforeAll(async () => {
    await import('./MarkdownArtifactEditor');
  });

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
    const modal = document.querySelector('[style*="--modal-shell-max-width"]') as HTMLDivElement | null;
    expect(modal?.style.getPropertyValue('--modal-shell-max-width')).toBe('min(1200px, calc(100vw - 48px))');
    expect(modal?.style.getPropertyValue('--modal-shell-max-height')).toBe('92vh');
  });

  it('uses a near-fullscreen desktop size for media previews', () => {
    render(
      <FilePreviewProvider>
        <PreviewButton file={{
          id: 'artifact-4',
          url: '/api/artifacts/artifact-4/download',
          filename: 'diagram.png',
          mime_type: 'image/png',
          size_bytes: 1024,
        }} />
      </FilePreviewProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }));

    const modal = document.querySelector('[style*="--modal-shell-max-width"]') as HTMLDivElement | null;
    expect(modal?.style.getPropertyValue('--modal-shell-max-width')).toBe('calc(100vw - 48px)');
    expect(modal?.style.getPropertyValue('--modal-shell-max-height')).toBe('calc(100vh - 48px)');
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
