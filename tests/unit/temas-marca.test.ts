/**
 * Pruebas de los temas de marca.
 *
 * Los cuatro temas incluidos sirven para documentacion interna; lo que se
 * entrega a un cliente quiere su paleta, y hasta ahora la unica salida era
 * bifurcar el paquete. Lo que se comprueba aqui es que un tema a medida sea un
 * tema de verdad —que llegue a los seis motores— y que no se pueda colar nada
 * por el, porque estos valores acaban dentro de CSS y de un `skinparam`.
 */

import { describe, expect, it } from 'vitest';
import { buildTheme_, getTheme, resolveTheme, themeFingerprint } from '../../src/themes/index.js';
import { ConfigError } from '../../src/core/errors.js';

const marca = (palette: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  buildTheme_({ name: 'acme', base: 'corporate', palette, ...extra });

describe('un tema de marca es un tema completo', () => {
  it('el color declarado llega a los seis motores', () => {
    const t = marca({ primary: '#0F62FE' });

    expect(t.palette.primary).toBe('#0F62FE');
    expect(t.plantuml.skinparams.join('\n')).toContain('#0F62FE');
    expect(JSON.stringify(t.mermaid.themeVariables)).toContain('#0F62FE');
    expect(JSON.stringify(t.d2.overrides)).toContain('#0F62FE');
    expect(JSON.stringify(t.graphviz)).toContain('#0F62FE');
    expect(JSON.stringify(t.vegaLite.config)).toContain('#0F62FE');
    expect(JSON.stringify(t.likec4)).toContain('#0F62FE');
  });

  it('lo que no se declara se hereda del tema base', () => {
    const base = getTheme('corporate');
    const t = marca({ primary: '#0F62FE' });

    expect(t.palette.background).toBe(base.palette.background);
    expect(t.palette.text).toBe(base.palette.text);
  });

  it('el cambio se aplica tambien al modo oscuro', () => {
    // Quien define el azul de su marca lo quiere en los dos modos; exigir que
    // lo repita seria pedirle que mantenga dos copias.
    const t = marca({ primary: '#0F62FE' });
    expect(t.dark.palette.primary).toBe('#0F62FE');
  });

  it('y se puede afinar el oscuro por separado', () => {
    const t = marca({ primary: '#0F62FE' }, { darkPalette: { primary: '#78A9FF' } });
    expect(t.palette.primary).toBe('#0F62FE');
    expect(t.dark.palette.primary).toBe('#78A9FF');
  });

  it('la serie categorica se sustituye entera o no se sustituye', () => {
    const seis = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'];
    expect(marca({ categorical: seis }).palette.categorical).toEqual(seis);
    expect(() => marca({ categorical: seis.slice(0, 5) })).toThrow(/exactamente seis/);
  });

  it('cambiar un color cambia la huella, y con ella el hash de los recursos', () => {
    // Si no, un ajuste de marca no repintaria nada: el cache serviria las
    // imagenes viejas y no habria forma de saber por que.
    const a = themeFingerprint(marca({ primary: '#0F62FE' }));
    const b = themeFingerprint(marca({ primary: '#FF7EB6' }));
    expect(a).not.toBe(b);
  });
});

describe('lo que no se acepta', () => {
  it('un color que no es hexadecimal', () => {
    expect(() => marca({ primary: 'rebeccapurple' })).toThrow(ConfigError);
    expect(() => marca({ primary: 'rebeccapurple' })).toThrow(/hexadecimal/);
  });

  it('una fuga por CSS disfrazada de color', () => {
    // `#fff; } svg { display:none` es CSS valido: aceptar cadenas libres
    // convertiria el tema en una via de inyeccion.
    expect(() => marca({ primary: '#fff; } svg { display:none' })).toThrow(/hexadecimal/);
  });

  it('una ranura que no existe, con la lista de las que si', () => {
    let error: ConfigError | undefined;
    try {
      marca({ primario: '#0F62FE' });
    } catch (err) {
      error = err as ConfigError;
    }
    expect(error?.message).toContain('no es una ranura');
    expect(error?.detail).toContain('primary');
  });

  it('una tipografia con caracteres que cierran la declaracion', () => {
    for (const fuente of ['Inter"; }', "Inter'; x", 'Inter; color:red', 'Inter<script>']) {
      expect(() => marca({}, { fontFamily: fuente }), fuente).toThrow(/caracteres/);
    }
  });

  it('una tipografia normal si', () => {
    expect(marca({}, { fontFamily: 'Inter, Helvetica, sans-serif' }).fontFamily).toBe(
      'Inter, Helvetica, sans-serif',
    );
  });
});

describe('resolucion desde la configuracion', () => {
  it('sin tema de marca se usa el incluido por su nombre', () => {
    expect(resolveTheme({ theme: { name: 'dark' } }).name).toBe('dark');
  });

  it('con tema de marca se construye el derivado', () => {
    const t = resolveTheme({
      theme: { name: 'acme', custom: { name: 'acme', base: 'executive', palette: { accent: '#FF7EB6' } } },
    });
    expect(t.name).toBe('acme');
    expect(t.palette.accent).toBe('#FF7EB6');
    expect(t.description).toContain('executive');
  });
});
