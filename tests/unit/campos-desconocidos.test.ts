/**
 * Pruebas del diagnostico de campos y de los codigos de regla.
 *
 * Lo que se comprueba aqui no es que el compilador falle —eso ya estaba— sino
 * que el fallo sea accionable: con codigo, con linea, con la errata senalada y
 * sin esconder los bloques rotos que vienen detras.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { check } from '../../src/build/builder.js';
import { defaultConfig } from '../../src/config/load.js';
import { DocVizError, DslValidationError, ERROR_CODES } from '../../src/core/errors.js';
import { compileDsl, findType, TYPE_CATALOG } from '../../src/dsl/index.js';
import { editDistance, knownFields, trackFieldAccess, unknownFields } from '../../src/dsl/fields.js';
import { scanDocument } from '../../src/markdown/scan.js';
import type { DocVizConfig } from '../../src/config/types.js';

const temps: string[] = [];

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-campos-'));
  temps.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

function config(root: string, overrides: Partial<DocVizConfig> = {}): DocVizConfig {
  return { ...defaultConfig(root), ...overrides, rootDir: root };
}

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

// --------------------------------------------------------------------------

describe('distancia de edicion', () => {
  it('es cero entre cadenas iguales', () => {
    expect(editDistance('flow', 'flow')).toBe(0);
  });

  it('cuenta una sustitucion, una insercion y un borrado', () => {
    expect(editDistance('flow', 'flou')).toBe(1);
    expect(editDistance('participants', 'particpants')).toBe(1);
    expect(editDistance('', 'flow')).toBe(4);
    expect(editDistance('flow', '')).toBe(4);
  });
});

describe('campos conocidos de un tipo', () => {
  it('salen del ejemplo canonico mas los universales', () => {
    const spec = findType('sequence')!;
    const fields = knownFields(spec);
    expect([...fields].sort()).toEqual(['flow', 'participants', 'title', 'type']);
  });

  it('se memoriza entre llamadas', () => {
    const spec = findType('bar')!;
    expect(knownFields(spec)).toBe(knownFields(spec));
  });

  it('un ejemplo que no es un mapa deja solo los universales', () => {
    const spec = { ...findType('sequence')!, type: 'inventado', example: '- suelto\n- lista' };
    expect([...knownFields(spec)].sort()).toEqual(['title', 'type']);
  });
});

describe('observacion de accesos', () => {
  it('registra las claves leidas sin alterar los valores', () => {
    const tracker = trackFieldAccess({ a: 1, b: 2 } as Record<string, unknown>);
    expect(tracker.doc['a']).toBe(1);
    expect('b' in tracker.doc).toBe(true);
    expect([...tracker.accessed].sort()).toEqual(['a', 'b']);
    expect(tracker.enumerated()).toBe(false);
  });

  it('se abstiene si alguien enumera el mapa completo', () => {
    const tracker = trackFieldAccess({ a: 1, sobra: 2 } as Record<string, unknown>);
    expect(Object.keys(tracker.doc)).toEqual(['a', 'sobra']);
    expect(tracker.enumerated()).toBe(true);
    expect(unknownFields({ a: 1, sobra: 2 }, findType('sequence'), tracker)).toEqual([]);
  });

  it('sin ficha del tipo no hay nada que comparar', () => {
    expect(unknownFields({ sobra: 1 }, undefined)).toEqual([]);
  });
});

describe('campos que el tipo no usa', () => {
  it('avisa del campo ignorado en un bloque que compila', () => {
    const compiled = compileDsl(
      'chart',
      ['type: bar', 'data:', '  - {x: Enero, y: 10}', 'notas: sobra'].join('\n'),
    );
    expect(compiled.warnings).toHaveLength(1);
    expect(compiled.warnings![0]!.field).toBe('notas');
    expect(compiled.warnings![0]!.code).toBe(ERROR_CODES.DSL_FIELD_UNKNOWN);
    expect(compiled.warnings![0]!.suggestion).toBeUndefined();
  });

  it('un bloque correcto no genera avisos', () => {
    const compiled = compileDsl('diagram', ['type: sequence', 'participants:', '  - A', 'flow:', '  - A -> A: eco'].join('\n'));
    expect(compiled.warnings).toBeUndefined();
  });

  it('propone el campo correcto cuando la diferencia es una errata', () => {
    const warnings = unknownFields({ particpants: [] }, findType('sequence'));
    expect(warnings[0]!.suggestion).toBe('participants');
    expect(warnings[0]!.message).toContain('quiza querias "participants"');
  });

  it('no inventa sugerencias para un campo que no se parece a nada', () => {
    const warnings = unknownFields({ zzz: 1 }, findType('sequence'));
    expect(warnings[0]!.suggestion).toBeUndefined();
    expect(warnings[0]!.message).toContain('se ha ignorado');
  });

  it('en un campo corto dos ediciones ya son otra palabra', () => {
    // "no" esta a distancia 2 de "type", pero con dos letras eso no es una errata.
    expect(unknownFields({ no: 1 }, findType('sequence'))[0]!.suggestion).toBeUndefined();
  });
});

describe('el error senala la errata que lo causo', () => {
  it('adjunta los campos no reconocidos al fallo del compilador', () => {
    let error: DslValidationError | undefined;
    try {
      compileDsl('diagram', ['type: sequence', 'particpants:', '  - Usuario', 'steps:', '  - uno'].join('\n'));
    } catch (err) {
      error = err as DslValidationError;
    }
    expect(error).toBeInstanceOf(DslValidationError);
    const texto = error!.format();
    expect(texto).toContain(`codigo: ${ERROR_CODES.DSL_FIELD_MISSING}`);
    expect(texto).toContain('quiza querias "participants"');
    expect(texto).toContain('el campo "steps" no existe');
    expect(texto).toContain('campos del ejemplo de sequence');
    expect(texto).toContain('docviz types sequence');
  });

  it('el codigo distingue el tipo de fallo', () => {
    const codigo = (source: string, lang = 'diagram'): string => {
      try {
        compileDsl(lang, source);
        return 'sin error';
      } catch (err) {
        return (err as DocVizError).code;
      }
    };
    expect(codigo('type: sequence\nparticipants: [A]\nflow: [{}]')).not.toBe('sin error');
    expect(codigo(': : :')).toBe(ERROR_CODES.DSL_YAML);
    expect(codigo('participants: [A]')).toBe(ERROR_CODES.DSL_FIELD_MISSING);
    expect(codigo('type: no-existe')).toBe(ERROR_CODES.DSL_TYPE);
    expect(codigo('type: bar\ndata: []')).toBe(ERROR_CODES.DSL_TYPE);
  });

  it('reetiquetar con la posicion conserva la subclase y el codigo', () => {
    const original = new DslValidationError('roto', 'detalle', ERROR_CODES.DSL_FIELD_TYPE);
    const situado = original.withLocation({ file: 'a.md', line: 7 });
    expect(situado).toBeInstanceOf(DslValidationError);
    expect(situado.code).toBe(ERROR_CODES.DSL_FIELD_TYPE);
    expect(situado.format()).toContain('linea: 7');
    expect(situado.message).toBe('roto');
  });

  it('el detalle adicional se acumula y el vacio no crea copia', () => {
    const original = new DocVizError('roto', {}, 'primero');
    expect(original.withExtraDetail('   ')).toBe(original);
    expect(original.withExtraDetail('segundo').format()).toContain('segundo');
    expect(new DocVizError('roto').withExtraDetail('unico').format()).toContain('unico');
  });
});

// --------------------------------------------------------------------------

describe('el escaneo no se detiene en el primer bloque roto', () => {
  const documento = [
    '# Doc',
    '',
    '```diagram',
    'type: sequence',
    'particpants: [A]',
    '```',
    '',
    '```diagram',
    'type: flow',
    'nodes: [A]',
    '```',
    '',
    '```diagram',
    'type: sequence',
    'participants: [A]',
    'flow:',
    '  - A -> A: eco',
    '```',
    '',
  ].join('\n');

  it('reporta cada bloque invalido con su linea y compila los sanos', () => {
    const scanned = scanDocument(documento, {
      resolveLanguage: () => undefined,
      compileDsl: (lang, source) => compileDsl(lang, source),
      dslLanguages: ['diagram', 'chart', 'architecture'],
    });
    expect(scanned.blocks).toHaveLength(1);
    expect(scanned.errors.map((e) => e.line)).toEqual([3, 8]);
    expect(scanned.errors.every((e) => e.error instanceof DocVizError)).toBe(true);
  });

  it('check enumera los tres documentos rotos en una sola pasada', async () => {
    const root = await project({
      'docs-src/a.md': documento,
      'docs-src/b.md': ['```diagram', 'type: sequence', 'particpants: [A]', '```', ''].join('\n'),
    });
    const result = await check(config(root));

    expect(result.invalidBlocks).toBe(3);
    expect(result.blocks).toBe(1);
    expect(result.errors).toHaveLength(3);
    expect(result.errors.every((e) => e.location.line !== undefined)).toBe(true);
    expect(result.errors[0]!.location.file).toBe('docs-src/a.md');
  });

  it('los avisos viajan con su archivo y su linea', async () => {
    const root = await project({
      'docs-src/c.md': ['```chart', 'type: bar', 'data:', '  - {x: A, y: 1}', 'notas: sobra', '```', ''].join('\n'),
    });
    const result = await check(config(root));

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toEqual([
      {
        file: 'docs-src/c.md',
        line: 1,
        lang: 'chart',
        code: ERROR_CODES.DSL_FIELD_UNKNOWN,
        field: 'notas',
        message: expect.stringContaining('"notas"') as unknown as string,
      },
    ]);
  });
});

describe('campos sin usar dentro de un mapa anidado', () => {
  it('detecta la errata dentro de un elemento de una lista', () => {
    const compiled = compileDsl(
      'diagram',
      [
        'type: erd',
        'entities:',
        '  - name: Pedido',
        '    fieldz:',
        '      - name: id',
        '        type: uuid',
      ].join('\n'),
    );
    const aviso = compiled.warnings?.find((w) => w.field === 'fieldz');
    expect(aviso).toBeDefined();
    expect(aviso!.message).toContain('en diagram.entities');
    expect(aviso!.code).toBe(ERROR_CODES.DSL_FIELD_UNKNOWN);
  });

  it('propone el campo hermano cuando la errata se le parece', () => {
    const compiled = compileDsl(
      'diagram',
      ['type: erd', 'entities:', '  - nombre: Pedido', '    name: Pedido'].join('\n'),
    );
    // `nombre` no se lee; `name` si. La sugerencia sale de lo que el compilador
    // leyo en ese mismo mapa, no de una lista escrita a mano.
    expect(compiled.warnings?.some((w) => w.field === 'nombre')).toBe(true);
  });

  it('el catalogo entero no produce ni un aviso', () => {
    // Es la prueba que decide si esto se puede activar: 57 ejemplos escritos
    // sin pensar en este analisis. Un falso positivo aqui lo invalidaria.
    for (const spec of TYPE_CATALOG) {
      const compiled = compileDsl(spec.lang, spec.example);
      expect(compiled.warnings ?? [], `${spec.type} genero avisos`).toEqual([]);
    }
  });

  it('la observacion no se filtra entre compilaciones', () => {
    compileDsl('diagram', ['type: erd', 'entities:', '  - name: A', '    sobra: 1'].join('\n'));
    const limpio = compileDsl('diagram', ['type: erd', 'entities:', '  - name: B'].join('\n'));
    expect(limpio.warnings).toBeUndefined();
  });
});
