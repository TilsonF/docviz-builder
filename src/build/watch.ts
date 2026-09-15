/**
 * Observacion del directorio de origen.
 *
 * Escribir documentacion es un ciclo de segundos: cambias una linea, quieres
 * verla. Sin esto el ciclo pasa por la terminal cada vez, y eso es lo que hace
 * que se deje de previsualizar y se publique a ciegas.
 *
 * No se anade ninguna dependencia: `fs.watch` con `recursive` funciona en los
 * tres sistemas desde Node 20, que es el minimo del proyecto.
 */

import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

/** Extensiones que provocan una recompilacion. */
const RELEVANTES = new Set(['.md', '.markdown', '.yaml', '.yml', '.json', '.svg', '.png', '.jpg', '.jpeg']);

/** Directorios que nunca se observan, aunque cuelguen del origen. */
const IGNORADOS = new Set(['node_modules', '.git', '.docviz-cache', 'dist', 'coverage']);

export interface WatchOptions {
  /**
   * Espera antes de recompilar.
   *
   * Un editor no guarda una vez: escribe, renombra y vuelve a tocar el archivo,
   * y sin esta pausa se lanzarian tres builds por cada Ctrl+S.
   */
  debounceMs?: number;
  /** Se invoca con la ruta que cambio. Los errores no detienen la observacion. */
  onChange: (archivo: string) => void | Promise<void>;
  /** Receptor de avisos del propio observador. */
  onLog?: (mensaje: string) => void;
  /**
   * Sustituye a `fs.watch`. Solo se usa en pruebas.
   *
   * En macOS la observacion recursiva va sobre FSEvents, que entrega los avisos
   * con latencia y bajo carga tarda mas que cualquier margen razonable. Probar
   * el agrupado y el manejo de errores contra eso convierte la suite en una
   * apuesta; con el observador inyectado son deterministas, y queda una sola
   * prueba tocando el sistema de archivos de verdad.
   */
  watchImpl?: typeof watch;
}

export interface Watcher {
  close(): void;
}

/** `true` si el cambio en ese archivo justifica volver a compilar. */
export function esRelevante(archivo: string): boolean {
  const nombre = path.basename(archivo);
  // Archivos temporales de editor: Vim deja `.swp` y `4913`, y varios escriben
  // un `~` o un punto delante mientras guardan.
  if (nombre.startsWith('.') || nombre.endsWith('~')) return false;
  if (archivo.split(path.sep).some((parte) => IGNORADOS.has(parte))) return false;
  return RELEVANTES.has(path.extname(nombre).toLowerCase());
}

export function watchSource(dir: string, options: WatchOptions): Watcher {
  const raiz = path.resolve(dir);
  const espera = options.debounceMs ?? 120;
  const log = options.onLog ?? (() => undefined);

  let temporizador: NodeJS.Timeout | undefined;
  let pendiente: string | undefined;
  let trabajando = false;
  let repetir = false;
  let cerrado = false;

  const lanzar = async (): Promise<void> => {
    if (cerrado) return;
    // Una recompilacion en curso no se interrumpe: se anota que hay que volver
    // a hacerla al terminar. Guardar tres veces seguidas no encadena tres
    // builds solapados sobre el mismo directorio de salida.
    if (trabajando) {
      repetir = true;
      return;
    }
    trabajando = true;
    try {
      do {
        repetir = false;
        const archivo = pendiente ?? raiz;
        pendiente = undefined;
        await options.onChange(archivo);
      } while (repetir);
    } catch (err) {
      log(`error al recompilar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      trabajando = false;
    }
  };

  const observar = options.watchImpl ?? watch;
  let watcher: FSWatcher;
  try {
    watcher = observar(raiz, { recursive: true }, (_evento, nombre) => {
      // Un aviso ya en vuelo puede llegar despues de cerrar: sin esta guarda,
      // pulsar Ctrl+C dejaria una ultima recompilacion programada.
      if (cerrado) return;
      if (nombre === null || nombre === undefined) return;
      const relativo = String(nombre);
      if (!esRelevante(relativo)) return;
      pendiente = path.join(raiz, relativo);
      if (temporizador !== undefined) clearTimeout(temporizador);
      temporizador = setTimeout(() => void lanzar(), espera);
      temporizador.unref?.();
    });
  } catch (err) {
    throw new Error(
      `no se pudo observar ${raiz}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  watcher.on('error', (err) => log(`el observador fallo: ${err.message}`));

  return {
    close: () => {
      cerrado = true;
      if (temporizador !== undefined) clearTimeout(temporizador);
      watcher.close();
    },
  };
}
