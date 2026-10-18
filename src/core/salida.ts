/**
 * Tamano de destino del dibujo.
 *
 * Un diagrama no se lee igual embebido en una pagina de documentacion que
 * proyectado en una sala. Hasta ahora DocViz emitia un SVG con el tamano que
 * decidiera el motor, y quien lo pegaba en una diapositiva lo escalaba a mano:
 * las etiquetas quedaban a 8 o 9 pixeles efectivos y el diagrama era un adorno
 * ilegible.
 *
 * Lo que se declara aqui es el **lienzo de destino** y la **altura minima de
 * letra** que ese destino exige. No se recoloca nada: se escala el lienzo
 * conservando el `viewBox`, que es lo mismo que hace un navegador al mostrar la
 * imagen mas grande, y por tanto no puede solapar ni recortar nada.
 *
 * Y cuando el dibujo no cabe en el destino con la letra legible, eso **se
 * dice**. Es el unico veredicto de densidad que se puede dar sin adivinar: no
 * sale de contar nodos, sale de medir el dibujo ya hecho.
 */

/** Destinos declarables. `fit` deja el tamano que emitio el motor. */
export const TAMANOS_SALIDA = [
  'fit',
  'doc-inline',
  'doc-wide',
  'slide-16x9',
  'slide-4x3',
  'social-og',
  'print-a4-landscape',
] as const;

export type TamanoSalida = (typeof TAMANOS_SALIDA)[number];

export const TAMANO_POR_DEFECTO: TamanoSalida = 'fit';

export interface Lienzo {
  /** Ancho utilizable del destino, en pixeles CSS. */
  width: number;
  /** Alto utilizable. `0` significa que el destino no limita la altura. */
  height: number;
  /**
   * Altura minima de letra que el destino exige, en pixeles CSS.
   *
   * Una diapositiva se mira desde el fondo de la sala; una pagina, a medio
   * metro. Los valores salen de las guias tipograficas habituales para cada
   * distancia de lectura, no de una preferencia.
   */
  minFontPx: number;
  /** Para que sirve, en una linea. Lo imprime `docviz schema`. */
  purpose: string;
}

export const LIENZOS: Readonly<Record<Exclude<TamanoSalida, 'fit'>, Lienzo>> = {
  'doc-inline': { width: 680, height: 0, minFontPx: 12, purpose: 'Dentro del ancho de lectura de una pagina.' },
  'doc-wide': { width: 1000, height: 0, minFontPx: 12, purpose: 'A sangre, usando todo el ancho de la pagina.' },
  'slide-16x9': { width: 1280, height: 720, minFontPx: 16, purpose: 'Una diapositiva panoramica proyectada.' },
  'slide-4x3': { width: 1024, height: 768, minFontPx: 16, purpose: 'Una diapositiva en formato clasico.' },
  'social-og': { width: 1200, height: 630, minFontPx: 18, purpose: 'Tarjeta de enlace; se mira en miniatura.' },
  'print-a4-landscape': { width: 1123, height: 794, minFontPx: 11, purpose: 'A4 horizontal a 96 ppp.' },
};

export function esTamanoSalida(valor: string): valor is TamanoSalida {
  return (TAMANOS_SALIDA as readonly string[]).includes(valor);
}

/** Lado del `viewBox`, que es la geometria real del dibujo. */
function viewBox(svg: string): { w: number; h: number } | undefined {
  const apertura = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (apertura === undefined) return undefined;
  const vb = /\bviewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(apertura);
  if (vb === null) return undefined;
  const partes = (vb[1] ?? vb[2] ?? '').trim().split(/[\s,]+/).map(Number);
  if (partes.length !== 4 || !partes.every((n) => Number.isFinite(n))) return undefined;
  const [, , w, h] = partes as [number, number, number, number];
  return w > 0 && h > 0 ? { w, h } : undefined;
}

/**
 * Letra mas pequena que el dibujo usa de verdad, en unidades del `viewBox`.
 *
 * Se mira el atributo y la declaracion CSS, que es como la escriben los nueve
 * motores. Se ignoran los valores relativos (`em`, `%`, `smaller`): no se
 * pueden resolver sin maquetar, y tomarlos por pixeles daria un factor absurdo.
 */
