/**
 * Lanzar un ejecutable que en Windows puede ser un guion por lotes.
 *
 * Desde Node 18.20 —la correccion de CVE-2024-27980— `spawn` y `execFile` se
 * niegan a ejecutar un `.cmd` o un `.bat` directamente. En Windows un `java`
 * instalado por un gestor de paquetes es a veces justo eso, asi que `doctor`
 * informaba de que no habia Java teniendolo, y PlantUML fallaba igual.
 *
 * La plataforma se inyecta para poder probar el caso de Windows desde
 * cualquier sistema; que funcione DE VERDAD alli lo comprueba la matriz de CI,
 * que es la unica que ejecuta un `cmd.exe`.
 */

import { describe, expect, it } from 'vitest';
import { invocacion } from '../../src/core/ejecutable.js';

describe('invocacion', () => {
  it('fuera de Windows no envuelve nada', () => {
    expect(invocacion('/usr/bin/java', ['-version'], 'linux')).toEqual({
      file: '/usr/bin/java',
      args: ['-version'],
      opciones: {},
    });
  });

  it('en Windows un .exe tampoco se envuelve', () => {
    // Envolver lo que no hace falta solo anade una capa donde se pierden los
    // codigos de salida.
    const out = invocacion('C:\\jdk\\bin\\java.exe', ['-version'], 'win32');
    expect(out.file).toBe('C:\\jdk\\bin\\java.exe');
    expect(out.opciones.windowsVerbatimArguments).toBeUndefined();
  });

  it('en Windows un .cmd se lanza a traves del interprete', () => {
    const out = invocacion('C:\\shims\\java.cmd', ['-version'], 'win32');
    expect(out.file.toLowerCase()).toContain('cmd');
    expect(out.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect(out.opciones.windowsVerbatimArguments).toBe(true);
  });

  it('la linea va citada, para que una ruta con espacios no se parta', () => {
    // `C:\\Program Files\\...` es la ruta por defecto de media Windows.
    const out = invocacion('C:\\Program Files\\Java\\java.cmd', ['-jar', 'C:\\mis cosas\\p.jar'], 'win32');
    expect(out.args[3]).toBe('"C:\\Program Files\\Java\\java.cmd" "-jar" "C:\\mis cosas\\p.jar"');
  });

  it('una comilla dentro de un argumento se escapa duplicandola', () => {
    // Es como cita `cmd.exe`, y sin ello un argumento con comillas cerraria la
    // linea antes de tiempo: ahi es donde empiezan las inyecciones.
    const out = invocacion('a.cmd', ['di "hola"'], 'win32');
    expect(out.args[3]).toBe('"a.cmd" "di ""hola"""');
  });

  it('`.BAT` en mayusculas cuenta igual', () => {
    expect(invocacion('J.BAT', [], 'win32').args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
  });
});
