/**
 * El destino del dibujo.
 *
 * Lo que se comprueba no es que el SVG mida tantos pixeles, sino las dos reglas
 * que justifican la funcion: la letra alcanza el minimo del destino cuando cabe,
 * y cuando no cabe el dibujo no se recorta y queda dicho.
 */

import { describe, expect, it } from 'vitest';
import {
  ajustarTamano,
  esTamanoSalida,
  letraMinima,
  LIENZOS,
  veredictoDensidad,
} from '../../src/core/salida.js';

const svg = (vb: string, fuente = 10): string =>
  `<svg viewBox="${vb}" width="200" height="100"><text font-size="${fuente}">x</text></svg>`;

describe('letraMinima', () => {
  it('toma la mas pequena del atributo y del CSS', () => {
    const texto = '<svg><text font-size="14"/><style>.a{font-size:9px}</style></svg>';
    expect(letraMinima(texto)).toBe(9);
  });

  it('ignora los valores relativos, que no se pueden resolver sin maquetar', () => {
    expect(letraMinima('<svg><text font-size="1.2em"/></svg>')).toBeUndefined();
    expect(letraMinima('<svg><style>.a{font-size:80%}</style></svg>')).toBeUndefined();
  });

  it('sin texto no hay minimo', () => {
    expect(letraMinima('<svg><rect/></svg>')).toBeUndefined();
  });
});

describe('ajustarTamano', () => {
  it('`fit` no toca nada', () => {
    const entrada = svg('0 0 200 100');
    expect(ajustarTamano(entrada, 'fit').svg).toBe(entrada);
  });

  it('agranda solo lo que haga falta para que la letra alcance el minimo', () => {
    // 9 px de letra en una pagina que pide 12: hace falta x1,33 y nada mas,
    // aunque en el ancho de la pagina quepa cuatro veces mas grande.
    const out = ajustarTamano(svg('0 0 200 100', 9), 'doc-inline');
    expect(out.escala).toBeCloseTo(12 / 9, 3);
    expect(out.svg).toContain('width="267"');
    expect(out.demasiadoDenso).toBeUndefined();
    // La geometria no se toca: solo cambia el lienzo.
    expect(out.svg).toContain('viewBox="0 0 200 100"');
  });

  it('no sobrepasa el destino: antes letra pequena que dibujo recortado', () => {
    // Un diagrama de 2000x1200 con letra de 6 px en una 16:9 de 1280x720.
    const denso = '<svg viewBox="0 0 2000 1200" width="2000" height="1200"><text font-size="6">x</text></svg>';
    const out = ajustarTamano(denso, 'slide-16x9');
    const lienzo = LIENZOS['slide-16x9'];
    expect(out.escala).toBeLessThanOrEqual(lienzo.height / 1200 + 1e-9);
    expect(Number(/width="(\d+)"/.exec(out.svg)![1]!)).toBeLessThanOrEqual(lienzo.width);
    expect(out.demasiadoDenso).toEqual({ letraEfectiva: 3.6, letraMinima: 16 });
  });

  it('en una pagina, un dibujo que ya cabe y se lee no se toca', () => {
    const alto = '<svg viewBox="0 0 400 3000" width="400" height="3000"><text font-size="12">x</text></svg>';
    const out = ajustarTamano(alto, 'doc-inline');
    expect(out.escala).toBe(1);
    expect(out.demasiadoDenso).toBeUndefined();
  });

  it('en una pagina, un dibujo que desborda se reduce y se avisa', () => {
    const ancho = '<svg viewBox="0 0 2000 600" width="2000" height="600"><text font-size="12">x</text></svg>';
    const out = ajustarTamano(ancho, 'doc-inline');
    expect(out.escala).toBeCloseTo(680 / 2000, 4);
    expect(out.svg).toContain('width="680"');
    expect(out.demasiadoDenso).toEqual({ letraEfectiva: 4.1, letraMinima: 12 });
  });

  it('en una diapositiva el dibujo ocupa el destino', () => {
    const pequeno = '<svg viewBox="0 0 320 180" width="320" height="180"><text font-size="20">x</text></svg>';
    const out = ajustarTamano(pequeno, 'slide-16x9');
    expect(out.escala).toBeCloseTo(4, 3);
    expect(out.svg).toContain('width="1280"');
    expect(out.demasiadoDenso).toBeUndefined();
  });

  it('sin viewBox no hay geometria de la que partir', () => {
    const sinVb = '<svg width="10" height="10"><text font-size="4">x</text></svg>';
    expect(ajustarTamano(sinVb, 'slide-16x9').svg).toBe(sinVb);
  });

  it('es idempotente: volver a ajustar al mismo destino no mueve nada', () => {
    const una = ajustarTamano(svg('0 0 200 100', 10), 'slide-16x9').svg;
    expect(ajustarTamano(una, 'slide-16x9').svg).toBe(una);
  });
});

