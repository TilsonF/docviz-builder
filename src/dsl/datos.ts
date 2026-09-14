/**
 * Datos de un grafico leidos de un archivo.
 *
 * Un informe saca sus numeros de algun sitio —una exportacion, una consulta—, y
 * teclearlos dentro del bloque tiene dos costes: es donde se cuelan los errores,
 * y sobre todo hace que el grafico **no se pueda regenerar** cuando el dato
 * cambia. Hay que volver a teclear.
 *
 * Deliberadamente **no** es una URL. `data.url` de Vega-Lite esta rechazado a
 * proposito y debe seguir estandolo: el build no hace peticiones de red porque
 * la documentacion puede ser confidencial. Lo que se admite es una ruta
 * relativa al documento, que resuelve DocViz y que no puede salirse del arbol
 * de origen.
 */

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ERROR_CODES } from '../core/errors.js';
import { fail } from './util.js';

/** Extensiones admitidas. Lo que no este aqui no se intenta interpretar. */
const FORMATOS = new Set(['.csv', '.tsv', '.json']);

/**
 * Tamano maximo del archivo de datos.
 *
 * Un grafico legible tiene decenas de filas, no millones. El limite no protege
 * de nada malicioso —el archivo es del propio proyecto— sino de convertir un
 * build en una espera por haber apuntado a la exportacion equivocada.
 */
const MAXIMO_BYTES = 5 * 1024 * 1024;

export interface ContextoDatos {
  /** Directorio del documento que contiene el bloque. */
  baseDir: string;
  /** Raiz de la que no puede salirse la ruta. */
  root: string;
}

/**
 * Sustituye `dataFile` por `data` en el documento del bloque.
 *
 * Se hace antes de compilar para que los seis tipos de grafico lo hereden sin
 * cambiar ni uno: para ellos los datos siguen llegando en `data`.
 */
/**
 * Resuelve una ruta declarada en un bloque y devuelve su contenido.
 *
 * Es el unico sitio por el que un documento puede leer un archivo, y por eso
 * concentra las tres condiciones: no es una URL, no sale del arbol de origen y
 * tiene un formato que se sabe leer. Lo comparten los datos de un grafico y el
 * modelo de una arquitectura.
 */
export function leerArchivoDeclarado(
  ruta: string,
  campo: string,
  formatos: ReadonlySet<string>,
  contexto: ContextoDatos | undefined,
): { texto: string; extension: string } {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ruta)) {
    fail(
      `${campo} no admite URLs`,
      'el build no hace peticiones de red: la documentacion tratada puede ser confidencial. ' +
        'Descarga el archivo junto al documento y apunta a el con una ruta relativa.',
      ERROR_CODES.DSL_VALUE_NOT_ALLOWED,
    );
  }
  if (contexto === undefined) {
    fail(
      `${campo} solo funciona al compilar un documento`,
      'este bloque se esta compilando suelto, sin un archivo del que partir para resolver la ruta',
      ERROR_CODES.DSL_VALUE_NOT_ALLOWED,
    );
  }

  const absoluta = path.resolve(contexto.baseDir, ruta);
  const dentro = path.relative(contexto.root, absoluta);
  if (dentro.startsWith('..') || path.isAbsolute(dentro)) {
    fail(
      `${campo} apunta fuera del directorio de origen`,
      `${ruta} sale de ${contexto.root}; un documento no puede leer archivos de cualquier sitio de la maquina`,
      ERROR_CODES.DSL_VALUE_NOT_ALLOWED,
    );
  }

  const extension = path.extname(absoluta).toLowerCase();
  if (!formatos.has(extension)) {
    fail(
      `${campo} no sabe leer "${extension}"`,
      `formatos admitidos: ${[...formatos].join(', ')}`,
      ERROR_CODES.DSL_VALUE_NOT_ALLOWED,
    );
  }

  let bytes: number;
  try {
    bytes = statSync(absoluta).size;
  } catch {
    fail(
      `no se encuentra ${ruta}`,
      `se buscaba en ${absoluta}; la ruta es relativa al documento que contiene el bloque`,
      ERROR_CODES.DSL_VALUE_NOT_ALLOWED,
    );
  }
  if (bytes > MAXIMO_BYTES) {
    fail(
      `${ruta} pesa ${(bytes / 1e6).toFixed(1)} MB`,
      `el limite es ${MAXIMO_BYTES / 1e6} MB`,
      ERROR_CODES.DSL_VALUE_NOT_ALLOWED,
    );
  }

  return { texto: readFileSync(absoluta, 'utf8'), extension };
}

