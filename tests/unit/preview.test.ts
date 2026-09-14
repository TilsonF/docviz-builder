/**
 * Pruebas del servidor de previsualizacion.
 *
 * Se levanta de verdad sobre la interfaz local y se consulta con fetch.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPreview, type PreviewServer } from '../../src/build/preview.js';

let root: string;
let server: PreviewServer;

const DOC = [
  '# Titulo principal',
  '',
  'Parrafo con **negrita**, `codigo` y un [enlace](https://ejemplo.test).',
  '',
  '## Seccion',
  '',
  '- item uno',
  '- item dos',
  '',
  '1. numerado',
  '',
  '| Col A | Col B |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '---',
  '',
  '![Diagrama de flujo](./assets/generated/flujo-abc123.svg)',
  '',
  '```typescript',
  'const x = 1;',
  '```',
  '',
].join('\n');

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'docviz-preview-'));
  await mkdir(path.join(root, 'assets', 'generated'), { recursive: true });
  await mkdir(path.join(root, 'sub'), { recursive: true });
  await writeFile(path.join(root, 'doc.md'), DOC, 'utf8');
  await writeFile(path.join(root, 'sub', 'otro.md'), '# Otro\n', 'utf8');
  await writeFile(
    path.join(root, 'assets', 'generated', 'flujo-abc123.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    'utf8',
  );
  // Puerto 0: el sistema asigna uno libre y evita colisiones en CI.
  server = await startPreview(root, 0);
});

afterAll(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

async function get(pathname: string): Promise<Response> {
  return fetch(new URL(pathname, server.url));
}

describe('indice', () => {
  it('lista los documentos compilados', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('doc.md');
    expect(html).toContain('sub/otro.md');
    expect(html).toContain('2 documento(s)');
    expect(html).toContain('1 recurso(s)');
  });
});

describe('documentos', () => {
  it('renderiza el Markdown como HTML legible', async () => {
    const html = await (await get('/doc.md')).text();
    expect(html).toContain('<h1>Titulo principal</h1>');
    expect(html).toContain('<h2>Seccion</h2>');
    expect(html).toContain('<li>item uno</li>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<th>Col A</th>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<strong>negrita</strong>');
    expect(html).toContain('<code>codigo</code>');
    expect(html).toContain('<a href="https://ejemplo.test">enlace</a>');
  });

  it('convierte las imagenes en figuras con pie', async () => {
    const html = await (await get('/doc.md')).text();
    expect(html).toContain('<img src="./assets/generated/flujo-abc123.svg" alt="Diagrama de flujo"');
    expect(html).toContain('<figcaption>Diagrama de flujo</figcaption>');
  });

  it('no interpreta el contenido de los bloques de codigo', async () => {
    const html = await (await get('/doc.md')).text();
    expect(html).toContain('<pre><code>');
    expect(html).toContain('const x = 1;');
  });

  it('sirve el original con ?raw=1', async () => {
    const res = await get('/doc.md?raw=1');
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(await res.text()).toBe(DOC);
  });
});

describe('recursos', () => {
  it('sirve los SVG con su tipo MIME', async () => {
    const res = await get('/assets/generated/flujo-abc123.svg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(await res.text()).toContain('<svg');
  });

  it('devuelve 404 para un recurso inexistente', async () => {
    expect((await get('/assets/generated/no-existe.svg')).status).toBe(404);
  });

  it('devuelve 404 para un directorio', async () => {
    expect((await get('/assets')).status).toBe(404);
  });
});

describe('contencion de rutas', () => {
  it('rechaza intentos de salir del directorio servido', async () => {
    const res = await fetch(`${server.url}../../../../etc/passwd`.replace(/\/\.\./, '/..'));
    expect([403, 404]).toContain(res.status);
  });

  it('rechaza una ruta codificada que sube de directorio', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
    expect([403, 404]).toContain(res.status);
  });
});

describe('ciclo de vida', () => {
  it('expone url y puerto reales', () => {
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);
  });
});

describe('contencion del servidor', () => {
  it('no sirve un archivo al que apunta un enlace simbolico fuera de la raiz', async () => {
    const { mkdtemp, writeFile, symlink, rm } = await import('node:fs/promises');
    const fuera = await mkdtemp(path.join(tmpdir(), 'docviz-fuera-'));
    const secreto = path.join(fuera, 'secreto.md');
    await writeFile(secreto, '# no deberia verse\n', 'utf8');

    const enlace = path.join(root, 'atajo.md');
    try {
      await symlink(secreto, enlace);
    } catch {
      // Sin permiso para crear enlaces (Windows): la prueba no aplica.
      await rm(fuera, { recursive: true, force: true });
      return;
    }

    try {
      // Comparar cadenas de ruta no sigue el enlace; hay que resolverlo.
      const res = await fetch(`${server.url}atajo.md`);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('acceso denegado');
    } finally {
      await rm(enlace, { force: true });
      await rm(fuera, { recursive: true, force: true });
    }
  });

  it('sigue sirviendo los documentos normales', async () => {
    const res = await fetch(`${server.url}doc.md`);
    expect(res.status).toBe(200);
  });
});

describe('recarga en vivo', () => {
  it('sin --watch la pagina no lleva nada añadido', async () => {
    // Una previsualizacion tiene que poder guardarse y abrirse sola; un guion
    // que intenta conectarse a un servidor que ya no existe seria basura.
    const res = await fetch(`${server.url}doc.md`);
    const html = await res.text();
    expect(html).not.toContain('EventSource');
    expect(html).not.toContain('__docviz');
  });

  it('con --watch inyecta el guion y avisa por el canal', async () => {
    const { startPreview } = await import('../../src/build/preview.js');
    const vivo = await startPreview(root, 0, { liveReload: true });

    try {
      const html = await (await fetch(`${vivo.url}doc.md`)).text();
      expect(html).toContain('EventSource');
      expect(html).toContain('/__docviz/recargar');

      // Se abre el canal como lo haria el navegador y se espera el aviso.
      const res = await fetch(`${vivo.url}__docviz/recargar`);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const lector = res.body!.getReader();
      const decodificador = new TextDecoder();
      const primero = decodificador.decode((await lector.read()).value);
      expect(primero).toContain('conectado');

      vivo.recargar();
      const aviso = decodificador.decode((await lector.read()).value);
      expect(aviso).toContain('recargar');

      await lector.cancel();
    } finally {
      await vivo.close();
    }
  });

  it('cerrar no se queda esperando a las pestañas abiertas', async () => {
    const { startPreview } = await import('../../src/build/preview.js');
    const vivo = await startPreview(root, 0, { liveReload: true });
    const res = await fetch(`${vivo.url}__docviz/recargar`);
    const lector = res.body!.getReader();
    void lector.read();

    // Sin cerrar las conexiones a mano, `close()` esperaria indefinidamente y
    // el proceso quedaria colgado al salir de `--watch`.
    await expect(vivo.close()).resolves.toBeUndefined();
    await lector.cancel().catch(() => undefined);
  });
});
