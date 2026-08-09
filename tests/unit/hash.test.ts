/**
 * Pruebas de hashing y determinismo (seccion 19 — Hash).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HASH_LENGTH,
  HashRegistry,
  MAX_HASH_LENGTH,
  MIN_HASH_LENGTH,
  fingerprint,
  fullHash,
  shortHash,
  stableStringify,
} from '../../src/core/hash.js';
import { getTheme, themeFingerprint } from '../../src/themes/index.js';

const base = {
  rendererType: 'plantuml',
  source: '@startuml\nA -> B\n@enduml',
  themeName: 'default',
  themeFingerprint: 'aaaa1111',
  rendererVersion: 'plantuml-1.2026.0',
  format: 'svg' as const,
};

describe('hash del recurso', () => {
  it('el mismo input produce el mismo hash', () => {
    expect(shortHash(base)).toBe(shortHash({ ...base }));
    expect(fullHash(base)).toBe(fullHash({ ...base }));
  });

  it('cambiar el source cambia el hash', () => {
    expect(shortHash({ ...base, source: `${base.source} ` })).not.toBe(shortHash(base));
  });

  it('cambiar el tema cambia el hash', () => {
    expect(shortHash({ ...base, themeName: 'corporate' })).not.toBe(shortHash(base));
  });

  it('cambiar el contenido del tema (sin cambiar su nombre) cambia el hash', () => {
    expect(shortHash({ ...base, themeFingerprint: 'bbbb2222' })).not.toBe(shortHash(base));
  });

  it('cambiar la version del renderer cambia el hash', () => {
    expect(shortHash({ ...base, rendererVersion: 'plantuml-1.2027.0' })).not.toBe(shortHash(base));
  });

  it('cambiar el tipo de renderer cambia el hash', () => {
    expect(shortHash({ ...base, rendererType: 'mermaid' })).not.toBe(shortHash(base));
  });

  it('cambiar el formato cambia el hash', () => {
    expect(shortHash({ ...base, format: 'png' })).not.toBe(shortHash(base));
  });

  it('no confunde componentes por concatenacion ambigua', () => {
    // "ab" + "c" nunca debe producir el mismo digest que "a" + "bc".
    const a = fullHash({ ...base, rendererType: 'ab', source: 'c' });
    const b = fullHash({ ...base, rendererType: 'a', source: 'bc' });
    expect(a).not.toBe(b);
  });

  it('respeta la longitud pedida dentro del rango admitido', () => {
    expect(shortHash(base, MIN_HASH_LENGTH)).toHaveLength(MIN_HASH_LENGTH);
    expect(shortHash(base, MAX_HASH_LENGTH)).toHaveLength(MAX_HASH_LENGTH);
    expect(shortHash(base)).toHaveLength(DEFAULT_HASH_LENGTH);
  });

  it('rechaza longitudes fuera de rango', () => {
    expect(() => shortHash(base, 4)).toThrow(RangeError);
    expect(() => shortHash(base, 32)).toThrow(RangeError);
    expect(() => shortHash(base, 10.5)).toThrow(RangeError);
  });

  it('el hash corto es prefijo del completo', () => {
    expect(fullHash(base).startsWith(shortHash(base))).toBe(true);
  });
});

describe('stableStringify', () => {
  it('ordena las claves para que el orden de propiedades no altere el hash', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it('conserva el orden de los arrays', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('ignora propiedades undefined', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });
});

describe('themeFingerprint', () => {
  it('distingue temas distintos', () => {
    const names = ['default', 'corporate', 'executive', 'dark'];
    const prints = names.map((n) => themeFingerprint(getTheme(n)));
    expect(new Set(prints).size).toBe(names.length);
  });

  it('es estable entre invocaciones', () => {
    expect(themeFingerprint(getTheme('corporate'))).toBe(themeFingerprint(getTheme('corporate')));
  });

  it('fingerprint distingue objetos distintos', () => {
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});

describe('HashRegistry — deteccion de colisiones', () => {
  it('acepta un prefijo nuevo', () => {
    const registry = new HashRegistry();
    expect(registry.claim('abcd1234', 'abcd1234ffff')).toEqual({ ok: true, duplicate: false });
  });

  it('marca como duplicado el mismo recurso repetido', () => {
    const registry = new HashRegistry();
    registry.claim('abcd1234', 'abcd1234ffff');
    expect(registry.claim('abcd1234', 'abcd1234ffff')).toEqual({ ok: true, duplicate: true });
  });

  it('rechaza dos digests distintos con el mismo prefijo', () => {
    const registry = new HashRegistry();
    registry.claim('abcd1234', 'abcd1234ffff');
    expect(registry.claim('abcd1234', 'abcd12340000')).toEqual({ ok: false });
  });
});
