/**
 * Prepara la salida compilada para subirla a un wiki, sin subirla.
 *
 * Llevar Markdown **con imagenes** a Outline o a Confluence es fastidioso de
 * verdad: hay que subir cada recurso, reescribir su ruta por la que devuelve el
 * servidor y no duplicar el documento al republicar. Eso es el 80 % del trabajo,
 * y no necesita credenciales ni red.
 *
 * Lo que no hace es enviar nada. DocViz no habla con servicios externos: su
 * promesa de que la documentacion tratada no sale a ninguna parte vale
 * precisamente porque no lleva asterisco. Aqui se deja todo listo y quien
 * publica es otra cosa —un agente con su propio MCP, un script, una tarea de
 * CI— con sus credenciales, que viven donde ya vivian.
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { visit } from 'unist-util-visit';
import type { Image, Yaml } from 'mdast';
import { parse as parseYaml } from 'yaml';
import { toString as mdastToString } from 'mdast-util-to-string';
import { DocVizError, ERROR_CODES } from '../core/errors.js';
import { fingerprint } from '../core/hash.js';
import { toPosix } from '../core/paths.js';
import { parseMarkdown } from '../markdown/scan.js';
import { collectMarkdown } from './builder.js';

/** Tipo MIME por extension, para que el destino no tenga que adivinarlo. */
const TIPOS: Readonly<Record<string, string>> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export interface RecursoDelPaquete {
  /** Nombre unico dentro del paquete. */
  id: string;
  /** Ruta dentro del paquete. */
  ruta: string;
  /**
   * Texto exacto que aparece en el Markdown.
   *
   * Es lo que hay que sustituir por la URL que devuelva el servidor: darlo
   * literal evita que quien publica tenga que volver a analizar el documento.
   */
  referencia: string;
  /** Texto alternativo, para el `alt` del destino. */
  alt: string;
  bytes: number;
  tipo: string;
}

export interface DocumentoDelPaquete {
  /**
   * Identidad estable del documento: su ruta relativa en la salida.
   *
   * Es lo que permite actualizar en lugar de duplicar al republicar. Si
   * cambiara entre ejecuciones, cada publicacion crearia un documento nuevo.
   */
  id: string;
  ruta: string;
  titulo: string;
  /** Huella del contenido, para saltarse lo que no ha cambiado. */
  hash: string;
  recursos: RecursoDelPaquete[];
}

export interface Manifiesto {
  version: 1;
  generadoPor: string;
  documentos: DocumentoDelPaquete[];
  /** Referencias que no se pudieron resolver, con el documento donde estan. */
  incidencias: Array<{ documento: string; referencia: string; motivo: string }>;
}

export interface BundleOptions {
  /** Directorio de salida compilada del que se parte. */
  origen: string;
  /** Directorio donde se deja el paquete. Si se omite, solo se calcula. */
  destino?: string;
  version: string;
}

/**
 * Titulo del documento.
 *
 * Primero el del frontmatter, que es donde el autor lo dice a proposito;
 * despues el primer encabezado; y si no hay ninguno, el nombre del archivo, que
 * al menos es reconocible.
 */
function tituloDe(tree: ReturnType<typeof parseMarkdown>, archivo: string): string {
  let delFrontmatter: string | undefined;
  visit(tree, 'yaml', (node: Yaml) => {
    try {
      const datos = parseYaml(node.value) as Record<string, unknown> | null;
      const valor = datos?.['title'];
      if (typeof valor === 'string' && valor.trim() !== '') delFrontmatter ??= valor.trim();
    } catch {
      // Un frontmatter ilegible no es motivo para no empaquetar.
    }
  });
  if (delFrontmatter !== undefined) return delFrontmatter;

  let encabezado: string | undefined;
  visit(tree, 'heading', (node) => {
    if (encabezado === undefined && node.depth === 1) {
      const texto = mdastToString(node).trim();
      if (texto !== '') encabezado = texto;
    }
  });
  return encabezado ?? path.basename(archivo, path.extname(archivo));
}

