/**
 * Los respaldos hacia D2, por sus ramas y no por su camino feliz.
 *
 * Son los que permiten dibujar sin Java y sin navegador: quince tipos del
 * catalogo caen aqui en una maquina con solo Node. Estaban al 56 % de ramas
 * cubiertas, lo que significa que la mitad de sus decisiones —una nota al
 * margen, una bifurcacion, un flujo sin pasos declarados— no las habia
 * ejecutado nadie nunca.
 */

import { describe, expect, it } from 'vitest';
import { compileDsl } from '../../src/dsl/index.js';

/** Compila un tipo forzando su respaldo en D2. */
const d2 = (yaml: string): string => {
  const out = compileDsl('diagram', yaml, (motor) => motor === 'd2');
  expect(out.rendererType).toBe('d2');
  return out.source;
};

describe('activity · las formas que no son un paso', () => {
  it('una decision abre dos ramas y las vuelve a juntar', () => {
    const src = d2(
      [
        'type: activity',
        'flow:',
        '  - Recibir',
        '  - decision: Aprobada?',
        '    yes:',
        '      - Notificar',
        '    no:',
        '      - Rechazar',
        '  - Cerrar',
      ].join('\n'),
    );
    expect(src).toContain('Aprobada?');
    expect(src).toContain('Notificar');
    expect(src).toContain('Rechazar');
    // Las dos ramas desembocan en el mismo paso siguiente.
    expect(src).toContain('Cerrar');
  });

  it('`si` vale igual que `yes` en la rama positiva', () => {
    const con = (clave: string): string =>
      d2(['type: activity', 'flow:', `  - decision: Vale?`, `    ${clave}:`, '      - Seguir'].join('\n'));
    expect(con('si')).toBe(con('yes'));
  });

  it('un bloque `parallel` abre varias ramas a la vez', () => {
    const src = d2(
      [
        'type: activity',
        'flow:',
        '  - Preparar',
        '  - parallel:',
        '      - - Enviar correo',
        '      - - Registrar auditoria',
        '  - Terminar',
      ].join('\n'),
    );
    expect(src).toContain('Enviar correo');
    expect(src).toContain('Registrar auditoria');
  });

  it('una nota se dibuja al margen y no encadena con el paso siguiente', () => {
    // Si encadenara, el flujo diria que despues de «Recibir» viene un
    // comentario, que es justo lo que una nota NO es.
    const src = d2(
      ['type: activity', 'flow:', '  - Recibir', '  - note: ojo con los festivos', '  - Cerrar'].join('\n'),
    );
    expect(src).toContain('shape: page');
    expect(src).toContain('style.stroke-dash');
  });
});

describe('cuando solo hay relaciones, el diagrama es el grafo', () => {
  it('component sin componentes declarados dibuja lo que las relaciones nombran', () => {
    // Es el atajo que usa quien ya sabe como se conecta todo y no quiere
    // declarar dos veces cada caja.
    const src = d2(['type: component', 'relations:', '  - API -> Base de datos: consulta'].join('\n'));
    expect(src).toContain('API');
    expect(src).toContain('Base de datos');
    expect(src).toContain('consulta');
  });

  it('una relacion sin etiqueta tambien vale', () => {
    const src = d2(['type: component', 'relations:', '  - API -> Cache'].join('\n'));
    expect(src).toContain('->');
  });
});

describe('cada respaldo declarado en el catalogo compila de verdad', () => {
  // Esto no mide ramas: comprueba que la promesa del catalogo se sostenga.
  // Un respaldo declarado y roto es peor que no declararlo, porque `doctor`
  // dice que el tipo se dibujara y luego no se dibuja.
  it('los 22 respaldos producen una fuente no vacia con su motor', async () => {
    const { TYPE_CATALOG } = await import('../../src/dsl/catalog.js');
    const rotos: string[] = [];
    let n = 0;
    for (const spec of TYPE_CATALOG) {
      for (const respaldo of spec.fallbacks ?? []) {
        n += 1;
        try {
          const out = compileDsl(spec.lang, spec.example, (m) => m === respaldo);
          if (out.rendererType !== respaldo || out.source.trim().length < 10) {
            rotos.push(`${spec.type} -> ${respaldo}`);
          }
        } catch (err) {
          rotos.push(`${spec.type} -> ${respaldo}: ${(err as Error).message}`);
        }
      }
    }
    expect(rotos).toEqual([]);
    expect(n).toBeGreaterThan(20);
  });
});

describe('block y journey · los casos de una sola pieza', () => {
  it('una fila de un solo bloque no se envuelve en un contenedor', () => {
    // Seria una caja alrededor de otra caja. El respaldo tiene que tomar la
    // misma decision que el motor preferido o el dibujo cambia de forma.
    const una = d2(['type: block', 'rows:', '  - Frontend'].join('\n'));
    const dos = d2(['type: block', 'rows:', '  - [Frontend, Backend]'].join('\n'));
    expect(una).not.toContain('grid-columns');
    expect(dos).toContain('grid-columns: 2');
  });

  it('un paso de journey sin puntuacion ni actores sale solo con su nombre', () => {
    const sin = d2(
      ['type: journey', 'sections:', '  - name: Alta', '    steps:', '      - name: Entrar'].join('\n'),
    );
    const con = d2(
      [
        'type: journey',
        'sections:',
        '  - name: Alta',
        '    steps:',
        '      - name: Entrar',
        '        score: 4',
        '        actors: [Cliente]',
      ].join('\n'),
    );
    expect(sin).not.toContain('/5');
    expect(con).toContain('4/5');
    expect(con).toContain('Cliente');
  });
});