describe('veredictoDensidad', () => {
  it('reconstruye la escala desde los bytes finales', () => {
    // Es el camino del acierto de cache: no se pasa por el motor y el aviso
    // tiene que salir igual.
    const ajustado = ajustarTamano(
      '<svg viewBox="0 0 2000 1200" width="2000" height="1200"><text font-size="6">x</text></svg>',
      'slide-16x9',
    );
    expect(veredictoDensidad(ajustado.svg, 'slide-16x9')).toEqual(ajustado.demasiadoDenso);
  });

  it('`fit` no opina de densidad', () => {
    expect(veredictoDensidad(svg('0 0 200 100', 4), 'fit')).toBeUndefined();
  });

  it('un dibujo legible no produce veredicto', () => {
    const out = ajustarTamano(svg('0 0 200 100', 10), 'slide-16x9');
    expect(veredictoDensidad(out.svg, 'slide-16x9')).toBeUndefined();
  });
});

describe('esTamanoSalida', () => {
  it('acepta los declarados y rechaza el resto', () => {
    expect(esTamanoSalida('slide-16x9')).toBe(true);
    expect(esTamanoSalida('slide')).toBe(false);
  });
});

describe('veredictoDensidad, casos de borde', () => {
  it('sin viewBox o sin texto no hay veredicto que dar', () => {
    expect(veredictoDensidad('<svg width="10"><text font-size="2">x</text></svg>', 'slide-16x9')).toBeUndefined();
    expect(veredictoDensidad('<svg viewBox="0 0 10 10" width="10"><rect/></svg>', 'slide-16x9')).toBeUndefined();
  });

  it('sin `width` declarado supone que no hay escala', () => {
    // Es el caso de un SVG que no paso por el ajuste: se juzga tal cual mide.
    const sinAncho = '<svg viewBox="0 0 100 50"><text font-size="4">x</text></svg>';
    expect(veredictoDensidad(sinAncho, 'doc-inline')).toEqual({ letraEfectiva: 4, letraMinima: 12 });
  });
});

describe('LIENZOS', () => {
  it('todo destino declara para que sirve y una letra minima', () => {
    for (const [nombre, lienzo] of Object.entries(LIENZOS)) {
      expect(lienzo.purpose, nombre).not.toBe('');
      expect(lienzo.minFontPx, nombre).toBeGreaterThan(0);
      expect(lienzo.width, nombre).toBeGreaterThan(0);
    }
  });
});

describe('fijarLienzo, por el camino del SVG sin dimensiones', () => {
  it('anade width y height cuando el motor no los declaro', () => {
    // Mermaid emite `width="100%"` sin `height`, y un motor nativo puede no
    // declarar ninguno: el ajuste tiene que poder escribirlos, no solo
    // sustituirlos.
    const sinDimensiones = '<svg viewBox="0 0 200 100"><text font-size="8">x</text></svg>';
    const out = ajustarTamano(sinDimensiones, 'slide-16x9');
    expect(out.svg).toContain('width="1280"');
    expect(out.svg).toContain('height="640"');
  });

  it('un viewBox degenerado no se toca', () => {
    const plano = '<svg viewBox="0 0 0 100" width="1" height="1"><text font-size="8">x</text></svg>';
    expect(ajustarTamano(plano, 'slide-16x9').svg).toBe(plano);
    const roto = '<svg viewBox="0 0 10" width="1" height="1"><text font-size="8">x</text></svg>';
    expect(ajustarTamano(roto, 'slide-16x9').svg).toBe(roto);
  });

  it('sin etiqueta svg no hay nada que ajustar', () => {
    expect(ajustarTamano('no es un svg', 'slide-16x9').svg).toBe('no es un svg');
  });

  it('una letra de cero o negativa se ignora', () => {
    expect(letraMinima('<svg><text font-size="0"/><text font-size="11"/></svg>')).toBe(11);
  });

  it('un width no numerico se trata como ausente', () => {
    const porcentual = '<svg viewBox="0 0 100 50" width="100%"><text font-size="4">x</text></svg>';
    expect(veredictoDensidad(porcentual, 'doc-inline')).toEqual({ letraEfectiva: 4, letraMinima: 12 });
  });
});
