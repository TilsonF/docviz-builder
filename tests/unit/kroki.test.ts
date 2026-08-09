/**
 * Pruebas del backend Kroki con `fetch` simulado.
 *
 * No se levanta ninguna instancia: lo que interesa es la forma de la peticion,
 * la aplicacion del tema antes de salir del proceso y el manejo de errores.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { KrokiRenderer, createKrokiRenderer, krokiSupports } from '../../src/renderers/kroki.js';
import { ConfigError, RenderError } from '../../src/core/errors.js';
import { getTheme } from '../../src/themes/index.js';
import type { RenderOptions } from '../../src/core/types.js';

const kroki = { url: 'http://localhost:8000', allowRemoteHost: false, allowPublicService: false, headers: {} };

const options: RenderOptions = {
  format: 'svg',
  theme: getTheme('corporate'),
  title: 'Diagrama',
  timeoutMs: 5_000,
  maxOutputBytes: 1_000_000,
};

interface Captured {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
}

function mockFetch(response: { ok?: boolean; status?: number; body?: string }): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal('fetch', async (input: URL | string, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: String(init?.body ?? ''),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const ok = response.ok ?? true;
    return {
      ok,
      status: response.status ?? (ok ? 200 : 400),
      statusText: ok ? 'OK' : 'Bad Request',
      arrayBuffer: async () => new TextEncoder().encode(response.body ?? '<svg width="10" height="10"></svg>').buffer,
      text: async () => response.body ?? '',
      json: async () => ({ version: '0.99.9' }),
    } as unknown as Response;
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('construccion', () => {
  it('acepta los tipos soportados por Kroki', () => {
    for (const type of ['plantuml', 'mermaid', 'd2', 'graphviz', 'vega-lite']) {
      expect(krokiSupports(type)).toBe(true);
      expect(() => createKrokiRenderer(type, kroki)).not.toThrow();
    }
  });

  it('rechaza un tipo que Kroki no cubre', () => {
    expect(krokiSupports('likec4')).toBe(false);
    expect(() => createKrokiRenderer('likec4', kroki)).toThrow(ConfigError);
  });

  it('solo PlantUML admite PNG', () => {
    expect(new KrokiRenderer('plantuml', kroki).supportedFormats).toEqual(['svg', 'png']);
    expect(new KrokiRenderer('d2', kroki).supportedFormats).toEqual(['svg']);
  });
});

describe('render', () => {
  it('publica en la ruta correcta con el cuerpo del diagrama', async () => {
    const calls = mockFetch({});
    const renderer = new KrokiRenderer('mermaid', kroki);
    const result = await renderer.render('flowchart LR\nA-->B', options);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://localhost:8000/mermaid/svg');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toContain('flowchart LR');
    expect(result.format).toBe('svg');
  });

  it('inyecta el tema de PlantUML antes de enviar', async () => {
    const calls = mockFetch({});
    await new KrokiRenderer('plantuml', kroki).render('@startuml\nA -> B\n@enduml', options);
    expect(calls[0]!.body).toContain('skinparam');
    expect(calls[0]!.body).toMatch(/@startuml\nskinparam/);
  });

  it('envuelve un PlantUML sin marcas de apertura', async () => {
    const calls = mockFetch({});
    await new KrokiRenderer('plantuml', kroki).render('A -> B', options);
    expect(calls[0]!.body).toMatch(/^@startuml/);
    expect(calls[0]!.body).toMatch(/@enduml$/);
  });

  it('inyecta los atributos del tema en Graphviz', async () => {
    const calls = mockFetch({});
    await new KrokiRenderer('graphviz', kroki).render('digraph { A -> B }', options);
    expect(calls[0]!.body).toContain('node [');
    expect(calls[0]!.body).toContain('fillcolor=');
  });

  it('mezcla el config del tema en Vega-Lite', async () => {
    const calls = mockFetch({});
    await new KrokiRenderer('vega-lite', kroki).render('{"mark":"bar"}', options);
    const sent = JSON.parse(calls[0]!.body) as Record<string, unknown>;
    expect(sent['mark']).toBe('bar');
    expect(sent['config']).toBeDefined();
    expect(sent['width']).toBe(options.theme.vegaLite.width);
  });

  it('devuelve PNG sin pasarlo por el pipeline de SVG', async () => {
    mockFetch({ body: 'bytes-png' });
    const result = await new KrokiRenderer('plantuml', kroki).render('@startuml\n@enduml', {
      ...options,
      format: 'png',
    });
    expect(result.format).toBe('png');
    expect(result.content.toString()).toBe('bytes-png');
  });

  it('rechaza un formato no soportado por el tipo', async () => {
    await expect(
      new KrokiRenderer('d2', kroki).render('A -> B', { ...options, format: 'png' }),
    ).rejects.toThrow(RenderError);
  });

  it('reporta el codigo de estado y el cuerpo del error', async () => {
    mockFetch({ ok: false, status: 400, body: 'syntax error en la linea 3' });
    try {
      await new KrokiRenderer('d2', kroki).render('roto', options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      const text = (err as RenderError).format();
      expect(text).toContain('400');
      expect(text).toContain('syntax error en la linea 3');
    }
  });

  it('reporta un fallo de red indicando el endpoint', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    try {
      await new KrokiRenderer('d2', kroki).render('A -> B', options);
      throw new Error('deberia haber fallado');
    } catch (err) {
      const text = (err as RenderError).format();
      expect(text).toContain('http://localhost:8000/d2/svg');
      expect(text).toContain('ECONNREFUSED');
    }
  });

  it('envia las cabeceras configuradas', async () => {
    const calls = mockFetch({});
    const renderer = new KrokiRenderer('d2', { ...kroki, headers: { 'x-api-key': 'secreto' } });
    await renderer.render('A -> B', options);
    expect(calls[0]!.headers['x-api-key']).toBe('secreto');
  });

  it('respeta una URL con ruta base', async () => {
    const calls = mockFetch({});
    await new KrokiRenderer('d2', { ...kroki, url: 'http://localhost:8000/kroki' }).render('A -> B', options);
    expect(calls[0]!.url).toBe('http://localhost:8000/kroki/d2/svg');
  });
});

describe('version', () => {
  it('usa la version reportada por /health', async () => {
    mockFetch({});
    expect(await new KrokiRenderer('d2', kroki).version()).toBe('kroki-0.99.9-d2');
  });

  it('cae al host si /health no responde', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('sin respuesta');
    });
    expect(await new KrokiRenderer('d2', kroki).version()).toBe('kroki-localhost:8000-d2');
  });

  it('cachea la version entre invocaciones', async () => {
    const calls = mockFetch({});
    const renderer = new KrokiRenderer('d2', kroki);
    await renderer.version();
    await renderer.version();
    expect(calls).toHaveLength(1);
  });
});
