import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // The store is worth testing but imports `obsidian`, which only exists
    // inside the app. Point it at a stub with just the surface it touches.
    alias: {
      obsidian: resolve(__dirname, 'tests/stubs/obsidian.ts'),
    },
  },
});
