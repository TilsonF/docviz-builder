/**
 * Densidad del PNG nativo de PlantUML.
 *
 * PlantUML no pasa por el rasterizador: dibuja su propio PNG a 96 ppp. La
 * escala del proyecto le llega como `skinparam dpi`, y lo que se comprueba aqui
 * es la conversion. Que el PNG salga de verdad al doble lo comprueba la prueba
 * de integracion `png-escala-plantuml`.
 */

import { describe, expect, it } from 'vitest';
import { plantUmlDpi } from '../../src/renderers/plantuml.js';

describe('plantUmlDpi', () => {
  it('a escala 1 no pide nada: el PNG sale como siempre', () => {
    expect(plantUmlDpi(1)).toBeUndefined();
    expect(plantUmlDpi(undefined)).toBeUndefined();
  });

  it('convierte la escala en ppp sobre la base de 96', () => {
    expect(plantUmlDpi(2)).toBe(192);
    expect(plantUmlDpi(1.5)).toBe(144);
    expect(plantUmlDpi(4)).toBe(384);
  });

  it('redondea a un entero, que es lo que acepta skinparam', () => {
    expect(plantUmlDpi(1.25)).toBe(120);
    expect(Number.isInteger(plantUmlDpi(1.33))).toBe(true);
  });
});
