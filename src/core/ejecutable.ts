/**
 * Como lanzar un ejecutable que en Windows puede ser un guion por lotes.
 *
 * Desde Node 18.20 —la correccion de CVE-2024-27980— `spawn` y `execFile` se
 * niegan a ejecutar un `.cmd` o un `.bat` directamente: lanzan `EINVAL`. Y en
 * Windows un `java` instalado por un gestor de paquetes es a veces justo eso,
 * un envoltorio por lotes. Sin esto, `doctor` informaba de que no hay Java
 * teniendolo, y PlantUML fallaba al dibujar por la misma razon.
 *
 * Se resuelve invocando `cmd.exe /d /s /c` con la linea ya citada, que es la
 * forma convencional. No se usa `shell: true` a proposito: ahi Node concatena
 * los argumentos sin citarlos, y uno de ellos es una ruta que viene de la
 * configuracion.
 */

export interface Invocacion {
  file: string;
  args: string[];
  /** Opciones extra para `spawn`/`execFile`. */
  opciones: { windowsVerbatimArguments?: boolean };
}

/** Entrecomilla para `cmd.exe`, donde las comillas se escapan duplicandolas. */
function citar(texto: string): string {
  return `"${texto.replace(/"/g, '""')}"`;
}

export function invocacion(
  ejecutable: string,
  args: readonly string[],
  plataforma: NodeJS.Platform = process.platform,
): Invocacion {
  const porLotes = /\.(cmd|bat)$/i.test(ejecutable);
  if (plataforma !== 'win32' || !porLotes) {
    return { file: ejecutable, args: [...args], opciones: {} };
  }
  return {
    file: process.env['COMSPEC'] ?? 'cmd.exe',
    args: ['/d', '/s', '/c', [citar(ejecutable), ...args.map(citar)].join(' ')],
    // `verbatim` porque la linea ya va citada: dejar que Node la vuelva a
    // citar la romperia.
    opciones: { windowsVerbatimArguments: true },
  };
}
