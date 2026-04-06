import { createContext, useContext } from 'react';

export interface PreviewFile {
  id?: string;
  url: string;
  filename: string;
  mime_type: string;
  size_bytes?: number;
}

interface FilePreviewContextValue {
  preview: (file: PreviewFile) => void;
}

export const FilePreviewContext = createContext<FilePreviewContextValue>({ preview: () => {} });

export function useFilePreview() {
  return useContext(FilePreviewContext);
}
