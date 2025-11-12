import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true, // Allow external connections
    port: 5137,
    hmr: {
      clientPort: 443 // For ngrok HTTPS tunnels
    }
  }
})