export function letraMinima(svg: string): number | undefined {
  let minimo: number | undefined;
  const considerar = (bruto: string): void => {
    const n = Number.parseFloat(bruto);
    if (!Number.isFinite(n) || n <= 0) return;
    if (minimo === undefined || n < minimo) minimo = n;
  };
  for (const m of svg.matchAll(/font-size\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const valor = (m[1] ?? m[2] ?? '').trim();
    if (/^\d+(?:\.\d+)?(?:px)?$/i.test(valor)) considerar(valor);
  }
  for (const m of svg.matchAll(/font-size\s*:\s*([^;}"']+)/gi)) {
    const valor = m[1]!.trim();
    if (/^\d+(?:\.\d+)?(?:px)?$/i.test(valor)) considerar(valor);
  }
  return minimo;
}

export interface AjusteTamano {
  svg: string;
  /** Factor aplicado al lienzo. `1` significa que no se toco. */
  escala: number;
  /**
   * El dibujo no cabe en el destino con la letra legible.
   *
   * Cuando ocurre se respeta el encaje —agrandar mas recortaria el dibujo— y
   * queda este aviso, que es la unica senal honesta de que el diagrama tiene
   * demasiada informacion para donde va.
   */
  demasiadoDenso?: {
    letraEfectiva: number;
    letraMinima: number;
  };
}

/**
 * Escala el lienzo del SVG al destino declarado.
 *
 * El `viewBox` no se toca: cambiar `width`/`height` conservandolo es
 * exactamente lo que hace un navegador al mostrar la imagen mas grande o mas
 * pequena, asi que la geometria del dibujo queda intacta.
 */
export function ajustarTamano(svg: string, tamano: TamanoSalida): AjusteTamano {
  if (tamano === 'fit') return { svg, escala: 1 };
  const vb = viewBox(svg);
  if (vb === undefined) return { svg, escala: 1 };

  const lienzo = LIENZOS[tamano];
  const letra = letraMinima(svg);
  const porLetra = letra !== undefined ? lienzo.minFontPx / letra : 1;

  // Dos reglas, segun lo que acote el destino.
  //
  // Si acota las dos dimensiones —una diapositiva, una tarjeta, una hoja— el
  // dibujo **ocupa** el destino: ahi no hay nada mas en la pagina y dejarlo
  // pequeno en una esquina no ayuda a nadie.
  //
  // Si solo acota el ancho —una pagina de documentacion— el dibujo convive con
  // el texto: se reduce solo si desborda y se agranda solo si la letra no
  // llega al minimo. Un diagrama de tres nodos no se infla a ancho completo.
  //
  // En los dos casos el encaje manda sobre la legibilidad: pasarse del lienzo
  // recorta el dibujo, y un diagrama recortado no se lee en absoluto.
  const escala =
    lienzo.height > 0
      ? Math.min(lienzo.width / vb.w, lienzo.height / vb.h)
      : Math.min(lienzo.width / vb.w, Math.max(porLetra, 1));

  const resultado: AjusteTamano = {
    svg: fijarLienzo(svg, Math.round(vb.w * escala), Math.round(vb.h * escala)),
    escala,
  };
  if (letra !== undefined && letra * escala < lienzo.minFontPx - 0.5) {
    resultado.demasiadoDenso = {
      letraEfectiva: Math.round(letra * escala * 10) / 10,
      letraMinima: lienzo.minFontPx,
    };
  }
  return resultado;
}

function fijarLienzo(svg: string, width: number, height: number): string {
  const apertura = /<svg\b[^>]*>/i.exec(svg);
  if (apertura === null) return svg;
  let tag = apertura[0];
  for (const [attr, valor] of [
    ['width', String(width)],
    ['height', String(height)],
  ] as const) {
    const re = new RegExp(`(\\s${attr}\\s*=\\s*)(?:"[^"]*"|'[^']*')`, 'i');
    tag = re.test(tag) ? tag.replace(re, `$1"${valor}"`) : tag.replace(/^<svg\b/i, `<svg ${attr}="${valor}"`);
  }
  return svg.slice(0, apertura.index) + tag + svg.slice(apertura.index + apertura[0].length);
}

/**
 * Veredicto de densidad sobre un SVG **ya ajustado**.
 *
 * Se calcula a partir de los bytes finales y no se arrastra desde el render, a
 * proposito: un acierto de cache no vuelve a pasar por el motor, y un aviso que
 * solo aparece la primera vez es peor que no tenerlo. La escala aplicada se
 * deduce comparando el `width` declarado con el ancho del `viewBox`.
 */
export function veredictoDensidad(
  svg: string,
  tamano: TamanoSalida,
): { letraEfectiva: number; letraMinima: number } | undefined {
  if (tamano === 'fit') return undefined;
  const vb = viewBox(svg);
  const letra = letraMinima(svg);
  if (vb === undefined || letra === undefined) return undefined;

  const apertura = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const ancho = /\bwidth\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(apertura);
  const declarado = Number.parseFloat((ancho?.[1] ?? ancho?.[2] ?? '').trim());
  const escala = Number.isFinite(declarado) && declarado > 0 ? declarado / vb.w : 1;

  const minimo = LIENZOS[tamano].minFontPx;
  const efectiva = letra * escala;
  if (efectiva >= minimo - 0.5) return undefined;
  return { letraEfectiva: Math.round(efectiva * 10) / 10, letraMinima: minimo };
}
