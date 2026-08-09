/**
 * Pruebas del transformador Markdown (seccion 19 — Transformer).
 */

import { describe, expect, it } from 'vitest';
import { applyReplacements, escapeAltText, imageMarkdown } from '../../src/markdown/transform.js';
import { scanDocument } from '../../src/markdown/scan.js';
import { DSL_LANGUAGES, compileDsl } from '../../src/dsl/index.js';

const NATIVE = ['plantuml', 'mermaid', 'd2', 'vega-lite', 'graphviz', 'likec4'];
const context = {
  resolveLanguage: (lang: string): string | undefined =>
    NATIVE.includes(lang.toLowerCase()) ? lang.toLowerCase() : undefined,
  compileDsl,
  dslLanguages: DSL_LANGUAGES,
};

function compile(source: string, paths: string[]): string {
  const { blocks } = scanDocument(source, context);
  return applyReplacements(
    source,
    blocks.map((block, i) => ({ block, assetPath: paths[i] ?? './assets/generated/x.svg' })),
  );
}

describe('imageMarkdown', () => {
  it('genera sintaxis de imagen estandar', () => {
    expect(imageMarkdown('Titulo', './assets/generated/a-1.svg')).toBe(
      '![Titulo](./assets/generated/a-1.svg)',
    );
  });

  it('escapa corchetes del texto alternativo', () => {
    expect(escapeAltText('a [b] c')).toBe('a \\[b\\] c');
    expect(imageMarkdown('a [b]', './x.svg')).toBe('![a \\[b\\]](./x.svg)');
  });

  it('envuelve entre <> las rutas con espacios', () => {
    expect(imageMarkdown('t', './mis assets/a.svg')).toBe('![t](<./mis assets/a.svg>)');
  });
});

describe('applyReplacements', () => {
  it('reemplaza el bloque de codigo por una imagen', () => {
    const source = '## Flujo\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```\n';
    const out = compile(source, ['./assets/generated/flujo-abc.svg']);
    expect(out).toBe('## Flujo\n\n![Flujo](./assets/generated/flujo-abc.svg)\n');
    expect(out).not.toContain('@startuml');
  });

  it('conserva el alt text derivado del titulo', () => {
    const source = '## Diagrama de contexto\n\n```d2\nA -> B\n```\n';
    expect(compile(source, ['./a.svg'])).toContain('![Diagrama de contexto](./a.svg)');
  });

  it('reemplaza varios bloques manteniendo los desplazamientos', () => {
    const source = [
      '# Doc',
      '',
      '## Uno',
      '',
      '```mermaid',
      'flowchart LR',
      'A-->B',
      '```',
      '',
      '## Dos',
      '',
      '```d2',
      'A -> B',
      '```',
      '',
      'fin',
    ].join('\n');
    const out = compile(source, ['./uno.svg', './dos.svg']);
    expect(out).toContain('![Uno](./uno.svg)');
    expect(out).toContain('![Dos](./dos.svg)');
    expect(out.trimEnd().endsWith('fin')).toBe(true);
  });

  it('mantiene intacto el resto del documento byte a byte', () => {
    const source = [
      '---',
      'title: Documento',
      'tags: [a, b]',
      '---',
      '',
      '# Titulo   con   espacios',
      '',
      'Parrafo con *enfasis*, `codigo` y un [enlace](https://ejemplo.test).',
      '',
      '* item uno',
      '* item dos',
      '',
      '1) numerado',
      '',
      '| Col A | Col B |',
      '| :---- | ----: |',
      '| 1     | 2     |',
      '',
      '> cita',
      '',
      '<div class="html">permitido</div>',
      '',
      '![imagen previa](./foto.png)',
      '',
      '```typescript',
      'const x: number = 1;',
      '```',
      '',
      '```mermaid',
      'flowchart LR',
      'A-->B',
      '```',
      '',
      'Texto final.',
      '',
    ].join('\n');

    const out = compile(source, ['./assets/generated/diagrama-1.svg']);

    // Todo lo que no era el bloque mermaid debe sobrevivir tal cual.
    const before = source.split('```mermaid')[0]!;
    const after = source.split('```', 6).slice(-1)[0]!;
    expect(out.startsWith(before)).toBe(true);
    expect(out).toContain('| Col A | Col B |');
    expect(out).toContain('| :---- | ----: |');
    expect(out).toContain('* item uno');
    expect(out).toContain('1) numerado');
    expect(out).toContain('> cita');
    expect(out).toContain('<div class="html">permitido</div>');
    expect(out).toContain('![imagen previa](./foto.png)');
    expect(out).toContain('```typescript\nconst x: number = 1;\n```');
    expect(out).toContain('# Titulo   con   espacios');
    expect(out.endsWith('Texto final.\n')).toBe(true);
    expect(after).toBeDefined();
  });

  it('no toca el documento si no hay bloques compilables', () => {
    const source = '# Solo texto\n\n```bash\nls -la\n```\n';
    expect(compile(source, [])).toBe(source);
  });

  it('reemplaza tambien bloques indentados dentro de listas', () => {
    const source = ['- item', '', '  ```d2', '  A -> B', '  ```', '', 'fin'].join('\n');
    const out = compile(source, ['./x.svg']);
    expect(out).toContain('![');
    expect(out).toContain('- item');
    expect(out).toContain('fin');
    expect(out).not.toContain('A -> B');
  });
});
