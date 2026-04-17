import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Safari drops idle WebSockets after ~60s and doesn't count protocol-level
// ping/pong as activity. Vite's HMR client unconditionally reloads the page
// on WS disconnect+reconnect, so a dropped WS = full page refresh. Send an
// application-level keepalive from the server every 25s to keep Safari's
// idle timer reset. 25s clears NAT/proxy 30s windows and stays under 60s.
function hmrKeepalive(): Plugin {
  return {
    name: 'hmr-keepalive',
    apply: 'serve',
    configureServer(server) {
      const id = setInterval(() => {
        server.ws.send({ type: 'custom', event: 'hmr:keepalive', data: {} })
      }, 25_000)
      server.httpServer?.once('close', () => clearInterval(id))
    },
  }
}

export default defineConfig({
  plugins: [react(), hmrKeepalive()],
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

