/**
 * Pruebas de la reparacion automatica.
 *
 * El ciclo "falla, lee el error, reintenta" cuesta una llamada al modelo por
 * vuelta, y la mitad de las vueltas son una letra cambiada de sitio. Esto
 * resuelve esa mitad sin adivinar: solo aplica lo que se deduce del catalogo, y
 * vuelve a compilar para no prometer nada que no haya comprobado.
 */

import { describe, expect, it } from 'vitest';
import { fixBlock } from '../../src/mcp/tools.js';
import { ERROR_CODES } from '../../src/core/errors.js';
import { TYPE_CATALOG } from '../../src/dsl/index.js';

const bloque = (...lineas: string[]): string => lineas.join('\n');

describe('lo que sabe arreglar', () => {
  it('renombra la errata y el bloque pasa a compilar', () => {
    const r = fixBlock({
      source: bloque('type: sequence', 'particpants:', '  - Usuario', 'flow:', '  - Usuario -> Usuario: eco'),
    });

    expect(r.ok).toBe(true);
    expect(r['cambiado']).toBe(true);
    expect(r['aplicado']).toEqual([{ de: 'particpants', a: 'participants' }]);
    expect(r['source']).toContain('participants:');
    expect(r['source']).not.toContain('particpants:');
  });

  it('conserva el texto tal como se escribio', () => {
    // Devolver el bloque reformateado seria devolver otro bloque: se pierden
    // los comentarios y el orden que alguien eligio a proposito.
    const original = bloque(
      '# el flujo de entrada',
      'type: sequence',
      'title:    Login',
      'particpants:',
      '  - Usuario',
      '',
      'flow:',
      '  - Usuario -> Usuario: eco',
    );
    const r = fixBlock({ source: original });

    expect(r['source']).toContain('# el flujo de entrada');
    expect(r['source']).toContain('title:    Login');
    expect(String(r['source']).split('\n').length).toBe(original.split('\n').length);
  });

  it('no toca un bloque que ya estaba bien', () => {
    const bueno = bloque('type: sequence', 'participants:', '  - A', 'flow:', '  - A -> A: eco');
    const r = fixBlock({ source: bueno });

    expect(r.ok).toBe(true);
    expect(r['cambiado']).toBe(false);
    expect(r['source']).toBe(bueno);
    expect(r['nota']).toContain('ya compilaba');
  });

  it('arregla tambien el campo que sobra en un bloque que compila', () => {
    const r = fixBlock({ source: bloque('type: bar', 'data:', '  - label: A', '    value: 1', 'titulo: X') });
    // "titulo" se parece a "title": es una errata, no un campo inventado.
    expect(r['aplicado']).toEqual([{ de: 'titulo', a: 'title' }]);
    expect(r['source']).toContain('title: X');
  });
});

describe('lo que no se inventa', () => {
  it('no fusiona dos claves cuando el destino ya existe', () => {
    const r = fixBlock({
      source: bloque('type: sequence', 'title: A', 'titulo: B', 'participants: [X]', 'flow:', '  - X -> X: eco'),
    });
    // Renombrar `titulo` a `title` perderia uno de los dos valores.
    expect(r['aplicado']).toEqual([]);
    expect(r['source']).toContain('titulo: B');
  });

  it('ante un campo que no se parece a nada, devuelve el diagnostico y el ejemplo', () => {
    const r = fixBlock({ source: bloque('type: sequence', 'zzz: 1') });

    expect(r.ok).toBe(false);
    expect(r['code']).toBe(ERROR_CODES.DSL_FIELD_MISSING);
    expect(String(r['ejemplo'])).toContain('participants');
  });

  it('con YAML invalido no intenta corregir nada', () => {
    const r = fixBlock({ source: ': : :' });
    expect(r.ok).toBe(false);
    expect(r['code']).toBe(ERROR_CODES.DSL_YAML);
    expect(r['aplicado']).toEqual([]);
  });

  it('rechaza una valla que no existe', () => {
    const r = fixBlock({ lang: 'inventada', source: 'type: sequence' });
    expect(r.ok).toBe(false);
    expect(r['code']).toBe(ERROR_CODES.DSL_TYPE);
  });
});

