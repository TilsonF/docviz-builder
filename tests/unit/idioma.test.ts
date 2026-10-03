/**
 * El idioma de lo que se lee cuando algo falla.
 *
 * `COMPATIBILIDAD.md` marca la decision sobre el idioma por defecto como
 * condicion para la 1.0, porque cambiarlo despues romperia a quien analice la
 * salida. Aqui se comprueban las dos mitades de esa condicion: que el
 * mecanismo existe, y que el valor por defecto NO ha cambiado todavia.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { fijarIdioma, idioma, t } from '../../src/core/idioma.js';
import { DocVizError } from '../../src/core/errors.js';
import { compileDsl } from '../../src/dsl/index.js';

afterEach(() => {
  fijarIdioma('es');
});

describe('idioma', () => {
  it('por defecto es espanol, y cambiarlo sera un cambio incompatible', () => {
    // Si esta prueba falla, la 1.0 acaba de tomar una decision: compruebese
    // que sea deliberada y que este en COMPATIBILIDAD.md.
    expect(idioma()).toBe('es');
  });

  it('`t` elige segun el idioma activo', () => {
    expect(t('hola', 'hello')).toBe('hola');
    fijarIdioma('en');
    expect(t('hola', 'hello')).toBe('hello');
  });

  it('fijarlo devuelve el anterior, para poder restaurarlo', () => {
    expect(fijarIdioma('en')).toBe('es');
    expect(fijarIdioma('es')).toBe('en');
  });
});

describe('lo que lee una persona cuando algo falla', () => {
  const error = (): string =>
    new DocVizError('mensaje', { file: 'a.md', line: 3 }, 'contexto').format();

  it('el andamiaje del error se traduce entero', () => {
    expect(error()).toContain('codigo:');
    expect(error()).toContain('motivo:');
    fijarIdioma('en');
    expect(error()).toContain('code:');
    expect(error()).toContain('reason:');
    expect(error()).not.toContain('codigo:');
  });

  const fallo = (): string => {
    try {
      compileDsl('chart', 'type: bar\ndata: texto\n');
      return '';
    } catch (err) {
      return (err as Error).message;
    }
  };

  it('los mensajes del camino comun tambien', () => {
    // «debe ser una lista» es la familia mas frecuente de todas: sale cada vez
    // que alguien escribe un escalar donde iba una lista.
    expect(fallo()).toBe('chart.data debe ser una lista con al menos un elemento');
    fijarIdioma('en');
    expect(fallo()).toBe('chart.data must be a list with at least one item');
  });

  it('el codigo NO cambia con el idioma', () => {
    // Es lo que un agente usa para decidir, y por eso no se traduce nunca.
    const codigo = (): string => {
      try {
        compileDsl('chart', 'type: noexiste\n');
        return '';
      } catch (err) {
        return (err as { code?: string }).code ?? '';
      }
    };
    const es = codigo();
    fijarIdioma('en');
    expect(codigo()).toBe(es);
    expect(es).toBe('DV106');
  });
});
