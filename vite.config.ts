import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
    watch: {
      // Jobs run inside .worktrees/* which contain full checkouts of the
      // repo including src/. Without this, any file the task writes
      // triggers HMR and a full page reload mid-task.
      ignored: ['**/.worktrees/**', '**/supabase/.temp/**'],
    },
  },
})

