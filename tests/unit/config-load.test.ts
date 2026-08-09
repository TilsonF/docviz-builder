/**
 * Cobertura de las ramas restantes de carga de configuracion.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CONFIG_FILE_NAMES,
  defaultConfig,
  findConfigFile,
  loadConfig,
  mergeConfig,
  resolveFromRoot,
} from '../../src/config/load.js';
import { ConfigError } from '../../src/core/errors.js';

const temps: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docviz-cfg-'));
  temps.push(dir);
  return dir;
}
afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('findConfigFile', () => {
  it('encuentra el archivo en el propio directorio', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'docviz.config.yaml'), 'theme: dark\n');
    expect(findConfigFile(dir)).toBe(path.join(dir, 'docviz.config.yaml'));
  });

  it('sube por el arbol hasta encontrarlo', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'docviz.config.yml'), 'theme: dark\n');
    const nested = path.join(dir, 'a', 'b', 'c');
    await mkdir(nested, { recursive: true });
    expect(findConfigFile(nested)).toBe(path.join(dir, 'docviz.config.yml'));
  });

  it('devuelve undefined si no hay ninguno', async () => {
    // Un directorio temporal recien creado no tiene configuracion; si algun
    // ancestro la tuviera, la ruta encontrada estaria fuera del temporal.
    const dir = await tempDir();
    const found = findConfigFile(dir);
    expect(found === undefined || !found.startsWith(dir)).toBe(true);
  });

  it('reconoce los tres nombres admitidos', () => {
    expect(CONFIG_FILE_NAMES).toEqual(['docviz.config.yaml', 'docviz.config.yml', '.docvizrc.yaml']);
  });
});

describe('loadConfig — ruta explicita', () => {
  it('acepta --config con una ruta relativa al cwd', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'mi-config.yaml'), 'theme: executive\n');
    const config = await loadConfig({ cwd: dir, configPath: 'mi-config.yaml' });
    expect(config.theme.name).toBe('executive');
    expect(config.rootDir).toBe(dir);
  });

  it('falla si la ruta explicita no existe', async () => {
    const dir = await tempDir();
    await expect(loadConfig({ cwd: dir, configPath: 'no-existe.yaml' })).rejects.toThrow(
      /no se encuentra el archivo de configuracion/,
    );
  });

  it('un archivo vacio equivale a la configuracion por defecto', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'docviz.config.yaml'), '');
    const config = await loadConfig({ cwd: dir });
    expect(config.theme.name).toBe('default');
  });
});

describe('mergeConfig — subconfiguracion por motor', () => {
  it('lee las opciones de PlantUML', () => {
    const merged = mergeConfig(defaultConfig('/p'), {
      renderers: { plantuml: { jar: 'vendor/x.jar', java: '/usr/bin/java', maxHeap: '2g' } },
    });
    expect(merged.renderers.plantuml).toMatchObject({
      jar: 'vendor/x.jar',
      java: '/usr/bin/java',
      maxHeap: '2g',
    });
  });

  it('lee el navegador de Mermaid', () => {
    const merged = mergeConfig(defaultConfig('/p'), {
      renderers: { mermaid: { browserPath: '/opt/chrome' } },
    });
    expect(merged.renderers.mermaid.browserPath).toBe('/opt/chrome');
  });

  it('lee el layout de D2 e ignora uno invalido', () => {
    expect(mergeConfig(defaultConfig('/p'), { renderers: { d2: { layout: 'elk' } } }).renderers.d2.layout).toBe('elk');
    expect(mergeConfig(defaultConfig('/p'), { renderers: { d2: { layout: 'magia' } } }).renderers.d2.layout).toBe(
      'dagre',
    );
  });

  it('lee el motor de Graphviz', () => {
    expect(
      mergeConfig(defaultConfig('/p'), { renderers: { graphviz: { engine: 'neato' } } }).renderers.graphviz.engine,
    ).toBe('neato');
  });

  it('acepta vega-lite y vegaLite como clave', () => {
    expect(
      mergeConfig(defaultConfig('/p'), { renderers: { 'vega-lite': { enabled: false } } }).renderers.vegaLite.enabled,
    ).toBe(false);
    expect(
      mergeConfig(defaultConfig('/p'), { renderers: { vegaLite: { enabled: false } } }).renderers.vegaLite.enabled,
    ).toBe(false);
  });

  it('permite deshabilitar LikeC4', () => {
    expect(
      mergeConfig(defaultConfig('/p'), { renderers: { likec4: { enabled: false } } }).renderers.likec4.enabled,
    ).toBe(false);
  });

  it('lee las cabeceras de Kroki convirtiendolas a texto', () => {
    const merged = mergeConfig(defaultConfig('/p'), {
      renderers: { kroki: { url: 'http://kroki.interno', allowRemoteHost: true, headers: { 'x-token': 123 } } },
    });
    expect(merged.renderers.kroki.headers).toEqual({ 'x-token': '123' });
    expect(merged.renderers.kroki.allowRemoteHost).toBe(true);
  });

  it('lee backend por motor', () => {
    expect(
      mergeConfig(defaultConfig('/p'), { renderers: { d2: { backend: 'kroki' } } }).renderers.d2.backend,
    ).toBe('kroki');
  });

  it('rechaza un backend por motor invalido', () => {
    expect(() => mergeConfig(defaultConfig('/p'), { renderers: { d2: { backend: 'magia' } } })).toThrow(ConfigError);
  });

  it('lee timeout y tamano maximo', () => {
    const merged = mergeConfig(defaultConfig('/p'), {
      renderers: { timeoutMs: 5_000, maxOutputBytes: 1_024 },
    });
    expect(merged.renderers.timeoutMs).toBe(5_000);
    expect(merged.renderers.maxOutputBytes).toBe(1_024);
  });

  it('acepta output como cadena y source suelto', () => {
    const merged = mergeConfig(defaultConfig('/p'), { source: 'fuentes', output: 'publico' });
    expect(merged.source).toBe('fuentes');
    expect(merged.output).toBe('publico');
  });

  it('rechaza un nodo que deberia ser mapa', () => {
    expect(() => mergeConfig(defaultConfig('/p'), { cache: 'si' })).toThrow(/debe ser un mapa/);
  });

  it('rechaza timeout o tamano no positivos', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'docviz.config.yaml'), 'renderers:\n  timeoutMs: 0\n');
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/timeoutMs/);

    await writeFile(path.join(dir, 'docviz.config.yaml'), 'renderers:\n  maxOutputBytes: -1\n');
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/maxOutputBytes/);
  });
});

describe('resolveFromRoot', () => {
  it('resuelve rutas contra la raiz del proyecto', () => {
    const config = defaultConfig('/proyecto');
    expect(resolveFromRoot(config, 'docs')).toBe(path.resolve('/proyecto', 'docs'));
  });

  it('respeta una ruta ya absoluta', () => {
    const config = defaultConfig('/proyecto');
    expect(resolveFromRoot(config, path.resolve('/otro/sitio'))).toBe(path.resolve('/otro/sitio'));
  });
});
