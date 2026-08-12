/**
 * Pruebas del registro de renderers (seccion 19 — Registry).
 */

import { describe, expect, it } from 'vitest';
import { RendererRegistry } from '../../src/core/registry.js';
import { UnknownRendererError } from '../../src/core/errors.js';
import { buildRegistry } from '../../src/renderers/index.js';
import { defaultConfig } from '../../src/config/load.js';
import type { DiagramRenderer, RenderResult } from '../../src/core/types.js';

function fakeRenderer(type: string): DiagramRenderer {
  return {
    type,
    defaultFormat: 'svg',
    supportedFormats: ['svg'],
    version: async () => `${type}-1.0.0`,
    render: async (): Promise<RenderResult> => ({
      format: 'svg',
      content: Buffer.from('<svg/>'),
      mimeType: 'image/svg+xml',
    }),
  };
}

describe('RendererRegistry', () => {
  it('encuentra un renderer registrado', () => {
    const registry = new RendererRegistry().register('plantuml', fakeRenderer('plantuml'));
    expect(registry.has('plantuml')).toBe(true);
    expect(registry.get('plantuml').type).toBe('plantuml');
  });

  it('lanza un error descriptivo si el renderer no existe', () => {
    const registry = new RendererRegistry().register('d2', fakeRenderer('d2'));
    expect(() => registry.get('inexistente')).toThrow(UnknownRendererError);
    try {
      registry.get('inexistente');
    } catch (err) {
      const message = (err as UnknownRendererError).format();
      expect(message).toContain('inexistente');
      expect(message).toContain('d2');
    }
  });

  it('permite registrar un renderer adicional en caliente', () => {
    const registry = new RendererRegistry();
    expect(registry.types()).toEqual([]);
    registry.register('personalizado', fakeRenderer('personalizado'));
    expect(registry.types()).toEqual(['personalizado']);
    expect(registry.get('personalizado').type).toBe('personalizado');
  });

  it('resuelve alias al tipo canonico', () => {
    const registry = new RendererRegistry().register('graphviz', fakeRenderer('graphviz'), ['dot']);
    expect(registry.resolve('dot')).toBe('graphviz');
    expect(registry.get('dot').type).toBe('graphviz');
    expect(registry.languages()).toContain('dot');
  });

  it('normaliza mayusculas y espacios', () => {
    const registry = new RendererRegistry().register('Mermaid', fakeRenderer('mermaid'));
    expect(registry.has('  MERMAID ')).toBe(true);
  });

  it('al desregistrar elimina tambien sus alias', () => {
    const registry = new RendererRegistry().register('graphviz', fakeRenderer('graphviz'), ['dot']);
    expect(registry.unregister('graphviz')).toBe(true);
    expect(registry.has('graphviz')).toBe(false);
    expect(registry.has('dot')).toBe(false);
  });

  it('un renderer sobrescrito reemplaza al anterior', () => {
    const registry = new RendererRegistry().register('d2', fakeRenderer('d2'));
    const replacement = { ...fakeRenderer('d2'), defaultFormat: 'png' as const };
    registry.register('d2', replacement);
    expect(registry.get('d2').defaultFormat).toBe('png');
  });
});

describe('buildRegistry', () => {
  it('registra todos los motores con la configuracion por defecto', () => {
    const registry = buildRegistry(defaultConfig(process.cwd()));
    expect(registry.types().sort()).toEqual(
      ['bpmn', 'd2', 'graphviz', 'likec4', 'mermaid', 'plantuml', 'plantuml-c4', 'svgbob', 'vega-lite'].sort(),
    );
  });

  it('plantuml-c4 acompana a plantuml y desaparece con el', () => {
    const config = defaultConfig(process.cwd());
    config.renderers.plantuml.enabled = false;
    const registry = buildRegistry(config);
    expect(registry.has('plantuml')).toBe(false);
    expect(registry.has('plantuml-c4')).toBe(false);
  });

  it('omite los renderers deshabilitados', () => {
    const config = defaultConfig(process.cwd());
    config.renderers.mermaid.enabled = false;
    config.renderers.likec4.enabled = false;
    const registry = buildRegistry(config);
    expect(registry.has('mermaid')).toBe(false);
    expect(registry.has('likec4')).toBe(false);
    expect(registry.has('plantuml')).toBe(true);
  });

  it('expone los alias documentados', () => {
    const registry = buildRegistry(defaultConfig(process.cwd()));
    expect(registry.resolve('puml')).toBe('plantuml');
    expect(registry.resolve('dot')).toBe('graphviz');
    expect(registry.resolve('vegalite')).toBe('vega-lite');
    expect(registry.resolve('c4')).toBe('likec4');
  });
});
