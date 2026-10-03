/**
 * Lo que hereda quien instala DocViz.
 *
 * No basta con auditarlo una vez: una dependencia nueva entra con su licencia
 * y nadie la mira. La prueba corre el mismo generador que escribe el documento
 * y falla si el arbol real ya no coincide con lo publicado, o si aparece una
 * licencia que el script no sabe clasificar.
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');

describe('LICENCIAS.md', () => {
  it('esta al dia con el arbol de produccion real', () => {
    // Si esto falla: `node scripts/licencias.mjs`. Si falla POR UNA LICENCIA
    // SIN CLASIFICAR, no la añadas sin leer que obliga.
    const salida = execFileSync('node', ['scripts/licencias.mjs', '--check'], {
      cwd: raiz,
      encoding: 'utf8',
    });
    expect(salida).toContain('licencias al dia');
  });

  it('nombra las dos que piden algo mas que atribucion', () => {
    // Con los espacios normalizados: el documento va con las lineas ajustadas
    // y una frase puede partirse en dos, como paso con «marca de agua».
    const doc = readFileSync(path.join(raiz, 'LICENCIAS.md'), 'utf8').replace(/\s+/g, ' ');
    // `@terrastruct/d2` es el motor de D2 y es MPL-2.0; `bpmn-js` trae una
    // clausula de marca de agua. Las dos viajan rio abajo.
    expect(doc).toContain('@terrastruct/d2');
    expect(doc).toContain('bpmn-js');
    expect(doc).toContain('marca de agua');
  });

  it('viaja dentro del paquete publicado', () => {
    // De poco sirve si solo esta en el repositorio: quien la necesita es quien
    // lo instala desde npm.
    const pkg = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8')) as { files: string[] };
    expect(pkg.files).toContain('LICENCIAS.md');
  });
});

describe('auditoria de produccion', () => {
  it('no hay vulnerabilidades sin aceptar, ni excepciones caducadas', () => {
    // Si esto falla por una EXCEPCION CADUCADA, el trabajo no es mover la
    // fecha: es mirar si ya hay correccion publicada.
    const salida = execFileSync('node', ['scripts/auditoria.mjs'], { cwd: raiz, encoding: 'utf8' });
    expect(salida).toContain('auditoria de produccion limpia');
  });

  it('toda excepcion lleva motivo y fecha de revision', () => {
    const aceptadas = JSON.parse(readFileSync(path.join(raiz, 'auditoria-aceptada.json'), 'utf8')) as {
      avisos: Array<{ aviso: string; porque: string; revisar_el: string }>;
    };
    for (const a of aceptadas.avisos) {
      // Un «porque» de una linea no explica nada dentro de seis meses.
      expect(a.porque.length, `${a.aviso} sin motivo suficiente`).toBeGreaterThan(80);
      expect(a.revisar_el).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
