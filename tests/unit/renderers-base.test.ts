/**
 * Pruebas de las barreras comunes a todos los renderers: tiempo, tamano,
 * formato y traduccion de errores.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  assertFormat,
  asRenderError,
  enforceSize,
  pngResult,
  svgResult,
  withTimeout,
} from '../../src/renderers/base.js';
import { RenderError } from '../../src/core/errors.js';
import { getTheme } from '../../src/themes/index.js';
import type { RenderOptions } from '../../src/core/types.js';

const options: RenderOptions = {
  format: 'svg',
  theme: getTheme('default'),
  title: 'Titulo',
  timeoutMs: 5_000,
  maxOutputBytes: 1_000_000,
};

describe('withTimeout', () => {
  it('devuelve el resultado si termina a tiempo', async () => {
    await expect(withTimeout('x', 1_000, async () => 42)).resolves.toBe(42);
  });

  it('lanza RenderError al superar el limite', async () => {
    const promise = withTimeout('lento', 20, () => new Promise(() => undefined));
    await expect(promise).rejects.toThrow(/supero el limite de 20 ms/);
  });

  it('aborta la senal al agotarse el tiempo', async () => {
    let aborted = false;
    await withTimeout('x', 20, (signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise(() => undefined);
    }).catch(() => undefined);
    expect(aborted).toBe(true);
  });

  it('propaga el error del trabajo', async () => {
    await expect(withTimeout('x', 1_000, async () => {
      throw new Error('fallo interno');
    })).rejects.toThrow('fallo interno');
  });
});

describe('enforceSize', () => {
  it('acepta contenido dentro del limite', () => {
    expect(() => enforceSize('x', Buffer.alloc(10), 100)).not.toThrow();
  });

  it('rechaza contenido que lo supera e indica como subirlo', () => {
    try {
      enforceSize('d2', Buffer.alloc(200), 100);
      throw new Error('deberia haber fallado');
    } catch (err) {
      const text = (err as RenderError).format();
      expect(text).toContain('200 bytes');
      expect(text).toContain('maxOutputBytes');
    }
  });
});

describe('assertFormat', () => {
  it('acepta un formato soportado', () => {
    expect(() => assertFormat('plantuml', 'svg', ['svg', 'png'])).not.toThrow();
  });

  it('rechaza un formato no soportado listando los validos', () => {
    try {
      assertFormat('d2', 'png', ['svg']);
      throw new Error('deberia haber fallado');
    } catch (err) {
      const text = (err as RenderError).format();
      expect(text).toContain('png');
      expect(text).toContain('svg');
    }
  });
});

describe('svgResult y pngResult', () => {
  it('normaliza, sanea y empaqueta el SVG', () => {
    const result = svgResult('x', '<svg width="100%" viewBox="0 0 10 5"><script>x</script></svg>', options);
    expect(result.format).toBe('svg');
    expect(result.mimeType).toBe('image/svg+xml');
    const text = result.content.toString('utf8');
    expect(text).toContain('width="10"');
    expect(text).toContain('<title>Titulo</title>');
    expect(text).not.toContain('script');
  });

  it('aplica el limite de tamano al SVG', () => {
    const big = `<svg width="10" height="10">${'x'.repeat(5_000)}</svg>`;
    expect(() => svgResult('x', big, { ...options, maxOutputBytes: 100 })).toThrow(RenderError);
  });

  it('empaqueta PNG con su mime', () => {
    const result = pngResult('x', Buffer.from([0x89, 0x50]), options);
    expect(result.format).toBe('png');
    expect(result.mimeType).toBe('image/png');
  });

  it('aplica el limite de tamano al PNG', () => {
    expect(() => pngResult('x', Buffer.alloc(500), { ...options, maxOutputBytes: 10 })).toThrow(RenderError);
  });
});

describe('asRenderError', () => {
  it('conserva un RenderError existente', () => {
    const original = new RenderError('d2', 'ya clasificado');
    expect(asRenderError('d2', original, 'otro')).toBe(original);
  });

  it('envuelve un Error con el mensaje de contexto', () => {
    const wrapped = asRenderError('d2', new Error('detalle tecnico'), 'no se pudo compilar');
    expect(wrapped).toBeInstanceOf(RenderError);
    expect(wrapped.message).toBe('no se pudo compilar');
    expect(wrapped.format()).toContain('detalle tecnico');
  });

  it('envuelve un valor no-Error', () => {
    expect(asRenderError('d2', 'cadena suelta', 'fallo').format()).toContain('cadena suelta');
  });
});

describe('reutilizacion del reloj', () => {
  it('no deja temporizadores vivos tras completar', async () => {
    const spy = vi.spyOn(globalThis, 'clearTimeout');
    await withTimeout('x', 1_000, async () => 'ok');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
