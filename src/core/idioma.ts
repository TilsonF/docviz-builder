/**
 * Idioma de lo que DocViz escribe para que lo lea una persona.
 *
 * El catalogo ya era bilingue —`purpose`, `whenToUse` y los ejemplos existen
 * en los dos idiomas y `suggest` puntua contra ambos— pero los MENSAJES de
 * error seguian solo en espanol, que es justo lo que se lee cuando algo falla.
 *
 * `COMPATIBILIDAD.md` marca la decision sobre el idioma por defecto como
 * condicion para la 1.0: cambiarlo despues seria incompatible para quien
 * analice la salida. Por eso aqui se construye el MECANISMO y se deja el
 * espanol por defecto: la decision pasa de ser una reescritura de ciento
 * ochenta sitios a cambiar una linea.
 *
 * Lo que un agente necesita para actuar no es la frase sino el codigo
 * (`DV104`), que no cambia con el idioma y nunca lo hara.
 */

export type Idioma = 'es' | 'en';

function delEntorno(): Idioma {
  const v = process.env['DOCVIZ_LANG']?.trim().toLowerCase();
  return v === 'en' || v?.startsWith('en-') === true ? 'en' : 'es';
}

let actual: Idioma = delEntorno();

export function idioma(): Idioma {
  return actual;
}

/** Lo fija a mano; devuelve el anterior, para poder restaurarlo. */
export function fijarIdioma(nuevo: Idioma): Idioma {
  const previo = actual;
  actual = nuevo;
  return previo;
}

/** Vuelve a mirar el entorno. Util cuando el proceso lo cambia en caliente. */
export function releerIdioma(): Idioma {
  actual = delEntorno();
  return actual;
}

/**
 * Las dos versiones de un texto, juntas.
 *
 * Se escriben en el mismo sitio y no en un catalogo aparte con claves: una
 * clave se queda sin traducir en silencio, y aqui es imposible anadir un
 * mensaje olvidando su version inglesa porque el compilador exige los dos
 * argumentos.
 */
export function t(es: string, en: string): string {
  return actual === 'en' ? en : es;
}