describe('sobre el catalogo entero', () => {
  it('ningun ejemplo canonico se ve alterado', () => {
    // Si la reparacion tocara un bloque valido, estaria rompiendo mas de lo que
    // arregla. Es la misma garantia que se le exige al saneador de SVG.
    for (const spec of TYPE_CATALOG) {
      const r = fixBlock({ lang: spec.lang, source: spec.example });
      expect(r.ok, `${spec.type} no compilo`).toBe(true);
      expect(r['cambiado'], `${spec.type} fue modificado`).toBe(false);
      expect(r['source'], spec.type).toBe(spec.example);
    }
  });
});

describe('erratas dentro de una lista', () => {
  // Todos estos casos nacieron de probar `fix` contra bloques rotos de verdad,
  // no de leer el codigo.

  it('no se come el guion de la lista al renombrar', () => {
    // Era lo peor que hacia: `- labl: A` salia como `label: A`, sin guion, y el
    // bloque dejaba de ser YAML valido. `fix` devolvia algo peor que lo que
    // recibio.
    const out = fixBlock({ lang: 'chart', source: 'type: scatter\ndata:\n  - labl: A\n    x: 1\n    y: 2\n' });
    expect(out.ok).toBe(true);
    expect(out.source).toBe('type: scatter\ndata:\n  - label: A\n    x: 1\n    y: 2\n');
  });

  it('corrige la errata de un campo opcional anidado', () => {
    const out = fixBlock({
      lang: 'chart',
      source: 'type: kpi-card\ndata:\n  - label: A\n    value: 1\n    targ3t: 2\n',
    });
    expect(out.ok).toBe(true);
    expect(out.aplicado).toEqual([{ de: 'targ3t', a: 'target' }]);
  });

  it('corrige tambien cuando el campo mal escrito era obligatorio', () => {
    // Si falta un obligatorio el compilador lanza, y entonces no hay rastreador
    // de accesos, que es de donde salen normalmente los avisos anidados. Sin
    // una segunda fuente, `fix` callaba justo cuando mas falta hacia.
    const out = fixBlock({
      lang: 'chart',
      source: 'type: calendar-heatmap\ndata:\n  - dat3: 2026-09-01\n    value: 3\n',
    });
    expect(out.ok).toBe(true);
    expect(out.aplicado).toEqual([{ de: 'dat3', a: 'date' }]);
  });

  it('llega a dos niveles de anidamiento', () => {
    const out = fixBlock({
      lang: 'chart',
      source: 'type: bump\nseries:\n  - name: A\n    data:\n      - label: SP1\n        valu: 1\n',
    });
    expect(out.ok).toBe(true);
    expect(out.aplicado).toEqual([{ de: 'valu', a: 'value' }]);
  });

  it('funciona igual en la valla diagram', () => {
    const out = fixBlock({
      lang: 'diagram',
      source: 'type: gantt\nsections:\n  - name: S\n    tasks:\n      - name: T\n        start: 2026-09-01\n        duration: 3d\n        statu: done\n',
    });
    expect(out.ok).toBe(true);
    expect(out.aplicado).toEqual([{ de: 'statu', a: 'status' }]);
  });

  it('no inventa un aviso sobre un campo valido que el ejemplo no enseña', () => {
    // El ejemplo del catalogo muestra la forma de uso, no la lista completa de
    // campos: `lowerIsBetter` es legitimo y no sale en el suyo.
    const out = fixBlock({
      lang: 'chart',
      source: 'type: kpi-card\ndata:\n  - label: A\n    value: 9\n    target: 5\n    lowerIsBetter: true\n',
    });
    expect(out.ok).toBe(true);
    expect(out.cambiado).toBe(false);
  });

  it('no propone nada cuando el campo no es una errata sino otra palabra', () => {
    // `meta` es `target` en espanol, no una errata suya. Adivinarlo seria
    // inventar: se avisa de que no se uso y ahi acaba.
    const out = fixBlock({ lang: 'chart', source: 'type: bullet\ndata:\n  - label: A\n    value: 1\n    meta: 2\n' });
    expect(out.ok).toBe(false);
    expect(out.aplicado).toEqual([]);
    expect(out['ejemplo']).toContain('type: bullet');
  });
});
