/**
 * Pruebas del empaquetado para publicar.
 *
 * DocViz no habla con servicios externos —su promesa de que la documentacion
 * tratada no sale a ninguna parte vale precisamente porque no lleva asterisco—,
 * asi que lo que se comprueba aqui es que deje **todo listo** para que otro lo
 * suba: la identidad estable de cada documento, sus recursos, y el texto exacto
 * que hay que sustituir por la URL del servidor.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { bundle, formatearBundle } from '../../src/build/bundle.js';
import { DocVizError } from '../../src/core/errors.js';

const temps: string[] = [];

async function salida(archivos: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-bundle-'));
  temps.push(root);
  for (const [relativo, contenido] of Object.entries(archivos)) {
    const destino = path.join(root, relativo);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, contenido, 'utf8');
  }
  return root;
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
const empaquetar = (origen: string, destino?: string) =>
  bundle({ origen, version: '0.0.0-pruebas', ...(destino !== undefined ? { destino } : {}) });

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('lo que describe el manifiesto', () => {
  it('cada documento con su recurso y el texto literal a sustituir', async () => {
    const origen = await salida({
      'a.md': '# Uno\n\n![Un flujo](./assets/generated/flujo-abc.svg)\n',
      'assets/generated/flujo-abc.svg': SVG,
    });
    const m = await empaquetar(origen);

    expect(m.documentos).toHaveLength(1);
    const [doc] = m.documentos;
    expect(doc!.id).toBe('a.md');
    expect(doc!.recursos).toHaveLength(1);
    // La referencia va literal para que quien publique no tenga que volver a
    // analizar el documento: es un `replace` y ya esta.
    expect(doc!.recursos[0]!.referencia).toBe('./assets/generated/flujo-abc.svg');
    expect(doc!.recursos[0]!.alt).toBe('Un flujo');
    expect(doc!.recursos[0]!.tipo).toBe('image/svg+xml');
    expect(doc!.recursos[0]!.bytes).toBe(SVG.length);
  });

  it('el titulo sale del frontmatter, del primer encabezado o del archivo', async () => {
    const origen = await salida({
      'con-frontmatter.md': '---\ntitle: El bueno\n---\n\n# Otro\n',
      'con-encabezado.md': '# Desde el encabezado\n\ntexto\n',
      'pelado.md': 'solo texto, sin titulo\n',
    });
    const m = await empaquetar(origen);
    const titulo = (id: string): string => m.documentos.find((d) => d.id === id)!.titulo;

    expect(titulo('con-frontmatter.md')).toBe('El bueno');
    expect(titulo('con-encabezado.md')).toBe('Desde el encabezado');
    expect(titulo('pelado.md')).toBe('pelado');
  });

  it('la identidad del documento es su ruta, para actualizar y no duplicar', async () => {
    const origen = await salida({ 'guias/uno.md': '# Uno\n' });
    const m = await empaquetar(origen);
    expect(m.documentos[0]!.id).toBe('guias/uno.md');
  });

  it('el hash cambia con el contenido y no con nada mas', async () => {
    const primero = await empaquetar(await salida({ 'a.md': '# Uno\n' }));
    const igual = await empaquetar(await salida({ 'a.md': '# Uno\n' }));
    const distinto = await empaquetar(await salida({ 'a.md': '# Dos\n' }));

    expect(igual.documentos[0]!.hash).toBe(primero.documentos[0]!.hash);
    expect(distinto.documentos[0]!.hash).not.toBe(primero.documentos[0]!.hash);
  });

  it('un recurso compartido se lista en los dos documentos', async () => {
    const origen = await salida({
      'a.md': '# A\n\n![x](./assets/generated/comun.svg)\n',
      'b.md': '# B\n\n![x](./assets/generated/comun.svg)\n',
      'assets/generated/comun.svg': SVG,
    });
    const m = await empaquetar(origen);
    expect(m.documentos.every((d) => d.recursos.length === 1)).toBe(true);
  });

  it('la misma imagen repetida en un documento se cuenta una vez', async () => {
    const origen = await salida({
      'a.md': '# A\n\n![x](./assets/generated/x.svg)\n\n![otra vez](./assets/generated/x.svg)\n',
      'assets/generated/x.svg': SVG,
    });
    const m = await empaquetar(origen);
    expect(m.documentos[0]!.recursos).toHaveLength(1);
  });
});

describe('lo que reporta como incidencia', () => {
  it('una imagen que no existe', async () => {
    const origen = await salida({ 'a.md': '# A\n\n![x](./assets/generated/fantasma.svg)\n' });
    const m = await empaquetar(origen);

    expect(m.documentos[0]!.recursos).toEqual([]);
    expect(m.incidencias[0]!.motivo).toContain('no existe');
    // Y dice que hacer antes de volver a intentarlo.
    expect(m.incidencias[0]!.motivo).toContain('docviz verify');
  });

  it('una imagen que ya vive en otro sitio', async () => {
    const origen = await salida({ 'a.md': '# A\n\n![x](https://ejemplo.test/logo.png)\n' });
    const m = await empaquetar(origen);

    expect(m.documentos[0]!.recursos).toEqual([]);
    expect(m.incidencias[0]!.motivo).toContain('es una URL');
  });

  it('una incidencia no impide empaquetar el resto', async () => {
    const origen = await salida({
      'a.md': '# A\n\n![roto](./no-esta.svg)\n',
      'b.md': '# B\n\n![bien](./assets/x.svg)\n',
      'assets/x.svg': SVG,
    });
    const m = await empaquetar(origen);
    expect(m.documentos).toHaveLength(2);
    expect(m.documentos.find((d) => d.id === 'b.md')!.recursos).toHaveLength(1);
  });
});

describe('el paquete en disco', () => {
  it('sin --to no escribe nada', async () => {
    const origen = await salida({ 'a.md': '# A\n' });
    const destino = path.join(origen, 'paquete');
    await empaquetar(origen);
    expect(existsSync(destino)).toBe(false);
  });

  it('con --to deja documentos, recursos y manifiesto', async () => {
    const origen = await salida({
      'guias/a.md': '# A\n\n![x](../assets/x.svg)\n',
      'assets/x.svg': SVG,
    });
    const destino = await mkdtemp(path.join(tmpdir(), 'docviz-paquete-'));
    temps.push(destino);
    await empaquetar(origen, destino);

    expect(existsSync(path.join(destino, 'documentos', 'guias', 'a.md'))).toBe(true);
    expect(existsSync(path.join(destino, 'recursos', 'x.svg'))).toBe(true);

    const manifiesto = JSON.parse(await readFile(path.join(destino, 'manifiesto.json'), 'utf8')) as {
      version: number;
      generadoPor: string;
    };
    expect(manifiesto.version).toBe(1);
    expect(manifiesto.generadoPor).toContain('docviz-builder');
  });

  it('un recurso compartido se copia una sola vez', async () => {
    const origen = await salida({
      'a.md': '# A\n\n![x](./assets/comun.svg)\n',
      'b.md': '# B\n\n![x](./assets/comun.svg)\n',
      'assets/comun.svg': SVG,
    });
    const destino = await mkdtemp(path.join(tmpdir(), 'docviz-paquete-'));
    temps.push(destino);
    const m = await empaquetar(origen, destino);

    const rutas = new Set(m.documentos.flatMap((d) => d.recursos.map((r) => r.ruta)));
    expect(rutas.size).toBe(1);
    expect(existsSync(path.join(destino, 'recursos', 'comun.svg'))).toBe(true);
  });

  it('un directorio sin documentos se reporta con que hacer', async () => {
    const origen = await salida({});
    let error: DocVizError | undefined;
    try {
      await empaquetar(origen);
    } catch (err) {
      error = err as DocVizError;
    }
    expect(error).toBeInstanceOf(DocVizError);
    expect(error!.message).toContain('no hay documentos');
    // El consejo va en el detalle, que es lo que imprime `format()`.
    expect(error!.format()).toContain('docviz build');
  });
});

describe('el informe', () => {
  it('dice cuantos hay, y que DocViz no publica', async () => {
    const origen = await salida({
      'a.md': '---\ntitle: Arquitectura\n---\n\n![x](./assets/x.svg)\n',
      'assets/x.svg': SVG,
    });
    const texto = formatearBundle(await empaquetar(origen), '/tmp/paquete');

    expect(texto).toContain('documentos: 1');
    expect(texto).toContain('"Arquitectura"');
    expect(texto).toContain('/tmp/paquete');
    expect(texto).toContain('DocViz no publica');
  });

  it('sin destino invita a pedirlo', async () => {
    const texto = formatearBundle(await empaquetar(await salida({ 'a.md': '# A\n' })), undefined);
    expect(texto).toContain('--to');
  });
});
