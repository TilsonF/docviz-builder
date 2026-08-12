/**
 * Codigo que se ejecuta dentro del navegador, no en Node.
 *
 * Puppeteer serializa estas funciones y las evalua en el contexto de la pagina,
 * asi que aqui se puede usar el DOM y no se puede usar nada del proceso: ni
 * imports, ni variables del modulo, ni tipos de Node.
 *
 * Estan en su propio archivo por dos razones. La primera es que asi queda
 * explicito que pertenecen a otro entorno. La segunda es de medicion: al
 * ejecutarse en Chromium, ninguna herramienta de cobertura del proceso puede
 * verlas, y mezclarlas con el resto falsearia el dato.
 */

/** Minimo del DOM que necesitan estas funciones. */
interface DomElement {
  innerHTML: string;
  querySelector(selector: string): DomSvgElement | null;
}
interface DomSvgElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  getBBox(): { x: number; y: number; width: number; height: number };
}
interface DomDocument {
  getElementById(id: string): DomElement | null;
}

export interface MermaidArgs {
  code: string;
  id: string;
  config: unknown;
}

export type RenderOutcome = { svg: string } | { error: string };

/**
 * Dibuja un diagrama de Mermaid y devuelve su SVG.
 *
 * Ajusta ademas el lienzo al contenido real: algunas notaciones recientes
 * (radar, treemap) escriben etiquetas fuera del `viewBox` que declaran y quedan
 * recortadas. Medirlo solo es posible aqui, con el documento ya construido.
 */
export async function renderMermaidInPage(args: MermaidArgs): Promise<RenderOutcome> {
  const mermaid = (globalThis as unknown as { mermaid?: Record<string, never> }).mermaid;
  if (mermaid === undefined) return { error: 'el bundle de Mermaid no se cargo en la pagina' };

  try {
    (mermaid as unknown as { initialize(c: unknown): void }).initialize(args.config);
    const rendered = await (
      mermaid as unknown as { render(id: string, code: string): Promise<{ svg: string }> }
    ).render(args.id, args.code);

    const dom = (globalThis as unknown as { document?: DomDocument }).document;
    const host = dom?.getElementById('host') ?? null;
    if (host === null) return { svg: rendered.svg };

    host.innerHTML = rendered.svg;
    const svgEl = host.querySelector('svg');
    if (svgEl === null) return { svg: rendered.svg };

    const box = svgEl.getBBox();
    const declared = svgEl.getAttribute('viewBox');
    const parts = declared?.trim().split(/[\s,]+/).map(Number) ?? [];
    const fits =
      parts.length === 4 &&
      box.x >= parts[0]! - 1 &&
      box.y >= parts[1]! - 1 &&
      box.x + box.width <= parts[0]! + parts[2]! + 1 &&
      box.y + box.height <= parts[1]! + parts[3]! + 1;

    if (fits || box.width <= 0 || box.height <= 0) return { svg: rendered.svg };

    const pad = 8;
    const x = Math.floor(box.x - pad);
    const y = Math.floor(box.y - pad);
    const w = Math.ceil(box.width + pad * 2);
    const h = Math.ceil(box.height + pad * 2);
    svgEl.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    svgEl.setAttribute('width', String(w));
    svgEl.setAttribute('height', String(h));
    return { svg: host.innerHTML };
  } catch (e) {
    const err = e as { message?: string; str?: string };
    return { error: err.str ?? err.message ?? String(e) };
  }
}

/** Dibuja un proceso BPMN con bpmn-js y devuelve su SVG. */
export async function renderBpmnInPage(xml: string): Promise<RenderOutcome> {
  const Viewer = (globalThis as unknown as { BpmnJS?: new (o: unknown) => unknown }).BpmnJS;
  if (Viewer === undefined) return { error: 'el visor de bpmn-js no se cargo en la pagina' };

  const viewer = new Viewer({ container: '#lienzo' }) as {
    importXML(x: string): Promise<{ warnings?: unknown[] }>;
    saveSVG(): Promise<{ svg: string }>;
  };
  try {
    await viewer.importXML(xml);
    const { svg } = await viewer.saveSVG();
    return { svg };
  } catch (e) {
    const err = e as { message?: string };
    return { error: err.message ?? String(e) };
  }
}
