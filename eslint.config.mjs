/**
 * Lint con informacion de tipos.
 *
 * El `tsconfig` ya es estricto —`strict`, `noUncheckedIndexedAccess`,
 * `noUnusedLocals`— y el typecheck corre en CI, asi que esto no esta para
 * repetirlo: esta para lo que el compilador no sabe ver. Sobre todo una
 * promesa sin esperar, que en un build que reparte trabajo entre motores no
 * falla: devuelve antes de tiempo y escribe media salida.
 *
 * Las reglas apagadas llevan su motivo. Una regla apagada sin explicacion es
 * una que alguien volvera a encender dentro de un ano sin saber por que
 * estaba asi.
 */

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'vitest.config.ts', 'coverage/**', 'docs/**', 'artifacts/**', 'vendor/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // `render()` devuelve una promesa porque lo exige `DiagramRenderer`, no
      // porque su cuerpo espere algo: svgbob y vega-lite son sincronos. La
      // premisa de la regla —async sin await es un descuido— no se cumple
      // cuando lo async es parte de un contrato compartido.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Estos dos corren su cuerpo DENTRO del navegador, via `page.evaluate`:
    // alli `document` y `window` existen aunque el proceso de Node no los
    // tenga.
    files: ['scripts/capture-preview.mjs', 'src/renderers/in-page.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Los scripts sueltos son JavaScript y no estan en el `tsconfig`: pedirles
    // informacion de tipos solo produce errores de parseo.
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Las pruebas leen JSON y respuestas de herramientas, que llegan como
    // `any` por definicion. Exigir ahi el mismo rigor que al codigo convierte
    // cada asercion en tres lineas de aserciones de tipo que no prueban nada.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
);
