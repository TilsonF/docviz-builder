/**
 * Tipos del script de eval, para poder probarlo desde TypeScript.
 *
 * El script es `.mjs` a proposito: se ejecuta con node sin compilar, igual que
 * el resto de `scripts/`. Esta declaracion solo describe lo que exporta.
 */

export declare function extraerBloque(texto: string): { lang: string; source: string } | undefined;
