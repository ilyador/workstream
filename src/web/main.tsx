import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ModalProvider } from './hooks/useModal.tsx'
import { FilePreviewProvider } from './components/FilePreview.tsx'
import { initSessionRestore } from './hooks/useSessionRestore.ts'
import App from './App.tsx'

// Restore route/scroll from iOS Safari tab kill (must run before React renders)
initSessionRestore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ModalProvider>
        <FilePreviewProvider>
          <App />
        </FilePreviewProvider>
      </ModalProvider>
    </BrowserRouter>
  </StrictMode>,
)
