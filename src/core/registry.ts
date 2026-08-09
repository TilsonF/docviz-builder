/**
 * Registro de renderers.
 *
 * El parser Markdown consulta este registro para saber que lenguajes son
 * "compilables"; nunca importa un renderer concreto.
 */

import { UnknownRendererError } from './errors.js';
import type { DiagramRenderer } from './types.js';

export class RendererRegistry {
  private readonly renderers = new Map<string, DiagramRenderer>();
  /** Alias de lenguaje -> tipo canonico (`dot` -> `graphviz`, etc.). */
  private readonly aliases = new Map<string, string>();

  register(type: string, renderer: DiagramRenderer, aliases: readonly string[] = []): this {
    const key = normalize(type);
    this.renderers.set(key, renderer);
    for (const alias of aliases) this.aliases.set(normalize(alias), key);
    return this;
  }

  unregister(type: string): boolean {
    const key = normalize(type);
    for (const [alias, target] of this.aliases) {
      if (target === key) this.aliases.delete(alias);
    }
    return this.renderers.delete(key);
  }

  /** Resuelve alias y devuelve el tipo canonico, o `undefined` si no existe. */
  resolve(type: string): string | undefined {
    const key = normalize(type);
    if (this.renderers.has(key)) return key;
    const aliased = this.aliases.get(key);
    if (aliased !== undefined && this.renderers.has(aliased)) return aliased;
    return undefined;
  }

  has(type: string): boolean {
    return this.resolve(type) !== undefined;
  }

  /** Devuelve el renderer o lanza `UnknownRendererError`. */
  get(type: string): DiagramRenderer {
    const canonical = this.resolve(type);
    if (canonical === undefined) throw new UnknownRendererError(type, this.types());
    return this.renderers.get(canonical)!;
  }

  types(): string[] {
    return [...this.renderers.keys()].sort();
  }

  /** Todos los lenguajes reconocidos en una valla de codigo, alias incluidos. */
  languages(): string[] {
    return [...new Set([...this.renderers.keys(), ...this.aliases.keys()])].sort();
  }

  async disposeAll(): Promise<void> {
    const errors: unknown[] = [];
    for (const renderer of this.renderers.values()) {
      try {
        await renderer.dispose?.();
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'fallo la liberacion de algun renderer');
    }
  }
}

function normalize(type: string): string {
  return type.trim().toLowerCase();
}
