/**
 * Pruebas del parser Markdown (seccion 19 — Parser).
 */

import { describe, expect, it } from 'vitest';
import { parseMeta, scanDocument } from '../../src/markdown/scan.js';
import { DSL_LANGUAGES, compileDsl } from '../../src/dsl/index.js';

const NATIVE = ['plantuml', 'mermaid', 'd2', 'vega-lite', 'graphviz', 'likec4'];

function context(known: readonly string[] = NATIVE) {
  const aliases: Record<string, string> = {
    puml: 'plantuml',
    uml: 'plantuml',
    dot: 'graphviz',
    vegalite: 'vega-lite',
    c4: 'likec4',
  };
  return {
    resolveLanguage: (lang: string): string | undefined => {
      const normalized = lang.toLowerCase();
      if (known.includes(normalized)) return normalized;
      const alias = aliases[normalized];
      return alias !== undefined && known.includes(alias) ? alias : undefined;
    },
    compileDsl,
    dslLanguages: DSL_LANGUAGES,
  };
}

describe('scanDocument — deteccion de lenguajes', () => {
  for (const lang of NATIVE) {
    it(`detecta bloques \`${lang}\``, () => {
      const source = `# Titulo\n\n\`\`\`${lang}\ncontenido\n\`\`\`\n`;
      const { blocks } = scanDocument(source, context());
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.lang).toBe(lang);
      expect(blocks[0]!.rendererType).toBe(lang);
      expect(blocks[0]!.source).toBe('contenido');
    });
  }

  it('resuelve alias de lenguaje al tipo canonico', () => {
    const source = '```puml\n@startuml\n@enduml\n```\n\n```dot\ndigraph {}\n```\n';
    const { blocks } = scanDocument(source, context());
    expect(blocks.map((b) => b.rendererType)).toEqual(['plantuml', 'graphviz']);
  });

  it('ignora bloques de lenguajes no registrados', () => {
    const source = [
      '```typescript',
      'const x = 1;',
      '```',
      '',
      '```bash',
      'npm run build',
      '```',
      '',
      '```json',
      '{"a": 1}',
      '```',
      '',
      '```',
      'sin lenguaje',
      '```',
    ].join('\n');
    const { blocks } = scanDocument(source, context());
    expect(blocks).toHaveLength(0);
  });

  it('detecta varios bloques y los devuelve en orden de aparicion', () => {
    const source = '```mermaid\nflowchart LR\nA-->B\n```\n\n```d2\nA -> B\n```\n';
    const { blocks } = scanDocument(source, context());
    expect(blocks.map((b) => b.rendererType)).toEqual(['mermaid', 'd2']);
    expect(blocks[0]!.start).toBeLessThan(blocks[1]!.start);
  });

  it('conserva el resto del Markdown intacto en el AST', () => {
    const source = [
      '---',
      'title: Con frontmatter',
      '---',
      '',
      '# Encabezado',
      '',
      '- lista',
      '- de items',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '[enlace](https://ejemplo.test)',
      '',
      '![imagen previa](./foto.png)',
      '',
      '<div>html permitido</div>',
      '',
      '```mermaid',
      'flowchart LR',
      'A-->B',
      '```',
    ].join('\n');
    const { tree, blocks } = scanDocument(source, context());
    const types = tree.children.map((n) => n.type);
    expect(types).toContain('yaml');
    expect(types).toContain('heading');
    expect(types).toContain('list');
    expect(types).toContain('table');
    expect(types).toContain('html');
    expect(blocks).toHaveLength(1);
  });
});

describe('scanDocument — titulo del diagrama', () => {
  it('toma el encabezado inmediatamente anterior', () => {
    const source = '# General\n\n## Flujo de autenticacion\n\n```plantuml\n@startuml\n@enduml\n```\n';
    const { blocks } = scanDocument(source, context());
    expect(blocks[0]!.title).toBe('Flujo de autenticacion');
  });

  it('prefiere el titulo declarado en la valla', () => {
    const source = '## Encabezado\n\n```plantuml title="Titulo explicito"\n@startuml\n@enduml\n```\n';
    const { blocks } = scanDocument(source, context());
    expect(blocks[0]!.title).toBe('Titulo explicito');
  });

  it('usa un titulo por defecto si no hay encabezado previo', () => {
    const { blocks } = scanDocument('```graphviz\ndigraph {}\n```\n', context());
    expect(blocks[0]!.title).toBe('Grafo de dependencias');
  });

  it('el titulo del DSL gana al encabezado', () => {
    const source = [
      '## Encabezado del documento',
      '',
      '```diagram',
      'type: sequence',
      'title: Titulo del DSL',
      'participants:',
      '  - A',
      '  - B',
      'flow:',
      '  - A -> B: hola',
      '```',
    ].join('\n');
    const { blocks } = scanDocument(source, context());
    expect(blocks[0]!.title).toBe('Titulo del DSL');
  });
});

describe('parseMeta', () => {
  it('devuelve un objeto vacio sin meta', () => {
    expect(parseMeta(undefined)).toEqual({});
    expect(parseMeta('   ')).toEqual({});
  });

  it('lee title con comillas dobles, simples y sin comillas', () => {
    expect(parseMeta('title="Con espacios"').title).toBe('Con espacios');
    expect(parseMeta("title='Otro'").title).toBe('Otro');
    expect(parseMeta('title=SinEspacios').title).toBe('SinEspacios');
  });

  it('lee el formato solicitado y descarta valores invalidos', () => {
    expect(parseMeta('format=png').format).toBe('png');
    expect(parseMeta('format=svg').format).toBe('svg');
    expect(parseMeta('format=webp').format).toBeUndefined();
  });

  it('acepta alt como sinonimo de title', () => {
    expect(parseMeta('alt="Texto alternativo"').title).toBe('Texto alternativo');
  });
});

describe('scanDocument — DSL de alto nivel', () => {
  it('compila `diagram` al motor correspondiente', () => {
    const source = [
      '```diagram',
      'type: strategy-tree',
      'root: Mejorar calidad',
      'branches:',
      '  - Automatizacion',
      '  - Arquitectura',
      '```',
    ].join('\n');
    const { blocks } = scanDocument(source, context());
    expect(blocks[0]!.rendererType).toBe('d2');
    expect(blocks[0]!.source).toContain('Mejorar calidad');
  });

  it('compila `chart` a Vega-Lite', () => {
    const source = ['```chart', 'type: bar', 'data:', '  - label: SP1', '    value: 42', '```'].join('\n');
    const { blocks } = scanDocument(source, context());
    expect(blocks[0]!.rendererType).toBe('vega-lite');
    expect(JSON.parse(blocks[0]!.source)).toHaveProperty('mark');
  });

  it('compila `architecture` a LikeC4', () => {
    const source = [
      '```architecture',
      'type: c4-context',
      'elements:',
      '  - id: u',
      '    kind: person',
      '    name: Usuario',
      '  - id: s',
      '    kind: system',
      '    name: Core',
      'relations:',
      '  - from: u',
      '    to: s',
      '    label: Usa',
      '```',
    ].join('\n');
    const { blocks } = scanDocument(source, context());
    expect(blocks[0]!.rendererType).toBe('likec4');
    expect(blocks[0]!.source).toContain('specification {');
    expect(blocks[0]!.source).toContain('views {');
  });
});
