/**
 * Pruebas de los esquemas JSON.
 *
 * Un esquema que hay que mantener en paralelo al catalogo se desfasa el mismo
 * dia que se anade un tipo, y entonces engana en lugar de ayudar. Por eso se
 * derivan del catalogo, y por eso lo que se comprueba aqui es que **los 57
 * ejemplos canonicos validen contra su propio esquema**: si alguna vez dejaran
 * de hacerlo, seria el esquema el que esta mal, no el ejemplo.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import ajvModulo from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { TYPE_CATALOG, findType } from '../../src/dsl/index.js';
import { esquemaDeConfiguracion, esquemaDeTipo, esquemaDeValla } from '../../src/dsl/esquema.js';
import { defaultConfig } from '../../src/config/load.js';
import { themeNames } from '../../src/themes/index.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// El paquete es CommonJS: al importarlo desde ESM la clase llega en `default`.
const Ajv2020 = (ajvModulo as unknown as { default?: typeof ajvModulo }).default ?? ajvModulo;
const ajv = new (Ajv2020 as unknown as new (o: object) => { compile: (e: object) => (v: unknown) => boolean })({
  strict: false,
  allErrors: true,
});

const valida = (esquema: object, valor: unknown): boolean => ajv.compile(esquema)(valor);

describe('el esquema de cada tipo', () => {
  it('acepta el ejemplo canonico de los 57', () => {
    const fallan: string[] = [];
    for (const spec of TYPE_CATALOG) {
      const ejemplo = parseYaml(spec.example) as Record<string, unknown>;
      if (!valida(esquemaDeTipo(spec), ejemplo)) fallan.push(spec.type);
    }
    expect(fallan).toEqual([]);
  });

  it('tambien en modo estricto, que es el que marca lo que sobra', () => {
    // Si el ejemplo tuviera un campo que el propio esquema no declara, el
    // esquema estaria describiendo otra cosa.
    const fallan: string[] = [];
    for (const spec of TYPE_CATALOG) {
      const ejemplo = parseYaml(spec.example) as Record<string, unknown>;
      if (!valida(esquemaDeTipo(spec, true), ejemplo)) fallan.push(spec.type);
    }
    expect(fallan).toEqual([]);
  });

  it('exige el `type` correcto', () => {
    const spec = findType('sequence')!;
    expect(valida(esquemaDeTipo(spec), { type: 'flow', participants: ['A'] })).toBe(false);
    expect(valida(esquemaDeTipo(spec), { participants: ['A'] })).toBe(false);
  });

  it('marca la errata cuando se le pide ser estricto', () => {
    const spec = findType('sequence')!;
    const conErrata = { type: 'sequence', particpants: ['A'], flow: ['A -> A: eco'] };
    expect(valida(esquemaDeTipo(spec, true), conErrata)).toBe(false);
    // Y no la marca por defecto: el ejemplo es el esqueleto minimo, no la lista
    // completa, asi que un editor estricto avisaria de campos legitimos.
    expect(valida(esquemaDeTipo(spec), conErrata)).toBe(true);
  });

  it('describe el tipo con su proposito, que es lo que lee quien elige', () => {
    const esquema = esquemaDeTipo(findType('funnel')!) as { description: string };
    expect(esquema.description).toContain('etapas');
  });
});

describe('el esquema de una valla', () => {
  it('enumera los tipos de esa valla y solo esos', () => {
    const esquema = esquemaDeValla('chart') as { properties: { type: { enum: string[] } } };
    const esperados = TYPE_CATALOG.filter((s) => s.lang === 'chart').map((s) => s.type);
    expect(esquema.properties.type.enum.sort()).toEqual(esperados.sort());
  });

  it('resuelve por el valor de `type`, como el compilador', () => {
    const esquema = esquemaDeValla('diagram');
    expect(valida(esquema, parseYaml(findType('sequence')!.example))).toBe(true);
    expect(valida(esquema, parseYaml(findType('gantt')!.example))).toBe(true);
    // Un tipo de otra valla no vale aqui.
    expect(valida(esquema, { type: 'bar', data: [] })).toBe(false);
  });

  it('acepta los 57 ejemplos por su valla', () => {
    const fallan: string[] = [];
    for (const lang of ['diagram', 'chart', 'architecture'] as const) {
      const esquema = esquemaDeValla(lang);
      for (const spec of TYPE_CATALOG.filter((s) => s.lang === lang)) {
        if (!valida(esquema, parseYaml(spec.example))) fallan.push(`${lang}/${spec.type}`);
      }
    }
    expect(fallan).toEqual([]);
  });

  it('en arquitectura el `type` es opcional, como en el DSL', () => {
    // El compilador asume `c4-context` cuando no se declara.
    expect(valida(esquemaDeValla('architecture'), { elements: [{ id: 'a', name: 'A' }] })).toBe(true);
  });
});

describe('el esquema de la configuracion', () => {
  it('acepta la configuracion por defecto', () => {
    const esquema = esquemaDeConfiguracion(themeNames());
    const porDefecto = defaultConfig(raiz);
    expect(
      valida(esquema, {
        source: porDefecto.source,
        output: { dir: porDefecto.output, assetsDir: porDefecto.assetsDir },
        theme: { name: porDefecto.theme.name },
        cache: porDefecto.cache,
        hash: porDefecto.hash,
      }),
    ).toBe(true);
  });

  it('acepta la configuracion real de este proyecto', async () => {
    const texto = await readFile(path.join(raiz, 'docviz.config.yaml'), 'utf8');
    expect(valida(esquemaDeConfiguracion(themeNames()), parseYaml(texto))).toBe(true);
  });

  it('acepta un tema de marca', () => {
    const esquema = esquemaDeConfiguracion(themeNames());
    expect(valida(esquema, { theme: { name: 'acme', base: 'corporate', palette: { primary: '#0F62FE' } } })).toBe(true);
  });

  it('rechaza un backend que no existe y una escala imposible', () => {
    const esquema = esquemaDeConfiguracion(themeNames());
    expect(valida(esquema, { renderers: { backend: 'inventado' } })).toBe(false);
    expect(valida(esquema, { renderers: { png: { scale: 10 } } })).toBe(false);
  });

  it('los temas que ofrece son los que existen de verdad', () => {
    const esquema = esquemaDeConfiguracion(themeNames()) as {
      properties: { theme: { properties: { base: { enum: string[] } } } };
    };
    expect(esquema.properties.theme.properties.base.enum).toEqual(themeNames());
  });
});
