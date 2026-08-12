/**
 * Compilador de BPMN.
 *
 * BPMN 2.0 separa el proceso (que pasa) de su diagrama (donde se dibuja cada
 * cosa), y el segundo exige coordenadas explicitas para cada figura y cada
 * punto de cada flecha. Escribir eso a mano es inviable, asi que aqui se
 * calcula un trazado de izquierda a derecha y las compuertas abren una fila
 * adicional por debajo.
 */

import { fail } from './util.js';
import { asRecord, optionalArray, optionalString, requireArray, requireString } from './util.js';

const START_SIZE = 36;
const END_SIZE = 36;
const TASK_WIDTH = 110;
const TASK_HEIGHT = 80;
const GATEWAY_SIZE = 50;
const GAP = 55;
const ROW_HEIGHT = 130;
const ORIGIN_X = 60;
const ORIGIN_Y = 80;

type StepKind = 'start' | 'task' | 'end' | 'gateway';

interface Step {
  kind: StepKind;
  id: string;
  name: string;
  /** Ramas de una compuerta: etiqueta del flujo y pasos que la siguen. */
  branches?: Array<{ label: string; steps: Step[] }>;
}

interface Shape {
  id: string;
  kind: StepKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Flow {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** Puntos intermedios cuando la flecha cambia de fila. */
  waypoints: Array<[number, number]>;
}

export function bpmn(doc: Record<string, unknown>): string {
  const rawFlow = requireArray(doc['flow'] ?? doc['pasos'], 'diagram.flow');
  let counter = 0;
  const nextId = (prefix: string): string => `${prefix}_${(counter += 1)}`;

  const parseSteps = (items: readonly unknown[], field: string): Step[] =>
    items.map((raw) => {
      const record = typeof raw === 'string' ? { task: raw } : asRecord(raw, field);

      for (const kind of ['start', 'task', 'end'] as const) {
        const name = optionalString(record, kind);
        if (name !== undefined) return { kind, id: nextId(kind), name };
      }

      const gateway = optionalString(record, 'gateway');
      if (gateway !== undefined) {
        const branches: Step['branches'] = [];
        const yes = optionalArray(record['yes'] ?? record['si'], `${field}[].yes`);
        const no = optionalArray(record['no'], `${field}[].no`);
        if (yes.length === 0 && no.length === 0) {
          fail(`la compuerta "${gateway}" no tiene ramas`, 'declara al menos `yes:` o `no:` con sus pasos');
        }
        if (yes.length > 0) {
          branches.push({ label: optionalString(record, 'yesLabel') ?? 'si', steps: parseSteps(yes, `${field}[].yes`) });
        }
        if (no.length > 0) {
          branches.push({ label: optionalString(record, 'noLabel') ?? 'no', steps: parseSteps(no, `${field}[].no`) });
        }
        return { kind: 'gateway', id: nextId('gw'), name: gateway, branches };
      }

      fail(
        `no se entiende el paso de ${field}`,
        'cada paso es `start:`, `task:`, `gateway:` o `end:`\nejemplo: - task: Revisar solicitud',
      );
    });

  const steps = parseSteps(rawFlow, 'diagram.flow');
  if (steps.length === 0) fail('diagram.flow debe declarar al menos un paso');

  const shapes: Shape[] = [];
  const flows: Flow[] = [];

  /**
   * Coloca una secuencia de pasos en una fila y devuelve el ultimo colocado.
   * Cada compuerta empuja sus ramas a filas inferiores.
   */
  const layout = (
    sequence: readonly Step[],
    startX: number,
    row: number,
    incoming: { shape: Shape; label?: string } | undefined,
  ): { last: Shape | undefined; nextX: number; maxRow: number } => {
    let x = startX;
    let previous = incoming;
    let last: Shape | undefined;
    let maxRow = row;
    const y = ORIGIN_Y + row * ROW_HEIGHT;

    for (const step of sequence) {
      const size = sizeOf(step.kind);
      const shape: Shape = {
        id: step.id,
        kind: step.kind,
        name: step.name,
        x,
        // Las figuras se centran respecto a la altura de la tarea.
        y: y + (TASK_HEIGHT - size.height) / 2,
        width: size.width,
        height: size.height,
      };
      shapes.push(shape);

      if (previous !== undefined) {
        flows.push(connect(nextId('flow'), previous.shape, shape, previous.label));
      }
      previous = { shape };
      last = shape;
      x += size.width + GAP;

      if (step.kind === 'gateway' && step.branches !== undefined) {
        let branchRow = row;
        let widest = x;
        step.branches.forEach((branch, index) => {
          // La primera rama continua en la fila actual; el resto baja una fila.
          const targetRow = index === 0 ? row : (branchRow += 1);
          const result = layout(branch.steps, x, targetRow, { shape, label: branch.label });
          widest = Math.max(widest, result.nextX);
          maxRow = Math.max(maxRow, result.maxRow);
          if (index === 0) {
            previous = result.last !== undefined ? { shape: result.last } : previous;
            last = result.last ?? last;
          }
        });
        x = widest;
        // Tras una compuerta, la secuencia principal ya la continuo la rama 0.
        return { last, nextX: x, maxRow };
      }
    }

    return { last, nextX: x, maxRow };
  };

  layout(steps, ORIGIN_X, 0, undefined);

  return buildXml(shapes, flows);
}

function sizeOf(kind: StepKind): { width: number; height: number } {
  switch (kind) {
    case 'start':
      return { width: START_SIZE, height: START_SIZE };
    case 'end':
      return { width: END_SIZE, height: END_SIZE };
    case 'gateway':
      return { width: GATEWAY_SIZE, height: GATEWAY_SIZE };
    default:
      return { width: TASK_WIDTH, height: TASK_HEIGHT };
  }
}

/**
 * Traza la flecha entre dos figuras.
 *
 * En la misma fila basta una recta; si la figura destino esta mas abajo, se
 * baja en vertical desde el centro del origen y luego se avanza en horizontal,
 * que es como se dibujan las ramas de una compuerta.
 */
function connect(id: string, from: Shape, to: Shape, label?: string): Flow {
  const fromCx = from.x + from.width;
  const fromCy = from.y + from.height / 2;
  const toCy = to.y + to.height / 2;

  const flow: Flow = { id, from: from.id, to: to.id, waypoints: [] };
  if (label !== undefined) flow.label = label;

  if (Math.abs(fromCy - toCy) < 1) {
    flow.waypoints = [
      [fromCx, fromCy],
      [to.x, toCy],
    ];
    return flow;
  }

  const cx = from.x + from.width / 2;
  flow.waypoints = [
    [cx, from.y + from.height],
    [cx, toCy],
    [to.x, toCy],
  ];
  return flow;
}

function buildXml(shapes: readonly Shape[], flows: readonly Flow[]): string {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const flow of flows) {
    (outgoing.get(flow.from) ?? outgoing.set(flow.from, []).get(flow.from)!).push(flow.id);
    (incoming.get(flow.to) ?? incoming.set(flow.to, []).get(flow.to)!).push(flow.id);
  }

