import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@tauri-apps/api/core':    new URL('./src/__mocks__/tauri-core.ts',  import.meta.url).pathname,
      '@tauri-apps/api/event':   new URL('./src/__mocks__/tauri-event.ts', import.meta.url).pathname,
      '@tauri-apps/plugin-sql':  new URL('./src/__mocks__/tauri-sql.ts',   import.meta.url).pathname,
    },
  },
})
