import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Los renderers reales (Chrome, JVM, WASM) necesitan margen.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Un unico proceso: PlantUML, Chrome y los modulos WASM no se benefician
    // del paralelismo y competirian por CPU y por el cache compartido.
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Punto de entrada del servidor MCP: solo cablea el SDK sobre stdio.
        'src/mcp/server.ts',
        // Reexportaciones puras.
        'src/index.ts',
        'src/core/types.ts',
        'src/config/types.ts',
        'src/themes/types.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
