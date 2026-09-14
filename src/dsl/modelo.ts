/**
 * Un modelo de arquitectura, varias vistas.
 *
 * Documentar un sistema de verdad son tres vistas —contexto, contenedores,
 * componentes— y hasta ahora cada bloque tenia que declarar sus elementos otra
 * vez. A los tres meses las tres vistas del mismo sistema ya no coinciden, y
 * nadie sabe cual es la buena.
 *
 * El modelo se escribe una vez en un archivo y cada bloque elige que parte
 * enseña. Es la idea de LikeC4 —que ya es el motor que dibuja estos tipos—
 * traida al DSL.
 */

import { parse as parseYaml } from 'yaml';
import { ERROR_CODES } from '../core/errors.js';
import { leerArchivoDeclarado, type ContextoDatos } from './datos.js';
import { asRecord, fail, optionalArray, optionalString } from './util.js';

const FORMATOS = new Set(['.yaml', '.yml', '.json']);

/**
 * Sustituye `model` por los `elements` y `relations` que toque mostrar.
 *
 * Se hace antes de compilar, asi que el compilador de arquitectura recibe lo de
 * siempre: para el no existe la diferencia entre un bloque con modelo y uno
 * escrito a mano.
 */
export function resolverModelo(doc: Record<string, unknown>, contexto?: ContextoDatos): void {
  const declarado = doc['model'] ?? doc['modelFile'];
  if (declarado === undefined) return;

  if (typeof declarado !== 'string' || declarado.trim() === '') {
    fail(
      'architecture.model debe ser la ruta de un archivo de modelo',
      `valor recibido: ${JSON.stringify(declarado)}`,
      ERROR_CODES.DSL_FIELD_TYPE,
    );
  }

  const ruta = declarado.trim();
  const { texto, extension } = leerArchivoDeclarado(ruta, 'architecture.model', FORMATOS, contexto);

  let leido: unknown;
  try {
    leido = extension === '.json' ? JSON.parse(texto) : parseYaml(texto);
  } catch (err) {
    fail(`${ruta} no se puede interpretar`, err instanceof Error ? err.message : String(err), ERROR_CODES.DSL_YAML);
  }
  const modelo = asRecord(leido, ruta);

  const elementos = optionalArray(modelo['elements'] ?? modelo['nodes'], `${ruta}.elements`);
  if (elementos.length === 0) {
    fail(`${ruta} no declara ningun elemento`, 'un modelo necesita al menos `elements`');
  }
  const relaciones = optionalArray(modelo['relations'] ?? modelo['relationships'], `${ruta}.relations`);

  // Lo que el bloque declare por su cuenta se suma al modelo: una vista puede
  // necesitar un sistema externo que no pertenece al modelo compartido.
  const propios = optionalArray(doc['elements'] ?? doc['nodes'], 'architecture.elements');
  const propiasRelaciones = optionalArray(doc['relations'] ?? doc['relationships'], 'architecture.relations');

  const todos = [...elementos, ...propios];
  const incluir = listaDeIds(doc, 'include', ruta);
  const excluir = listaDeIds(doc, 'exclude', ruta);

  const identificador = (raw: unknown, donde: string): string => {
    const record = asRecord(raw, donde);
    return optionalString(record, 'id') ?? optionalString(record, 'name') ?? '';
  };

  const conocidos = new Set(todos.map((e) => identificador(e, `${ruta}.elements`)));
  for (const id of [...incluir, ...excluir]) {
    if (!conocidos.has(id)) {
      fail(
        `"${id}" no existe en ${ruta}`,
        `elementos del modelo: ${[...conocidos].filter((x) => x !== '').sort().join(', ')}`,
      );
    }
  }

  const visibles = todos.filter((e) => {
    const id = identificador(e, `${ruta}.elements`);
    if (excluir.includes(id)) return false;
    return incluir.length === 0 || incluir.includes(id);
  });
  if (visibles.length === 0) {
    fail('la vista se queda sin elementos', 'revisa `include` y `exclude`: no dejan nada que dibujar');
  }

  // Una relacion solo se dibuja si sus dos extremos estan en la vista. Dejar
  // una flecha colgando de un elemento que no se ve confunde mas que omitirla.
  const idsVisibles = new Set(visibles.map((e) => identificador(e, `${ruta}.elements`)));
  const relacionesVisibles = [...relaciones, ...propiasRelaciones].filter((raw) => {
    const record = asRecord(raw, `${ruta}.relations`);
    const desde = optionalString(record, 'from');
    const hasta = optionalString(record, 'to');
    return desde !== undefined && hasta !== undefined && idsVisibles.has(desde) && idsVisibles.has(hasta);
  });

  doc['elements'] = visibles;
  doc['relations'] = relacionesVisibles;
  // El padre de un elemento puede haber quedado fuera de la vista; dejar la
  // referencia colgando haria fallar al compilador por algo que el autor no
  // escribio.
  for (const raw of visibles) {
    const record = asRecord(raw, `${ruta}.elements`);
    const padre = optionalString(record, 'parent');
    if (padre !== undefined && !idsVisibles.has(padre)) delete (record as Record<string, unknown>)['parent'];
  }
}

/** Lista de identificadores de `include` o `exclude`. */
function listaDeIds(doc: Record<string, unknown>, campo: string, ruta: string): string[] {
  return optionalArray(doc[campo], `architecture.${campo}`).map((valor) => {
    if (typeof valor !== 'string' || valor.trim() === '') {
      fail(
        `architecture.${campo} debe ser una lista de identificadores`,
        `valor recibido: ${JSON.stringify(valor)}; los identificadores son los \`id\` de ${ruta}`,
      );
    }
    return valor.trim();
  });
}
