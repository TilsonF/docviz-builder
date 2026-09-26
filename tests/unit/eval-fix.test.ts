/**
 * Banco de reparaciones: lo que `docviz fix` sabe arreglar, y lo que no.
 *
 * `suggest` tenia 77 casos y particion reservada desde el principio; `fix` no
 * tenia ninguno, y esa asimetria costo cara: devolvia YAML corrupto al
 * renombrar dentro de una lista, y ninguna errata anidada recibia sugerencia.
 * Los dos defectos sobrevivieron a la suite y solo aparecieron al probar la
 * herramienta a mano contra bloques rotos de verdad.
 *
 * Las tres expectativas son deliberadamente distintas, porque «acierta» no es
 * una sola cosa:
 *
 *   repara           hay una errata inequivoca y la corrige.
 *   ya-estaba-bien   no hay nada que tocar; devolver algo seria empeorarlo.
 *   no-adivina       hay un fallo, pero deducir la intencion seria inventar:
 *                    toca reportar y dar el ejemplo canonico.
 *
 * El tercero importa tanto como el primero. Una herramienta de reparacion que
 * adivina es peor que una que calla: el bloque compila y dibuja otra cosa.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { fixBlock } from '../../src/mcp/tools.js';

interface Caso {
  id: string;
  lang: 'diagram' | 'chart' | 'architecture';
  roto: string;
  espera: 'repara' | 'ya-estaba-bien' | 'no-adivina';
  aplicado?: Array<[string, string]>;
}

const casos = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '..', '..', 'eval', 'reparaciones.json'), 'utf8'),
) as Caso[];

describe('banco de reparaciones', () => {
  it('tiene casos de los tres resultados posibles', () => {
    const porTipo = new Set(casos.map((c) => c.espera));
    expect([...porTipo].sort()).toEqual(['no-adivina', 'repara', 'ya-estaba-bien']);
  });

  for (const caso of casos) {
    it(`${caso.espera} · ${caso.id}`, () => {
      const out = fixBlock({ lang: caso.lang, source: caso.roto });

      if (caso.espera === 'repara') {
        expect(out.ok, `no lo reparo: ${String(out['error'] ?? '')}`).toBe(true);
        expect(out.cambiado).toBe(true);
        expect(out.aplicado).toEqual((caso.aplicado ?? []).map(([de, a]) => ({ de, a })));
        // Lo reparado tiene que seguir siendo YAML: el defecto mas grave que
        // tuvo esta herramienta fue devolver un bloque que ya no parseaba.
        expect(() => parseYaml(String(out.source))).not.toThrow();
        return;
      }

      if (caso.espera === 'ya-estaba-bien') {
        expect(out.ok).toBe(true);
        expect(out.cambiado).toBe(false);
        expect(out.source).toBe(caso.roto);
        return;
      }

      expect(out.ok).toBe(false);
      expect(out.aplicado ?? []).toEqual([]);
      // Reportar no basta: sin el esqueleto del tipo, el agente vuelve a
      // intentarlo a ciegas y gasta otra llamada.
      expect(out['ejemplo'] ?? out['error']).toBeDefined();
    });
  }
});
