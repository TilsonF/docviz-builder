/**
 * Renderiza de verdad el ejemplo de cada tipo del catalogo.
 *
 * La prueba unitaria del catalogo solo comprueba que el ejemplo *compila*, es
 * decir que se genera el texto que espera el motor. Eso no basta: varios tipos
 * se apoyan en notaciones que sus motores marcan como beta —`sankey`, `block`,
 * `radar`, `treemap`, `kanban`— y si una de ellas cambia de sintaxis, el
 * compilador sigue produciendo su texto tan contento y el fallo solo aparece al
 * dibujar. Sin esta prueba, actualizar Mermaid dejaria la suite en verde y
 * rompería la documentacion de alguien semanas despues.
 *
 * Por eso aqui se llama al motor real.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { TYPE_CATALOG, compileDsl } from '../../src/dsl/index.js';
import { buildRegistry } from '../../src/renderers/index.js';
import { defaultConfig } from '../../src/config/load.js';
import { getTheme } from '../../src/themes/index.js';
import { findBrowser } from '../../src/renderers/browser.js';
import { assertUsableSvg, svgSize } from './helpers.js';
import type { RenderOptions } from '../../src/core/types.js';

const registry = buildRegistry(defaultConfig(process.cwd()));
const available = (engine: string): boolean => registry.has(engine);

const options: RenderOptions = {
  format: 'svg',
  theme: getTheme('corporate'),
  title: 'Catalogo',
  timeoutMs: 120_000,
  maxOutputBytes: 8 * 1024 * 1024,
};

/**
 * Motores que la maquina no puede ejecutar ahora mismo.
 *
 * Se omiten sus tipos en lugar de fallar, pero se dice cuales: una prueba que
 * calla lo que no comprobo se lee como si lo hubiera comprobado.
 */
const sinNavegador = findBrowser() === undefined ? ['mermaid', 'bpmn'] : [];
const omitidos: string[] = [];

afterAll(async () => {
  await registry.disposeAll().catch(() => undefined);
  if (omitidos.length > 0) {
    process.stdout.write(
      `\n  aviso: ${omitidos.length} tipo(s) sin comprobar por falta de motor: ${omitidos.join(', ')}\n`,
    );
  }
});

describe('cada tipo del catalogo se dibuja de verdad', () => {
  for (const spec of TYPE_CATALOG) {
    const motorAusente = sinNavegador.includes(spec.engine);

    it.skipIf(motorAusente)(`${spec.lang}/${spec.type} produce un SVG utilizable`, async () => {
      const compiled = compileDsl(spec.lang, spec.example, available);
      expect(compiled.rendererType).toBe(spec.engine);

      const renderer = registry.get(compiled.rendererType);
      const result = await renderer.render(compiled.source, { ...options, title: spec.type });
      const svg = result.content.toString('utf8');

      // Las tres condiciones que separan "el motor devolvio algo" de "la imagen
      // sirve en un documento".
      assertUsableSvg(svg);
      const { width, height } = svgSize(svg);
      expect(width, `${spec.type} salio sin ancho`).toBeGreaterThan(20);
      expect(height, `${spec.type} salio sin alto`).toBeGreaterThan(20);
    });

    if (motorAusente) omitidos.push(spec.type);
  }
});

/**
 * Un respaldo declarado tiene que dibujar, no solo estar escrito.
 *
 * `fallbacks: ['d2']` es una promesa que se cobra en el peor momento posible:
 * en una maquina sin Java, a mitad de un build. Si el compilador alternativo no
 * existiera o produjera algo ilegible, el fallo aparecereria alli y no aqui.
 */
describe('cada respaldo declarado dibuja de verdad', () => {
  for (const spec of TYPE_CATALOG) {
    for (const respaldo of spec.fallbacks ?? []) {
      const ausente = sinNavegador.includes(respaldo);

      it.skipIf(ausente)(`${spec.type} cae a ${respaldo} y sigue saliendo`, async () => {
        // Se compila como si el motor preferido no existiera en esta maquina.
        const compiled = compileDsl(spec.lang, spec.example, (engine) => engine === respaldo);
        expect(compiled.rendererType).toBe(respaldo);

        const renderer = registry.get(respaldo);
        const result = await renderer.render(compiled.source, { ...options, title: spec.type });
        const svg = result.content.toString('utf8');

        assertUsableSvg(svg);
        const { width, height } = svgSize(svg);
        expect(width, `${spec.type} en ${respaldo} salio sin ancho`).toBeGreaterThan(20);
        expect(height, `${spec.type} en ${respaldo} salio sin alto`).toBeGreaterThan(20);
      });

      if (ausente) omitidos.push(`${spec.type}->${respaldo}`);
    }
  }
});

/**
 * El mismo bloque, dos veces, los mismos bytes.
 *
 * Es la promesa de la que dependen el cache, la reproducibilidad y que un
 * `git diff` no muestre ruido. No tenia prueba, y no la tenia justo donde
 * fallaba: Mermaid inventaba un hash aleatorio por commit en `git-graph`, asi
 * que el archivo se llamaba igual —el nombre sale de la fuente— y cambiaba por
 * dentro en cada build.
 */
describe('el render es determinista', () => {
  for (const spec of TYPE_CATALOG) {
    const motorAusente = sinNavegador.includes(spec.engine);

    it.skipIf(motorAusente)(`${spec.type} produce los mismos bytes dos veces`, async () => {
      const compiled = compileDsl(spec.lang, spec.example, available);
      const renderer = registry.get(compiled.rendererType);
      const opciones = { ...options, title: spec.type };

      const primero = await renderer.render(compiled.source, opciones);
      const segundo = await renderer.render(compiled.source, opciones);

      expect(segundo.content.equals(primero.content), `${spec.type} cambia entre renders`).toBe(true);
    });
  }
});

describe('cobertura de la comprobacion', () => {
  it('se comprueban todos los tipos que la maquina puede dibujar', () => {
    const comprobables = TYPE_CATALOG.filter((s) => !sinNavegador.includes(s.engine));
    expect(comprobables.length + omitidos.length).toBe(TYPE_CATALOG.length);
    // En un entorno con navegador no se omite ninguno.
    if (sinNavegador.length === 0) expect(omitidos).toEqual([]);
  });

  it('el catalogo cubre los motores registrados', () => {
    const usados = new Set(TYPE_CATALOG.map((s) => s.engine));
    for (const motor of registry.types()) {
      // `plantuml-c4` solo aparece como respaldo, no como motor preferido.
      if (motor === 'plantuml-c4') continue;
      expect(usados, `ningun tipo usa el motor ${motor}`).toContain(motor);
    }
  });
});
