/**
 * Pruebas de configuracion y de las barreras de seguridad (seccion 12).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig, loadConfig, mergeConfig } from '../../src/config/load.js';
import { ConfigError } from '../../src/core/errors.js';
import { assertSafeKrokiUrl } from '../../src/renderers/kroki.js';
import { getTheme, themeNames } from '../../src/themes/index.js';

const temps: string[] = [];
async function tempProject(configYaml?: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docviz-config-'));
  temps.push(dir);
  if (configYaml !== undefined) await writeFile(path.join(dir, 'docviz.config.yaml'), configYaml, 'utf8');
  return dir;
}
afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('configuracion por defecto', () => {
  it('es local, con cache y sin servicios externos', () => {
    const config = defaultConfig('/proyecto');
    expect(config.renderers.backend).toBe('local');
    expect(config.cache.enabled).toBe(true);
    expect(config.renderers.kroki.allowPublicService).toBe(false);
    expect(config.renderers.kroki.allowRemoteHost).toBe(false);
    expect(config.source).toBe('docs-src');
    expect(config.output).toBe('docs');
    expect(config.assetsDir).toBe('assets/generated');
  });
});

describe('mergeConfig', () => {
  it('fusiona el YAML sobre los valores por defecto', () => {
    const merged = mergeConfig(defaultConfig('/p'), {
      output: { dir: 'sitio', assetsDir: 'img/gen' },
      theme: { name: 'dark' },
      cache: { enabled: false },
      formats: { plantuml: 'png' },
    });
    expect(merged.output).toBe('sitio');
    expect(merged.assetsDir).toBe('img/gen');
    expect(merged.theme.name).toBe('dark');
    expect(merged.cache.enabled).toBe(false);
    expect(merged.formats['plantuml']).toBe('png');
    // Lo no mencionado conserva el valor por defecto.
    expect(merged.formats['mermaid']).toBe('svg');
  });

  it('acepta theme como cadena', () => {
    expect(mergeConfig(defaultConfig('/p'), { theme: 'executive' }).theme.name).toBe('executive');
  });

  it('acepta deshabilitar un renderer con un booleano', () => {
    const merged = mergeConfig(defaultConfig('/p'), { renderers: { mermaid: false } });
    expect(merged.renderers.mermaid.enabled).toBe(false);
  });

  it('rechaza un formato invalido', () => {
    expect(() => mergeConfig(defaultConfig('/p'), { formats: { d2: 'pdf' } })).toThrow(ConfigError);
  });

  it('rechaza un backend invalido', () => {
    expect(() => mergeConfig(defaultConfig('/p'), { renderers: { backend: 'nube' } })).toThrow(ConfigError);
  });

  it('rechaza una raiz que no sea mapa', () => {
    expect(() => mergeConfig(defaultConfig('/p'), ['a', 'b'])).toThrow(ConfigError);
  });
});

describe('loadConfig', () => {
  it('funciona sin archivo de configuracion', async () => {
    const dir = await tempProject();
    const config = await loadConfig({ cwd: dir });
    expect(config.theme.name).toBe('default');
    expect(config.configPath).toBeUndefined();
  });

  it('lee docviz.config.yaml del directorio', async () => {
    const dir = await tempProject('theme:\n  name: corporate\ncache:\n  enabled: false\n');
    const config = await loadConfig({ cwd: dir });
    expect(config.theme.name).toBe('corporate');
    expect(config.cache.enabled).toBe(false);
    expect(config.configPath).toBe(path.join(dir, 'docviz.config.yaml'));
  });

  it('las opciones de CLI ganan al archivo', async () => {
    const dir = await tempProject('theme:\n  name: corporate\n');
    const config = await loadConfig({ cwd: dir, overrides: { theme: 'dark', output: 'publico' } });
    expect(config.theme.name).toBe('dark');
    expect(config.output).toBe('publico');
  });

  it('--renderer-url cambia el backend a kroki', async () => {
    const dir = await tempProject();
    const config = await loadConfig({ cwd: dir, overrides: { krokiUrl: 'http://localhost:9000' } });
    expect(config.renderers.backend).toBe('kroki');
    expect(config.renderers.kroki.url).toBe('http://localhost:9000');
  });

  it('rechaza un tema inexistente listando los validos', async () => {
    const dir = await tempProject('theme:\n  name: neon\n');
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/no existe/);
  });

  it('rechaza un assetsDir que se salga de la salida', async () => {
    const dir = await tempProject('output:\n  assetsDir: ../fuera\n');
    await expect(loadConfig({ cwd: dir })).rejects.toThrow();
  });

  it('rechaza una longitud de hash fuera de rango', async () => {
    const dir = await tempProject('hash:\n  length: 4\n');
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/hash.length/);
  });

  it('rechaza YAML malformado indicando el archivo', async () => {
    const dir = await tempProject('theme: [sin cerrar\n');
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/no se pudo interpretar/);
  });
});

describe('temas', () => {
  it('incluye los cuatro temas documentados', () => {
    expect(themeNames().sort()).toEqual(['corporate', 'dark', 'default', 'executive']);
  });

  it('cada tema define configuracion para los seis motores', () => {
    for (const name of themeNames()) {
      const theme = getTheme(name);
      expect(theme.plantuml.skinparams.length).toBeGreaterThan(5);
      expect(Object.keys(theme.mermaid.themeVariables).length).toBeGreaterThan(5);
      expect(typeof theme.d2.themeID).toBe('number');
      expect(theme.graphviz.node['fillcolor']).toBeDefined();
      expect(theme.vegaLite.config['background']).toBeDefined();
      expect(theme.likec4.nodeFill['primary']).toBeDefined();
    }
  });

  it('rechaza un tema inexistente', () => {
    expect(() => getTheme('neon')).toThrow(ConfigError);
  });
});

describe('seguridad de Kroki', () => {
  const base = { url: '', allowRemoteHost: false, allowPublicService: false, headers: {} };

  it('acepta una instancia local', () => {
    expect(assertSafeKrokiUrl('http://localhost:8000', base).hostname).toBe('localhost');
    expect(assertSafeKrokiUrl('http://127.0.0.1:8000', base).hostname).toBe('127.0.0.1');
  });

  it('bloquea el servicio publico kroki.io por defecto', () => {
    expect(() => assertSafeKrokiUrl('https://kroki.io', base)).toThrow(/bloqueado por defecto/);
  });

  it('permite kroki.io solo con autorizacion explicita', () => {
    expect(() =>
      assertSafeKrokiUrl('https://kroki.io', { ...base, allowPublicService: true }),
    ).not.toThrow();
  });

  it('bloquea hosts remotos salvo autorizacion explicita', () => {
    expect(() => assertSafeKrokiUrl('https://diagramas.empresa.com', base)).toThrow(/host remoto/);
    expect(() =>
      assertSafeKrokiUrl('https://diagramas.empresa.com', { ...base, allowRemoteHost: true }),
    ).not.toThrow();
  });

  it('rechaza esquemas que no sean http/https', () => {
    expect(() => assertSafeKrokiUrl('file:///etc/passwd', base)).toThrow(/http o https/);
  });

  it('rechaza una URL malformada', () => {
    expect(() => assertSafeKrokiUrl('no-es-una-url', base)).toThrow(/no es una URL valida/);
  });
});
