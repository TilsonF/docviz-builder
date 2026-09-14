/**
 * Pruebas de la observacion del origen.
 *
 * Escribir documentacion es un ciclo de segundos, y sin esto el ciclo pasa por
 * la terminal cada vez. Lo que se comprueba aqui es que reaccione a lo que debe
 * —y sobre todo que **no** reaccione a lo que no debe—, porque un observador
 * que recompila con cada archivo temporal del editor es peor que ninguno.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { esRelevante, watchSource, type Watcher } from '../../src/build/watch.js';

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
  it('avisa cuando cambia un documento', async () => {
    const dir = await proyecto();
    await writeFile(path.join(dir, 'a.md'), '# uno\n', 'utf8');

    const cambios: string[] = [];
    watcher = watchSource(dir, { debounceMs: 20, onChange: (f) => void cambios.push(f) });

    await writeFile(path.join(dir, 'a.md'), '# dos\n', 'utf8');
    await vi.waitFor(() => expect(cambios.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(cambios[0]).toContain('a.md');
  });

  it('varios guardados seguidos son una sola recompilacion', async () => {
    const dir = await proyecto();
    let veces = 0;
    // La espera es holgada a proposito: con una ventana corta, cuatro
    // escrituras seguidas pueden caer en dos ventanas distintas en una maquina
    // lenta, y la prueba fallaria por el reloj y no por el codigo.
    watcher = watchSource(dir, { debounceMs: 400, onChange: () => void (veces += 1) });

    // Un editor no guarda una vez: escribe, renombra y vuelve a tocar.
    for (const n of [1, 2, 3, 4]) await writeFile(path.join(dir, 'a.md'), `# ${n}\n`, 'utf8');
    await vi.waitFor(() => expect(veces).toBe(1), { timeout: 8000 });

    await new Promise((r) => setTimeout(r, 500));
    expect(veces, 'la ventana de espera agrupo mal').toBe(1);
  });

  it('ignora lo que no es documentacion', async () => {
    const dir = await proyecto();
    let veces = 0;
    watcher = watchSource(dir, { debounceMs: 20, onChange: () => void (veces += 1) });

    await writeFile(path.join(dir, 'notas.txt'), 'texto', 'utf8');
    await writeFile(path.join(dir, '.a.md.swp'), 'x', 'utf8');
    await new Promise((r) => setTimeout(r, 300));
    expect(veces).toBe(0);
  });

  it('un fallo al recompilar no detiene la observacion', async () => {
    const dir = await proyecto();
    const mensajes: string[] = [];
    let veces = 0;
    watcher = watchSource(dir, {
      debounceMs: 20,
      onLog: (m) => void mensajes.push(m),
      onChange: () => {
        veces += 1;
        if (veces === 1) throw new Error('el build se cayo');
      },
    });

    await writeFile(path.join(dir, 'a.md'), '# uno\n', 'utf8');
    await vi.waitFor(() => expect(mensajes.some((m) => m.includes('el build se cayo'))).toBe(true), {
      timeout: 5000,
    });

    // Y sigue viva para el siguiente guardado, que es el punto.
    await writeFile(path.join(dir, 'a.md'), '# dos\n', 'utf8');
    await vi.waitFor(() => expect(veces).toBe(2), { timeout: 5000 });
  });

  it('cerrar la deja muda', async () => {
    const dir = await proyecto();
    let veces = 0;
    const w = watchSource(dir, { debounceMs: 20, onChange: () => void (veces += 1) });
    w.close();

    await writeFile(path.join(dir, 'a.md'), '# uno\n', 'utf8');
    await new Promise((r) => setTimeout(r, 300));
    expect(veces).toBe(0);
  });

  it('observar un directorio que no existe se reporta con su ruta', () => {
    const dir = path.join(tmpdir(), 'docviz-no-existe-nunca');
    expect(() => watchSource(dir, { onChange: () => undefined })).toThrow(/no se pudo observar/);
  });

  it('tambien ve los subdirectorios', async () => {
    const dir = await proyecto();
    await mkdir(path.join(dir, 'sub'), { recursive: true });

    let veces = 0;
    watcher = watchSource(dir, { debounceMs: 20, onChange: () => void (veces += 1) });

    await writeFile(path.join(dir, 'sub', 'b.md'), '# b\n', 'utf8');
    await vi.waitFor(() => expect(veces).toBeGreaterThan(0), { timeout: 5000 });
  });
});