  const element = (shape: Shape): string => {
    const tag =
      shape.kind === 'start'
        ? 'bpmn:startEvent'
        : shape.kind === 'end'
          ? 'bpmn:endEvent'
          : shape.kind === 'gateway'
            ? 'bpmn:exclusiveGateway'
            : 'bpmn:task';
    const refs = [
      ...(incoming.get(shape.id) ?? []).map((f) => `<bpmn:incoming>${f}</bpmn:incoming>`),
      ...(outgoing.get(shape.id) ?? []).map((f) => `<bpmn:outgoing>${f}</bpmn:outgoing>`),
    ].join('');
    return `    <${tag} id="${shape.id}" name="${xml(shape.name)}">${refs}</${tag}>`;
  };

  const sequenceFlow = (flow: Flow): string =>
    `    <bpmn:sequenceFlow id="${flow.id}" sourceRef="${flow.from}" targetRef="${flow.to}"${
      flow.label !== undefined ? ` name="${xml(flow.label)}"` : ''
    }/>`;

  const shapeDi = (shape: Shape): string =>
    `      <bpmndi:BPMNShape id="${shape.id}_di" bpmnElement="${shape.id}"${
      shape.kind === 'gateway' ? ' isMarkerVisible="true"' : ''
    }><dc:Bounds x="${round(shape.x)}" y="${round(shape.y)}" width="${shape.width}" height="${shape.height}"/></bpmndi:BPMNShape>`;

  const edgeDi = (flow: Flow): string =>
    `      <bpmndi:BPMNEdge id="${flow.id}_di" bpmnElement="${flow.id}">${flow.waypoints
      .map(([x, y]) => `<di:waypoint x="${round(x)}" y="${round(y)}"/>`)
      .join('')}</bpmndi:BPMNEdge>`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
    '  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
    '  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
    '  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
    '  id="docviz" targetNamespace="http://docviz">',
    '  <bpmn:process id="proceso" isExecutable="false">',
    ...shapes.map(element),
    ...flows.map(sequenceFlow),
    '  </bpmn:process>',
    '  <bpmndi:BPMNDiagram id="diagrama">',
    '    <bpmndi:BPMNPlane id="plano" bpmnElement="proceso">',
    ...shapes.map(shapeDi),
    ...flows.map(edgeDi),
    '    </bpmndi:BPMNPlane>',
    '  </bpmndi:BPMNDiagram>',
    '</bpmn:definitions>',
  ].join('\n');
}

function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function round(value: number): number {
  return Math.round(value);
}

// --------------------------------------------------------------------------

/** Arte ASCII: el motor lo consume tal cual, solo se valida que exista. */
export function asciiArt(doc: Record<string, unknown>): string {
  const art = doc['art'] ?? doc['arte'] ?? doc['source'];
  if (typeof art !== 'string' || art.trim() === '') {
    fail(
      'diagram.art debe contener el dibujo en caracteres',
      'usa un bloque literal de YAML:\nart: |\n  .-----.\n  | Uno |\n  \'-----\'',
    );
  }
  // Se conserva la indentacion interna: en arte ASCII, cada espacio cuenta.
  return art.replace(/\s+$/, '');
}