export function resolverDatos(doc: Record<string, unknown>, contexto?: ContextoDatos): void {
  const declarado = doc['dataFile'];
  if (declarado === undefined) return;

  if (doc['data'] !== undefined) {
    fail(
      'no se pueden declarar `data` y `dataFile` a la vez',
      'deja solo uno: si los datos vienen de un archivo, quita la lista escrita a mano',
      ERROR_CODES.DSL_VALUE_NOT_ALLOWED,
    );
  }
  if (typeof declarado !== 'string' || declarado.trim() === '') {
    fail('chart.dataFile debe ser una ruta', `valor recibido: ${JSON.stringify(declarado)}`, ERROR_CODES.DSL_FIELD_TYPE);
  }
  const ruta = declarado.trim();
  const { texto, extension } = leerArchivoDeclarado(ruta, 'chart.dataFile', FORMATOS, contexto);

  doc['data'] = extension === '.json' ? leerJson(texto, ruta) : leerSeparado(texto, extension === '.tsv' ? '\t' : ',', ruta);
}

function leerJson(texto: string, ruta: string): unknown[] {
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch (err) {
    fail(`${ruta} no es JSON valido`, err instanceof Error ? err.message : String(err), ERROR_CODES.DSL_YAML);
  }
  // Se admite tanto una lista suelta como `{ "data": [...] }`, que es como sale
  // de la mitad de las exportaciones.
  const filas = Array.isArray(valor)
    ? valor
    : valor !== null && typeof valor === 'object' && Array.isArray((valor as { data?: unknown }).data)
      ? (valor as { data: unknown[] }).data
      : undefined;
  if (filas === undefined) {
    fail(`${ruta} debe contener una lista de filas`, 'o una lista en la raiz, o un objeto con la clave `data`');
  }
  return filas;
}

/**
 * CSV y TSV con lo que hace falta y nada mas: cabecera, comillas dobles y
 * comillas escapadas duplicandolas. No pretende cubrir el formato entero
 * —no existe un formato entero— sino lo que produce una hoja de calculo.
 */
export function leerSeparado(texto: string, separador: string, ruta: string): Array<Record<string, unknown>> {
  const filas = analizarFilas(texto, separador);
  if (filas.length === 0) fail(`${ruta} esta vacio`);

  const cabecera = filas[0]!.map((c) => c.trim());
  if (cabecera.some((c) => c === '')) {
    fail(`${ruta} tiene una columna sin nombre en la cabecera`, `cabecera leida: ${cabecera.join(' | ')}`);
  }

  const salida: Array<Record<string, unknown>> = [];
  for (const [indice, campos] of filas.slice(1).entries()) {
    // Una linea en blanco al final es lo normal en un archivo exportado.
    if (campos.length === 1 && campos[0]!.trim() === '') continue;
    if (campos.length !== cabecera.length) {
      fail(
        `${ruta}: la fila ${indice + 2} tiene ${campos.length} campos y la cabecera ${cabecera.length}`,
        `fila leida: ${campos.join(' | ')}`,
      );
    }
    const fila: Record<string, unknown> = {};
    cabecera.forEach((nombre, i) => {
      fila[nombre] = comoValor(campos[i]!);
    });
    salida.push(fila);
  }
  if (salida.length === 0) fail(`${ruta} no tiene ninguna fila de datos`);
  return salida;
}

/** Un campo numerico se convierte; el resto se deja como texto. */
function comoValor(campo: string): string | number {
  const limpio = campo.trim();
  if (limpio === '') return '';
  // Solo un numero de verdad: `007` es un codigo y `1,5` es ambiguo segun el
  // pais, asi que ninguno de los dos se convierte.
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(limpio)) return Number(limpio);
  return limpio;
}

/** Divide en filas y campos respetando las comillas dobles. */
function analizarFilas(texto: string, separador: string): string[][] {
  const filas: string[][] = [];
  let campos: string[] = [];
  let actual = '';
  let entreComillas = false;

  const sinBom = texto.replace(/^﻿/, '');
  for (let i = 0; i < sinBom.length; i += 1) {
    const c = sinBom[i]!;
    if (entreComillas) {
      if (c === '"') {
        if (sinBom[i + 1] === '"') {
          actual += '"';
          i += 1;
        } else entreComillas = false;
      } else actual += c;
      continue;
    }
    if (c === '"') {
      entreComillas = true;
      continue;
    }
    if (c === separador) {
      campos.push(actual);
      actual = '';
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && sinBom[i + 1] === '\n') i += 1;
      campos.push(actual);
      filas.push(campos);
      campos = [];
      actual = '';
      continue;
    }
    actual += c;
  }
  if (actual !== '' || campos.length > 0) {
    campos.push(actual);
    filas.push(campos);
  }
  return filas;
}