export async function bundle(options: BundleOptions): Promise<Manifiesto> {
  const origen = path.resolve(options.origen);
  const archivos = await collectMarkdown(origen);
  if (archivos.length === 0) {
    throw new DocVizError(
      `no hay documentos que empaquetar en ${origen}`,
      {},
      'compila primero con `docviz build`',
      ERROR_CODES.CONFIG,
    );
  }

  const manifiesto: Manifiesto = {
    version: 1,
    generadoPor: `docviz-builder ${options.version}`,
    documentos: [],
    incidencias: [],
  };

  // Un recurso puede estar referenciado desde varios documentos: se copia una
  // vez y se lista en todos.
  const copiados = new Map<string, string>();

  for (const archivo of archivos) {
    const relativo = toPosix(path.relative(origen, archivo));
    const texto = await readFile(archivo, 'utf8');
    const tree = parseMarkdown(texto);

    const recursos: RecursoDelPaquete[] = [];
    const vistos = new Set<string>();

    const imagenes: Array<{ url: string; alt: string }> = [];
    visit(tree, 'image', (node: Image) => void imagenes.push({ url: node.url, alt: node.alt ?? '' }));

    for (const imagen of imagenes) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(imagen.url)) {
        // Una imagen externa ya vive en algun sitio: no es del paquete.
        manifiesto.incidencias.push({
          documento: relativo,
          referencia: imagen.url,
          motivo: 'es una URL, no un recurso del proyecto',
        });
        continue;
      }
      if (vistos.has(imagen.url)) continue;
      vistos.add(imagen.url);

      const limpio = decodeURIComponent(imagen.url.replace(/^<|>$/g, '').split('#')[0]!.split('?')[0]!);
      const absoluta = path.resolve(path.dirname(archivo), limpio);
      let contenido: Buffer;
      try {
        contenido = await readFile(absoluta);
      } catch {
        manifiesto.incidencias.push({
          documento: relativo,
          referencia: imagen.url,
          motivo: 'el recurso no existe; ejecuta `docviz verify` antes de empaquetar',
        });
        continue;
      }

      const id = path.basename(absoluta);
      copiados.set(id, absoluta);
      recursos.push({
        id,
        ruta: toPosix(path.join('recursos', id)),
        referencia: imagen.url,
        alt: imagen.alt,
        bytes: contenido.byteLength,
        tipo: TIPOS[path.extname(absoluta).toLowerCase()] ?? 'application/octet-stream',
      });
    }

    manifiesto.documentos.push({
      id: relativo,
      ruta: toPosix(path.join('documentos', relativo)),
      titulo: tituloDe(tree, archivo),
      hash: fingerprint(texto),
      recursos,
    });
  }

  if (options.destino !== undefined) {
    const destino = path.resolve(options.destino);
    for (const documento of manifiesto.documentos) {
      const salida = path.join(destino, documento.ruta);
      await mkdir(path.dirname(salida), { recursive: true });
      await copyFile(path.join(origen, documento.id), salida);
    }
    for (const [id, absoluta] of copiados) {
      const salida = path.join(destino, 'recursos', id);
      await mkdir(path.dirname(salida), { recursive: true });
      await copyFile(absoluta, salida);
    }
    await writeFile(path.join(destino, 'manifiesto.json'), `${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
  }

  return manifiesto;
}

/** Informe legible de lo que se ha dejado listo. */
export function formatearBundle(manifiesto: Manifiesto, destino: string | undefined): string {
  const recursos = new Set(manifiesto.documentos.flatMap((d) => d.recursos.map((r) => r.id)));
  const lineas = ['', `documentos: ${manifiesto.documentos.length}`, `recursos:   ${recursos.size}`];

  for (const documento of manifiesto.documentos) {
    lineas.push(`  ${documento.id}  "${documento.titulo}"  (${documento.recursos.length} recurso(s))`);
  }

  for (const incidencia of manifiesto.incidencias) {
    lineas.push(`AVISO ${incidencia.documento}: ${incidencia.referencia} -> ${incidencia.motivo}`);
  }

  lineas.push(
    '',
    destino === undefined
      ? 'manifiesto calculado; usa --to <dir> para dejar el paquete en disco'
      : `paquete listo en ${destino}`,
    '',
    'DocViz no publica: el manifiesto trae, por cada imagen, el texto exacto que',
    'hay que sustituir por la URL que devuelva tu servidor.',
    '',
  );
  return lineas.join('\n');
}
