/**
 * Pruebas de la observacion del origen.
 *
 * Escribir documentacion es un ciclo de segundos, y sin esto el ciclo pasa por
 * la terminal cada vez. Lo que se comprueba aqui es que reaccione a lo que debe
 * —y sobre todo que **no** reaccione a lo que no debe—, porque un observador
 * que recompila con cada archivo temporal del editor es peor que ninguno.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { esRelevante, watchSource, type Watcher } from '../../src/build/watch.js';

/**
 * Observador de mentira que entrega los avisos cuando se le dice.
 *
 * El de verdad va sobre FSEvents en macOS, que tiene latencia propia: probar el
 * agrupado contra el reloj del sistema operativo convierte la suite en una
 * apuesta. Aqui el tiempo lo controla la prueba.
 */
function observadorFalso() {
  let emitir: ((evento: string, nombre: string) => void) | undefined;
  let cerrado = false;
  const watchImpl = ((_dir: string, _opts: unknown, cb: (e: string, n: string) => void) => {
    emitir = cb;
    return { close: () => void (cerrado = true), on: () => undefined } as never;
  }) as never;

  return {
    watchImpl,
    cambia: (nombre: string) => emitir?.('change', nombre),
    cerrado: () => cerrado,
  };
}

const temps: string[] = [];
let watcher: Watcher | undefined;

async function proyecto(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docviz-watch-'));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  watcher?.close();
  watcher = undefined;
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('que cambios cuentan', () => {
  it('los documentos y los recursos', () => {
    for (const f of ['a.md', 'sub/b.markdown', 'datos.yaml', 'datos.json', 'logo.svg', 'foto.png']) {
      expect(esRelevante(f), f).toBe(true);
    }
  });

  it('no los archivos temporales del editor', () => {
    // Vim deja `.a.md.swp`; otros escriben con `~` al final mientras guardan.
    for (const f of ['.a.md.swp', '.DS_Store', 'a.md~']) {
      expect(esRelevante(f), f).toBe(false);
    }
  });

  it('no lo que cuelga de un directorio ignorado', () => {
    for (const f of [path.join('node_modules', 'x', 'a.md'), path.join('.docviz-cache', 'a.md')]) {
      expect(esRelevante(f), f).toBe(false);
    }
  });

  it('no el codigo ni nada que no sea documentacion', () => {
    for (const f of ['script.ts', 'notas.txt', 'a.pdf']) expect(esRelevante(f), f).toBe(false);
  });
});

describe('observacion', () => {
  it('avisa cuando cambia un documento, con su ruta', async () => {
    const falso = observadorFalso();
    const cambios: string[] = [];
    watcher = watchSource('/proyecto/docs-src', {
      debounceMs: 1,
      watchImpl: falso.watchImpl,
      onChange: (f) => void cambios.push(f),
    });

    falso.cambia('a.md');
    await vi.waitFor(() => expect(cambios).toHaveLength(1));
    expect(cambios[0]).toContain('a.md');
  });

  it('varios guardados seguidos son una sola recompilacion', async () => {
    const falso = observadorFalso();
    let veces = 0;
    watcher = watchSource('/proyecto', {
      debounceMs: 30,
      watchImpl: falso.watchImpl,
      onChange: () => void (veces += 1),
    });

    // Un editor no guarda una vez: escribe, renombra y vuelve a tocar.
    for (const _ of [1, 2, 3, 4]) falso.cambia('a.md');
    await vi.waitFor(() => expect(veces).toBe(1));

    await new Promise((r) => setTimeout(r, 120));
    expect(veces, 'la ventana de espera agrupo mal').toBe(1);
  });

  it('ignora lo que no es documentacion', async () => {
    const falso = observadorFalso();
    let veces = 0;
    watcher = watchSource('/proyecto', {
      debounceMs: 1,
      watchImpl: falso.watchImpl,
      onChange: () => void (veces += 1),
    });

    falso.cambia('notas.txt');
    falso.cambia('.a.md.swp');
    falso.cambia(path.join('node_modules', 'x', 'a.md'));
    await new Promise((r) => setTimeout(r, 80));
    expect(veces).toBe(0);
  });

  it('un fallo al recompilar no detiene la observacion', async () => {
    const falso = observadorFalso();
    const mensajes: string[] = [];
    let veces = 0;
    watcher = watchSource('/proyecto', {
      debounceMs: 1,
      watchImpl: falso.watchImpl,
      onLog: (m) => void mensajes.push(m),
      onChange: () => {
        veces += 1;
        if (veces === 1) throw new Error('el build se cayo');
      },
    });

    falso.cambia('a.md');
    await vi.waitFor(() => expect(mensajes.some((m) => m.includes('el build se cayo'))).toBe(true));

    // Y sigue viva para el siguiente guardado, que es el punto.
    falso.cambia('a.md');
    await vi.waitFor(() => expect(veces).toBe(2));
  });

  it('una recompilacion en curso no se solapa con la siguiente', async () => {
    const falso = observadorFalso();
    let enCurso = 0;
    let maximo = 0;
    let terminadas = 0;
    watcher = watchSource('/proyecto', {
      debounceMs: 1,
      watchImpl: falso.watchImpl,
      onChange: async () => {
        enCurso += 1;
        maximo = Math.max(maximo, enCurso);
        await new Promise((r) => setTimeout(r, 30));
        enCurso -= 1;
        terminadas += 1;
      },
    });

    falso.cambia('a.md');
    await new Promise((r) => setTimeout(r, 10));
    falso.cambia('b.md');
    await vi.waitFor(() => expect(terminadas).toBeGreaterThanOrEqual(2));
    // Dos builds a la vez sobre el mismo directorio de salida se pisarian.
    expect(maximo).toBe(1);
  });

  it('cerrar la deja muda', async () => {
    const falso = observadorFalso();
    let veces = 0;
    const w = watchSource('/proyecto', {
      debounceMs: 1,
      watchImpl: falso.watchImpl,
      onChange: () => void (veces += 1),
    });
    w.close();
    expect(falso.cerrado()).toBe(true);

    falso.cambia('a.md');
    await new Promise((r) => setTimeout(r, 60));
    expect(veces).toBe(0);
  });

  it('observar un directorio que no existe se reporta con su ruta', () => {
    const dir = path.join(tmpdir(), 'docviz-no-existe-nunca');
    expect(() => watchSource(dir, { onChange: () => undefined })).toThrow(/no se pudo observar/);
  });
});

describe('sobre el sistema de archivos de verdad', () => {
  it('un guardado real acaba llegando', async () => {
    // La unica que depende del sistema operativo. En macOS la observacion
    // recursiva va sobre FSEvents, que entrega con latencia propia: el margen
    // es amplio a proposito porque aqui no se mide la velocidad, solo que el
    // aviso llegue.
    const dir = await mkdtemp(path.join(tmpdir(), 'docviz-watch-'));
    temps.push(dir);
    await writeFile(path.join(dir, 'a.md'), '# uno\n', 'utf8');

    let veces = 0;
    watcher = watchSource(dir, { debounceMs: 20, onChange: () => void (veces += 1) });

    await writeFile(path.join(dir, 'a.md'), '# dos\n', 'utf8');
    await vi.waitFor(() => expect(veces).toBeGreaterThan(0), { timeout: 20_000, interval: 100 });
  }, 30_000);
});
