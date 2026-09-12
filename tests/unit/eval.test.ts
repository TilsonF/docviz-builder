/**
 * Pruebas del banco de casos del eval.
 *
 * El eval mide si un modelo sabe usar DocViz; estas pruebas comprueban que la
 * medida sea honesta. Un caso que espera un tipo inexistente no mide nada:
 * fallaria siempre y bajaria el numero sin que nadie pueda arreglarlo.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findType } from '../../src/dsl/index.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface Caso {
  id: string;
  necesidad: string;
  tipo: string;
  acepta?: string[];
  /** El enunciado nombra el tipo porque asi es como se pide de verdad. */
  nombraTipo?: boolean;
}

const casos = JSON.parse(await readFile(path.join(raiz, 'eval', 'casos.json'), 'utf8')) as Caso[];

// El extractor del script del eval: se importa para no tener dos copias.
const { extraerBloque } = (await import('../../scripts/eval.mjs')) as {
  extraerBloque: (texto: string) => { lang: string; source: string } | undefined;
};

describe('banco de casos', () => {
  it('tiene un volumen suficiente para que el porcentaje signifique algo', () => {
    expect(casos.length).toBeGreaterThanOrEqual(30);
  });

  it('no repite identificadores', () => {
    expect(new Set(casos.map((c) => c.id)).size).toBe(casos.length);
  });

  it('todos los tipos esperados existen en el catalogo', () => {
    const inexistentes = casos
      .flatMap((c) => [c.tipo, ...(c.acepta ?? [])])
      .filter((t) => findType(t) === undefined);
    expect(inexistentes).toEqual([]);
  });

  it('el tipo esperado esta siempre entre los aceptados', () => {
    for (const caso of casos) {
      if (caso.acepta === undefined) continue;
      expect(caso.acepta).toContain(caso.tipo);
    }
  });

  it('las necesidades estan escritas como las escribiria una persona', () => {
    for (const caso of casos) {
      expect(caso.necesidad.length).toBeGreaterThan(30);
      // Nombrar el tipo en el enunciado convertiria el eval en una copia al
      // dictado: lo que se mide es si sabe elegirlo sin que se lo digan. La
      // excepcion se declara caso a caso —"en notacion BPMN" es como se pide
      // de verdad— para que la fuga sea deliberada y visible, no un descuido.
      if (caso.nombraTipo === true) continue;
      expect(caso.necesidad.toLowerCase()).not.toContain(caso.tipo.toLowerCase());
    }
  });

  it('las excepciones a esa regla son pocas y estan justificadas', () => {
    const nombran = casos.filter((c) => c.nombraTipo === true);
    expect(nombran.length).toBeLessThanOrEqual(casos.length / 10);
    // Y solo se admiten cuando el nombre del tipo es tambien la palabra del
    // dominio: nadie dice "quiero un stacked-bar", pero si "en BPMN".
    for (const caso of nombran) {
      expect(caso.necesidad.toLowerCase()).toContain(caso.tipo.toLowerCase());
    }
  });

  it('cubre las tres vallas', () => {
    const vallas = new Set(casos.map((c) => findType(c.tipo)!.lang));
    expect([...vallas].sort()).toEqual(['architecture', 'chart', 'diagram']);
  });
});

describe('extraccion del bloque de la respuesta', () => {
  it('encuentra el bloque aunque venga con texto alrededor', () => {
    const texto = ['Claro, aqui lo tienes:', '', '```diagram', 'type: flow', '```', '', 'Espero que sirva.'].join('\n');
    expect(extraerBloque(texto)).toEqual({ lang: 'diagram', source: 'type: flow\n' });
  });

  it('admite atributos en la valla y se queda con el primer bloque', () => {
    const texto = ['```chart title="X"', 'type: bar', '```', '```diagram', 'type: flow', '```'].join('\n');
    expect(extraerBloque(texto)?.lang).toBe('chart');
  });

  it('devuelve undefined si no hay ningun bloque de DocViz', () => {
    expect(extraerBloque('```python\nprint(1)\n```')).toBeUndefined();
    expect(extraerBloque('no hay nada')).toBeUndefined();
  });
});
