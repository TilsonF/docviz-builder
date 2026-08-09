/**
 * Pruebas del verificador del Markdown compilado.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verify } from '../../src/build/verify.js';

const temps: string[] = [];

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-verify-'));
  temps.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';

describe('verify — caso correcto', () => {
  it('no reporta problemas cuando todo esta en su sitio', async () => {
    const root = await project({
      'doc.md': '# Doc\n\n![Diagrama](./assets/generated/a-1.svg)\n',
      'assets/generated/a-1.svg': SVG,
    });
    const result = await verify(root);
    expect(result.documents).toBe(1);
    expect(result.images).toBe(1);
    expect(result.issues).toEqual([]);
    expect(result.residualBlocks).toEqual([]);
  });

  it('acepta rutas relativas desde subdirectorios', async () => {
    const root = await project({
      'sub/doc.md': '![D](../assets/generated/a-1.svg)\n',
      'assets/generated/a-1.svg': SVG,
    });
    expect((await verify(root)).issues).toEqual([]);
  });

  it('ignora el ancla y la query al resolver el recurso', async () => {
    const root = await project({
      'doc.md': '![D](./assets/generated/a-1.svg?v=2#top)\n',
      'assets/generated/a-1.svg': SVG,
    });
    expect((await verify(root)).issues).toEqual([]);
  });
});

describe('verify — problemas detectados', () => {
  it('detecta un recurso inexistente', async () => {
    const root = await project({ 'doc.md': '![D](./assets/generated/falta.svg)\n' });
    const result = await verify(root);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.reason).toContain('no existe');
    expect(result.issues[0]!.file).toBe('doc.md');
  });

  it('detecta un recurso vacio', async () => {
    const root = await project({ 'doc.md': '![D](./a.svg)\n', 'a.svg': '' });
    expect((await verify(root)).issues[0]!.reason).toContain('vacio');
  });

  it('detecta rutas absolutas del sistema de archivos', async () => {
    const root = await project({ 'doc.md': '![D](/assets/generated/a.svg)\n' });
    expect((await verify(root)).issues[0]!.reason).toContain('absoluta');
  });

  it('detecta URLs externas', async () => {
    const root = await project({ 'doc.md': '![D](https://ejemplo.test/a.svg)\n' });
    expect((await verify(root)).issues[0]!.reason).toContain('URL absoluta');
  });

  it('acepta imagenes incrustadas como data URI', async () => {
    const root = await project({ 'doc.md': '![D](data:image/svg+xml;base64,PHN2Zy8+)\n' });
    expect((await verify(root)).issues).toEqual([]);
  });

  it('detecta un recurso fuera del directorio de salida', async () => {
    const root = await project({ 'sub/doc.md': '![D](../../fuera.svg)\n' });
    expect((await verify(root)).issues[0]!.reason).toContain('fuera del directorio');
  });

  it('detecta imagenes sin texto alternativo', async () => {
    const root = await project({ 'doc.md': '![](./a.svg)\n', 'a.svg': SVG });
    const reasons = (await verify(root)).issues.map((i) => i.reason);
    expect(reasons).toContain('la imagen no tiene texto alternativo');
  });

  it('detecta bloques declarativos que quedaron sin compilar', async () => {
    const root = await project({ 'doc.md': '```mermaid\nflowchart LR\nA-->B\n```\n' });
    const result = await verify(root);
    expect(result.residualBlocks).toHaveLength(1);
    expect(result.residualBlocks[0]!.lang).toBe('mermaid');
  });

  it('no marca como residual un bloque de codigo normal', async () => {
    const root = await project({ 'doc.md': '```typescript\nconst x = 1;\n```\n' });
    expect((await verify(root)).residualBlocks).toEqual([]);
  });

  it('devuelve cero documentos si el directorio no existe', async () => {
    const result = await verify(path.join(tmpdir(), 'docviz-inexistente-xyz'));
    expect(result.documents).toBe(0);
  });
});
