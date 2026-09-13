/**
 * Catalogo de tipos del DSL.
 *
 * Es la fuente unica de verdad: que motor atiende cada intencion, con que
 * alternativa si ese motor no esta disponible, para que sirve y cuando NO
 * conviene usarlo.
 *
 * Los tres ultimos campos no son documentacion decorativa. El consumidor
 * habitual del catalogo es un modelo de lenguaje decidiendo como explicar algo:
 * "cuando no usarlo" evita la mitad de los errores, y un esqueleto minimo evita
 * la otra mitad.
 */

import { CATALOG_EN } from './catalog.en.js';

export type DslLang = 'diagram' | 'chart' | 'architecture';

export interface TypeSpec {
  /** Nombre canonico del tipo. */
  readonly type: string;
  /** Valla en la que se declara. */
  readonly lang: DslLang;
  /** Motor preferido. */
  readonly engine: string;
  /**
   * Motores alternativos, en orden de preferencia.
   *
   * Permiten compilar en una maquina sin navegador o sin Java: el tipo se
   * resuelve con el siguiente motor disponible en lugar de abortar el build.
   * Un tipo sin alternativas depende de su motor.
   */
  readonly fallbacks?: readonly string[];
  /** Sinonimos aceptados en `type`. */
  readonly aliases?: readonly string[];
  /** Que muestra el diagrama, en una linea. */
  readonly purpose: string;
  /** Situacion en la que es la eleccion correcta. */
  readonly whenToUse: string;
  /** Situacion en la que conviene otro tipo, u ninguno. */
  readonly whenNotToUse: string;
  /**
   * La misma ficha en ingles.
   *
   * No es cortesia: la puntuacion de `docviz suggest` mide la peticion contra
   * la prosa del catalogo, y con la prosa solo en español una peticion en
   * ingles se quedaba sin esa señal. Medido sobre el banco de casos, el hueco
   * entre idiomas era de siete puntos.
   */
  readonly en?: {
    readonly purpose: string;
    readonly whenToUse: string;
    readonly whenNotToUse: string;
  };
  /** Esqueleto minimo que compila tal cual. */
  readonly example: string;
  /** Palabras clave para la busqueda de `docviz_suggest`. */
  readonly keywords: readonly string[];
}

const t = (spec: TypeSpec): TypeSpec => spec;

// --------------------------------------------------------------------------
// diagram — UML y comportamiento (PlantUML)
// --------------------------------------------------------------------------

const UML: readonly TypeSpec[] = [
  t({
    type: 'sequence',
    lang: 'diagram',
    engine: 'plantuml',
    fallbacks: ['d2'],
    aliases: ['uml-sequence'],
    purpose: 'Quien habla con quien y en que orden.',
    whenToUse: 'Para explicar una interaccion entre componentes a lo largo del tiempo: un login, un pago, una llamada entre servicios.',
    whenNotToUse: 'Si el orden temporal no importa; entonces es un diagrama de componentes o de dependencias.',
    keywords: ['interaccion', 'interactuan', 'mensajes', 'llamadas', 'protocolo', 'login', 'api', 'temporal', 'orden', 'frontend', 'backend', 'servicio', 'interaction', 'messages', 'calls', 'protocol', 'login', 'api', 'over time', 'order', 'who calls whom', 'request flow'],
    example: [
      'type: sequence',
      'title: Autenticacion',
      'participants:',
      '  - Usuario',
      '  - API',
      'flow:',
      '  - Usuario -> API: Login',
      '  - API --> Usuario: Token',
    ].join('\n'),
  }),
  t({
    type: 'class',
    lang: 'diagram',
    engine: 'plantuml',
    fallbacks: ['d2'],
    aliases: ['uml-class'],
    purpose: 'Estructura de clases o entidades y sus relaciones.',
    whenToUse: 'Para el modelo de dominio de un sistema orientado a objetos, con atributos, metodos y herencia.',
    whenNotToUse: 'Si lo que describes son tablas y claves foraneas: usa `erd`.',
    keywords: ['clases', 'dominio', 'herencia', 'objetos', 'modelo', 'atributos', 'metodos', 'classes', 'domain', 'inheritance', 'objects', 'attributes', 'methods', 'oop'],
    example: [
      'type: class',
      'title: Modelo de dominio',
      'classes:',
      '  - name: Pedido',
      '    attributes: [id, total]',
      '    methods: [confirmar]',
      '  - name: Linea',
      'relations:',
      '  - from: Pedido',
      '    to: Linea',
      '    type: composition',
    ].join('\n'),
  }),
  t({
    type: 'state',
    lang: 'diagram',
    engine: 'plantuml',
    fallbacks: ['d2'],
    aliases: ['uml-state'],
    purpose: 'Estados de una entidad y las transiciones entre ellos.',
    whenToUse: 'Cuando algo tiene un ciclo de vida: un pedido, una solicitud, un despliegue.',
    whenNotToUse: 'Si el proceso es una secuencia de tareas sin estados propios: usa `activity` o `flow`.',
    keywords: ['estados', 'ciclo de vida', 'transiciones', 'maquina de estados', 'flujo de estado', 'states', 'lifecycle', 'transitions', 'state machine', 'status changes'],
    example: [
      'type: state',
      'title: Ciclo de vida',
      'states: [Borrador, Publicado]',
      'initial: Borrador',
      'transitions:',
      '  - Borrador -> Publicado: publicar',
      'finals: [Publicado]',
    ].join('\n'),
  }),
  t({
    type: 'activity',
    lang: 'diagram',
    engine: 'plantuml',
    aliases: ['uml-activity'],
    purpose: 'Proceso con decisiones y ramas paralelas.',
    whenToUse: 'Cuando hay condiciones que bifurcan el camino: validaciones, aprobaciones, reintentos.',
    whenNotToUse: 'Si el proceso es lineal y sencillo: `flow` queda mas limpio. Si es un proceso de negocio con roles: `bpmn`.',
    keywords: ['proceso', 'decision', 'condicion', 'if', 'bifurcacion', 'paralelo', 'algoritmo', 'process', 'decisions', 'branches', 'parallel', 'swimlane', 'approval', 'workflow'],
    example: [
      'type: activity',
      'title: Validacion',
      'flow:',
      '  - Recibir solicitud',
      '  - decision: Es valida?',
      '    yes:',
      '      - Procesar',
      '    no:',
      '      - Rechazar',
    ].join('\n'),
  }),
  t({
    type: 'erd',
    lang: 'diagram',
    engine: 'plantuml',
    fallbacks: ['mermaid'],
    aliases: ['entity-relationship', 'entidad-relacion'],
    purpose: 'Entidades de datos, sus campos y su cardinalidad.',
    whenToUse: 'Para documentar un modelo de datos relacional: tablas, claves y cardinalidades.',
    whenNotToUse: 'Si el foco es el comportamiento y no los datos: usa `class`.',
    keywords: ['datos', 'tablas', 'entidades', 'base de datos', 'cardinalidad', 'clave', 'sql', 'modelo de datos', 'entities', 'database', 'tables', 'fields', 'cardinality', 'data model', 'relational'],
    example: [
      'type: erd',
      'title: Modelo de datos',
      'entities:',
      '  - name: Pedido',
      '    fields:',
      '      - name: id',
      '        type: uuid',
      '        key: true',
      '      - name: total',
      '        type: decimal',
      '  - name: Linea',
      '    fields:',
      '      - name: id',
      '        type: uuid',
      '        key: true',
      'relations:',
      '  - from: Pedido',
      '    to: Linea',
      '    cardinality: one-to-many',
      '    label: contiene',
    ].join('\n'),
  }),
  t({
    type: 'use-case',
    lang: 'diagram',
    engine: 'plantuml',
    fallbacks: ['d2'],
    aliases: ['casos-de-uso'],
    purpose: 'Que puede hacer cada actor con el sistema.',
    whenToUse: 'Para delimitar el alcance funcional frente a usuarios y sistemas externos.',
    whenNotToUse: 'Si necesitas detallar como ocurre cada caso: eso es `sequence` o `activity`.',
    keywords: ['casos de uso', 'actores', 'alcance', 'funcionalidad', 'requisitos', 'actors', 'roles', 'what each user can do', 'capabilities', 'use cases'],
    example: [
      'type: use-case',
      'title: Alcance del portal',
      'system: Portal de pagos',
      'actors:',
      '  - Cliente',
      '  - Operador',
      'useCases:',
      '  - name: Realizar pago',
      '    actors: [Cliente]',
      '  - name: Conciliar',
      '    actors: [Operador]',
    ].join('\n'),
  }),
  t({
    type: 'component',
    lang: 'diagram',
    engine: 'plantuml',
    fallbacks: ['d2'],
    aliases: ['componentes'],
    purpose: 'Componentes de software agrupados y como se conectan.',
    whenToUse: 'Para la estructura interna de una aplicacion cuando C4 resulta excesivo.',
    whenNotToUse: 'Si describes el sistema completo y su entorno: usa `c4-context` o `c4-container`.',
    keywords: ['componentes', 'modulos', 'paquetes', 'estructura', 'interfaces', 'software components', 'modules', 'internal structure', 'wiring', 'packages'],
    example: [
      'type: component',
      'title: Componentes',
      'groups:',
      '  - name: Frontend',
      '    components: [UI]',
      '  - name: Backend',
      '    components: [API, Servicio]',
      'relations:',
      '  - UI -> API',
      '  - API -> Servicio',
    ].join('\n'),
  }),
  t({
    type: 'deployment',
    lang: 'diagram',
    engine: 'plantuml',
    fallbacks: ['d2'],
    aliases: ['despliegue'],
    purpose: 'Donde se ejecuta cada pieza y sobre que infraestructura.',
    whenToUse: 'Para documentar nodos, contenedores, artefactos y las bases de datos de un entorno.',
    whenNotToUse: 'Si el interes es la responsabilidad logica y no la maquina: usa `component` o C4.',
    keywords: ['despliegue', 'infraestructura', 'servidores', 'nodos', 'entorno', 'produccion', 'contenedores', 'infrastructure', 'servers', 'nodes', 'runtime', 'where it runs', 'topology'],
    example: [
      'type: deployment',
      'title: Entorno de produccion',
      'nodes:',
      '  - name: Servidor web',
      '    kind: node',
      '    contains: [app.jar]',
      '  - name: PostgreSQL',
      '    kind: database',
      'relations:',
      '  - Servidor web -> PostgreSQL: JDBC',
    ].join('\n'),
  }),
  t({
    type: 'wireframe',
    lang: 'diagram',
    engine: 'plantuml',
    aliases: ['mockup', 'ui'],
    purpose: 'Boceto de una pantalla: campos, botones y disposicion.',
    whenToUse: 'Para acordar una interfaz sin abrir una herramienta de diseno, dentro del propio documento.',
    whenNotToUse: 'Si necesitas fidelidad visual real; esto es un boceto, no un diseno.',
    keywords: ['pantalla', 'formulario', 'interfaz', 'mockup', 'boceto', 'ui', 'campos', 'boton', 'screen', 'mockup', 'ui sketch', 'form', 'buttons', 'layout'],
    example: [
      'type: wireframe',
      'title: Inicio de sesion',
      'rows:',
      '  - fields:',
      '      - label: Usuario',
      '        input: text',
      '  - fields:',
      '      - label: Clave',
      '        input: password',
      '  - buttons: [Cancelar, Entrar]',
    ].join('\n'),
  }),
  t({
    type: 'json',
    lang: 'diagram',
    engine: 'plantuml',
    purpose: 'Estructura de un JSON dibujada como arbol.',
    whenToUse: 'Para documentar el cuerpo de una peticion o respuesta de API de un vistazo.',
    whenNotToUse: 'Si el JSON es corto: un bloque de codigo se lee mejor y se puede copiar.',
    keywords: ['json', 'payload', 'respuesta', 'peticion', 'estructura', 'contrato', 'cuerpo', 'json structure', 'payload', 'response shape', 'tree of json'],
    example: ['type: json', 'title: Respuesta de /pedidos', 'data:', '  id: 1', '  estado: confirmado'].join('\n'),
  }),
  t({
    type: 'yaml',
    lang: 'diagram',
    engine: 'plantuml',
    purpose: 'Estructura de un YAML dibujada como arbol.',
    whenToUse: 'Para explicar un manifiesto o una configuracion extensa por su forma.',
    whenNotToUse: 'Si el archivo es corto o el lector va a copiarlo: usa un bloque de codigo.',
    keywords: ['yaml', 'configuracion', 'manifiesto', 'kubernetes', 'helm', 'valores', 'yaml structure', 'config tree', 'manifest'],
    example: ['type: yaml', 'title: Configuracion', 'data:', '  replicas: 3', '  puertos:', '    - 8080'].join('\n'),
  }),
  t({
    type: 'wbs',
    lang: 'diagram',
    engine: 'plantuml',
    fallbacks: ['d2'],
    aliases: ['work-breakdown'],
    purpose: 'Descomposicion jerarquica del trabajo de un proyecto.',
    whenToUse: 'Para desglosar un alcance en entregables y paquetes de trabajo.',
    whenNotToUse: 'Si lo que importa son las fechas: usa `gantt`. Si es un analisis causal: `issue-tree`.',
    keywords: ['wbs', 'edt', 'alcance', 'entregables', 'descomposicion', 'proyecto', 'paquetes', 'work breakdown', 'project decomposition', 'tasks', 'deliverables'],
    example: [
      'type: wbs',
      'title: Alcance del proyecto',
      'root: Portal de pagos',
      'branches:',
      '  - name: Analisis',
      '    children: [Requisitos, Casos de prueba]',
      '  - name: Construccion',
    ].join('\n'),
  }),
];

// --------------------------------------------------------------------------
// diagram — flujos, tiempo y producto (Mermaid)
// --------------------------------------------------------------------------

const FLOW_AND_PRODUCT: readonly TypeSpec[] = [
  t({
    type: 'flow',
    lang: 'diagram',
    engine: 'mermaid',
    fallbacks: ['d2'],
    aliases: ['flowchart'],
    purpose: 'Flujo sencillo de extremo a extremo.',
    whenToUse: 'Para encadenar pasos o componentes cuando basta con ver por donde pasa la cosa.',
    whenNotToUse: 'Si hay muchas condiciones: `activity`. Si es una interaccion temporal: `sequence`.',
    keywords: ['flujo', 'pasos', 'pipeline', 'proceso simple', 'cadena', 'etapas', 'flowchart', 'end to end', 'steps', 'simple process', 'pipeline'],
    example: ['type: flow', 'title: Publicacion', 'direction: lr', 'flow:', '  - Autor -> Revision', '  - Revision -> Portal'].join('\n'),
  }),
  t({
    type: 'gantt',
    lang: 'diagram',
    engine: 'mermaid',
    fallbacks: ['plantuml'],
    aliases: ['cronograma'],
    purpose: 'Tareas situadas en el calendario.',
    whenToUse: 'Para un plan con fechas y dependencias entre tareas.',
    whenNotToUse: 'Si no hay fechas concretas: usa `roadmap` o `timeline`.',
    keywords: ['cronograma', 'plan', 'fechas', 'calendario', 'tareas', 'hitos', 'planificacion', 'schedule', 'calendar', 'dates', 'timeline of tasks', 'project plan'],
    example: [
      'type: gantt',
      'title: Plan',
      'sections:',
      '  - name: Fase 1',
      '    tasks:',
      '      - name: Analisis',
      '        start: 2026-01-05',
      '        duration: 5d',
    ].join('\n'),
  }),
  t({
    type: 'journey',
    lang: 'diagram',
    engine: 'mermaid',
    aliases: ['user-journey', 'recorrido'],
    purpose: 'Recorrido de una persona por un proceso, con su nivel de satisfaccion.',
    whenToUse: 'Para mostrar donde sufre el usuario y quien interviene en cada paso.',
    whenNotToUse: 'Si el interes es tecnico y no la experiencia: usa `flow` o `sequence`.',
    keywords: ['experiencia', 'usuario', 'recorrido', 'satisfaccion', 'ux', 'viaje', 'cliente', 'customer journey', 'user journey', 'satisfaction', 'experience', 'touchpoints'],
    example: [
      'type: journey',
      'title: Alta de cliente',
      'sections:',
      '  - name: Registro',
      '    steps:',
      '      - name: Rellenar formulario',
      '        score: 3',
      '        actors: [Cliente]',
      '      - name: Verificar correo',
      '        score: 2',
      '        actors: [Cliente]',
      '  - name: Activacion',
      '    steps:',
      '      - name: Aprobar cuenta',
      '        score: 4',
      '        actors: [Operador]',
      '      - name: Primer acceso',
      '        score: 5',
      '        actors: [Cliente]',
    ].join('\n'),
  }),
  t({
    type: 'git-graph',
    lang: 'diagram',
    engine: 'mermaid',
    aliases: ['gitgraph', 'commit-graph', 'ramas'],
    purpose: 'Historia de ramas, commits y fusiones.',
    whenToUse: 'Para explicar la estrategia de ramificacion del equipo.',
    whenNotToUse: 'Si lo que documentas es el proceso de revision, no la topologia: usa `flow`.',
    keywords: ['git', 'ramas', 'branch', 'merge', 'commits', 'gitflow', 'versionado', 'branches', 'commits', 'merges', 'git history', 'release branches'],
    example: [
      'type: git-graph',
      'title: Estrategia de ramas',
      'commits:',
      '  - commit: inicial',
      '  - branch: develop',
      '  - commit: funcionalidad',
      '  - checkout: main',
      '  - merge: develop',
    ].join('\n'),
  }),
  t({
    type: 'kanban',
    lang: 'diagram',
    engine: 'mermaid',
    aliases: ['tablero'],
    purpose: 'Tarjetas repartidas por columna de estado.',
    whenToUse: 'Para fotografiar el estado de un tablero en un informe.',
    whenNotToUse: 'Si el tablero cambia a diario: enlaza la herramienta en vez de congelarlo.',
    keywords: ['tablero', 'kanban', 'columnas', 'sprint', 'estado', 'tarjetas', 'board', 'board', 'columns', 'cards', 'work in progress', 'backlog'],
    example: [
      'type: kanban',
      'title: Sprint 12',
      'columns:',
      '  - name: Pendiente',
      '    items: [Analisis de HU-14]',
      '  - name: En curso',
      '    items: [Diseno de API]',
    ].join('\n'),
  }),
  t({
    type: 'quadrant',
    lang: 'diagram',
    engine: 'mermaid',
    aliases: ['quadrant-chart'],
    purpose: 'Elementos situados en dos ejes continuos.',
    whenToUse: 'Para priorizar con datos: cada elemento tiene una posicion concreta, no solo un cuadrante.',
    whenNotToUse: 'Si solo quieres nombrar los cuatro cuadrantes sin situar nada: usa `matrix-2x2`.',
    keywords: ['priorizacion', 'esfuerzo', 'impacto', 'cuadrantes', 'matriz', 'valor', 'riesgo', 'two axes', 'effort impact', 'prioritization', 'positioning', 'scatter of options'],
    example: [
      'type: quadrant',
      'title: Priorizacion',
      'xAxis: [Bajo esfuerzo, Alto esfuerzo]',
      'yAxis: [Bajo impacto, Alto impacto]',
      'quadrants: [Hacer ya, Planificar, Descartar, Delegar]',
      'items:',
      '  - name: Automatizar pruebas',
      '    x: 0.3',
      '    y: 0.8',
    ].join('\n'),
  }),
  t({
    type: 'sankey',
    lang: 'diagram',
    engine: 'mermaid',
    purpose: 'Como se reparte una cantidad al pasar de un estado a otro.',
    whenToUse: 'Para mostrar volumenes que se dividen: origen de los defectos, embudo de conversion con fugas.',
    whenNotToUse: 'Si solo comparas totales sin flujo entre ellos: usa `bar`.',
    keywords: ['flujo', 'volumen', 'reparto', 'origen', 'destino', 'sankey', 'derivacion', 'flow of quantity', 'allocation', 'how budget splits', 'energy flow', 'transfers'],
    example: [
      'type: sankey',
      'title: Origen de los defectos',
      'flows:',
      '  - from: Requisitos',
      '    to: Produccion',
      '    value: 12',
      '  - from: Codigo',
      '    to: Produccion',
      '    value: 30',
    ].join('\n'),
  }),
  t({
    type: 'treemap',
    lang: 'diagram',
    engine: 'mermaid',
    purpose: 'Composicion de un total por area proporcional.',
    whenToUse: 'Para ver de un vistazo quien pesa mas dentro de un conjunto jerarquico.',
    whenNotToUse: 'Si comparas pocas categorias sin jerarquia: `bar` es mas preciso de leer.',
    keywords: ['composicion', 'proporcion', 'peso', 'reparto', 'jerarquia', 'tamano', 'esfuerzo', 'proportional area', 'composition by area', 'nested rectangles', 'share of total'],
    example: [
      'type: treemap',
      'title: Esfuerzo por modulo',
      'groups:',
      '  - name: Backend',
      '    items:',
      '      - name: API',
      '        value: 40',
      '      - name: Batch',
      '        value: 20',
    ].join('\n'),
  }),
  t({
    type: 'radar',
    lang: 'diagram',
    engine: 'mermaid',
    aliases: ['spider', 'madurez'],
    purpose: 'Perfil de varias dimensiones a la vez.',
    whenToUse: 'Para evaluaciones de madurez o capacidad, y para comparar dos perfiles.',
    whenNotToUse: 'Con mas de siete ejes o si las dimensiones no son comparables entre si.',
    keywords: ['madurez', 'capacidad', 'evaluacion', 'perfil', 'dimensiones', 'radar', 'assessment', 'spider', 'multiple dimensions', 'profile', 'skills', 'competency'],
    example: [
      'type: radar',
      'title: Madurez del equipo',
      'axes: [Proceso, Calidad, Arquitectura, Automatizacion]',
      'max: 5',
      'series:',
      '  - name: Actual',
      '    values: [3, 4, 2, 3]',
    ].join('\n'),
  }),
  t({
    type: 'mindmap',
    lang: 'diagram',
    engine: 'mermaid',
    fallbacks: ['plantuml'],
    aliases: ['mapa-mental'],
    purpose: 'Exploracion de un tema en ramas libres.',
    whenToUse: 'Para abrir un alcance o recoger ideas antes de estructurarlas.',
    whenNotToUse: 'Si la jerarquia ya es firme y dirigida: `strategy-tree` comunica mejor la intencion.',
    keywords: ['ideas', 'lluvia', 'alcance', 'exploracion', 'mapa mental', 'brainstorm', 'brainstorm', 'ideas', 'free branches', 'exploration', 'notes'],
    example: [
      'type: mindmap',
      'title: Alcance',
      'root: Plataforma',
      'branches:',
      '  - name: Pagos',
      '    children: [Tarjeta, Transferencia]',
      '  - Reportes',
    ].join('\n'),
  }),
  t({
    type: 'block',
    lang: 'diagram',
    engine: 'mermaid',
    aliases: ['bloques'],
    purpose: 'Bloques dispuestos en rejilla, sin semantica de flujo.',
    whenToUse: 'Para capas, bandas o una vista esquematica donde la posicion importa mas que las flechas.',
    whenNotToUse: 'Si hay relaciones que explicar: usa `flow` o `component`.',
    keywords: ['bloques', 'capas', 'rejilla', 'esquema', 'stack', 'disposicion', 'grid', 'blocks', 'layout without flow', 'arrangement'],
    example: [
      'type: block',
      'title: Capas',
      'rows:',
      '  - [Presentacion]',
      '  - [Aplicacion, Dominio]',
      '  - [Infraestructura]',
    ].join('\n'),
  }),
];

// --------------------------------------------------------------------------
// diagram — ejecutivos (D2) y dependencias (Graphviz)
// --------------------------------------------------------------------------

const EXECUTIVE: readonly TypeSpec[] = [
  t({
    type: 'strategy-tree',
    lang: 'diagram',
    engine: 'd2',
    purpose: 'Descomposicion de un objetivo en lineas de accion.',
    whenToUse: 'Para bajar un objetivo a iniciativas concretas ante direccion.',
    whenNotToUse: 'Si exploras causas de un problema: `issue-tree` nombra mejor la intencion.',
    keywords: ['estrategia', 'objetivo', 'iniciativas', 'descomposicion', 'plan', 'lineas de accion', 'objective breakdown', 'goals', 'initiatives', 'okr', 'strategy'],
    example: [
      'type: strategy-tree',
      'title: Estrategia de calidad',
      'root: Reducir defectos',
      'branches:',
      '  - name: Automatizacion',
      '    children: [Pruebas de regresion]',
      '  - Proceso',
    ].join('\n'),
  }),
  t({
    type: 'issue-tree',
    lang: 'diagram',
    engine: 'd2',
    purpose: 'Descomposicion de un problema en sus causas.',
    whenToUse: 'Para analisis de causa raiz o para estructurar un diagnostico.',
    whenNotToUse: 'Si ya sabes que hacer y solo quieres presentarlo: `strategy-tree`.',
    keywords: ['causa raiz', 'problema', 'analisis', 'diagnostico', 'porque', 'causas', 'root cause', 'problem breakdown', 'why', 'causes', 'mece'],
    example: ['type: issue-tree', 'title: Analisis', 'root: Defectos en produccion', 'branches: [Requisitos, Pruebas]'].join('\n'),
  }),
  t({
    type: 'decision-tree',
    lang: 'diagram',
    engine: 'd2',
    purpose: 'Alternativas de una decision y sus ramas.',
    whenToUse: 'Para presentar opciones excluyentes y a que lleva cada una.',
    whenNotToUse: 'Si la decision ocurre dentro de un proceso: usa `activity`.',
    keywords: ['decision', 'alternativas', 'opciones', 'escenarios', 'eleccion', 'options', 'alternatives', 'decision branches', 'choices'],
    example: ['type: decision-tree', 'title: Decision', 'root: Comprar o construir', 'branches: [Comprar, Construir]'].join('\n'),
  }),
  t({
    type: 'strategy-pillars',
    lang: 'diagram',
    engine: 'd2',
    purpose: 'Pilares que sostienen un objetivo, con su contenido.',
    whenToUse: 'Para una lamina de direccion con tres o cuatro ejes y sus iniciativas.',
    whenNotToUse: 'Si la jerarquia tiene mas de dos niveles: usa `strategy-tree`.',
    keywords: ['pilares', 'ejes', 'estrategia', 'direccion', 'lamina', 'pillars', 'foundations', 'supporting themes'],
    example: [
      'type: strategy-pillars',
      'title: Plan anual',
      'root: Excelencia tecnica',
      'pillars:',
      '  - name: Personas',
      '    children: [Formacion]',
      '  - Procesos',
    ].join('\n'),
  }),
  t({
    type: 'capability-map',
    lang: 'diagram',
    engine: 'd2',
    purpose: 'Capacidades agrupadas por dominio.',
    whenToUse: 'Para mostrar que sabe hacer una organizacion o un producto, sin hablar de tecnologia.',
    whenNotToUse: 'Si describes componentes de software: usa `component` o C4.',
    keywords: ['capacidades', 'dominios', 'organizacion', 'mapa', 'negocio', 'funciones', 'business capabilities', 'domains', 'capability model'],
    example: [
      'type: capability-map',
      'title: Capacidades',
      'domains:',
      '  - name: Calidad',
      '    capabilities: [Pruebas, Gestion de defectos]',
    ].join('\n'),
  }),
  t({
    type: 'operating-model',
    lang: 'diagram',
    engine: 'd2',
    purpose: 'Capas de un modelo operativo, de negocio a infraestructura.',
    whenToUse: 'Para relacionar niveles: negocio, procesos, aplicaciones, tecnologia.',
    whenNotToUse: 'Si solo hay una capa con elementos sueltos: usa `capability-map`.',
    keywords: ['modelo operativo', 'capas', 'niveles', 'gobierno', 'operacion', 'layers', 'business to infrastructure', 'operating layers', 'stack of the organization'],
    example: [
      'type: operating-model',
      'title: Modelo operativo',
      'layers:',
      '  - name: Negocio',
      '    items: [Ventas]',
      '  - name: Tecnologia',
      '    items: [Plataforma]',
    ].join('\n'),
  }),
  t({
    type: 'value-chain',
    lang: 'diagram',
    engine: 'd2',
    purpose: 'Etapas encadenadas que generan valor.',
    whenToUse: 'Para el recorrido de una actividad de principio a fin, en pasos amplios.',
    whenNotToUse: 'Si hay condiciones o vueltas atras: usa `flow` o `activity`.',
    keywords: ['cadena de valor', 'etapas', 'proceso de negocio', 'extremo a extremo', 'value chain', 'stages', 'end to end value', 'porter'],
    example: ['type: value-chain', 'title: Cadena de valor', 'stages: [Captar, Vender, Entregar, Soportar]'].join('\n'),
  }),
  t({
    type: 'before-after',
    lang: 'diagram',
    engine: 'd2',
    aliases: ['antes-despues'],
    purpose: 'Comparacion de dos escenarios.',
    whenToUse: 'Para justificar un cambio mostrando la situacion actual frente a la propuesta.',
    whenNotToUse: 'Si la comparacion es numerica: usa `bar` o `slope`.',
    keywords: ['antes', 'despues', 'comparacion', 'cambio', 'propuesta', 'situacion actual', 'before and after', 'comparison of two scenarios', 'current vs future', 'as is to be'],
    example: ['type: before-after', 'title: Cambio propuesto', 'before: [Despliegue manual]', 'after: [Pipeline automatico]'].join('\n'),
  }),
  t({
    type: 'matrix-2x2',
    lang: 'diagram',
    engine: 'd2',
    purpose: 'Cuatro cuadrantes con su contenido, sin coordenadas.',
    whenToUse: 'Para clasificar en cuatro grupos cualitativos.',
    whenNotToUse: 'Si cada elemento tiene una posicion medida: usa `quadrant`.',
    keywords: ['matriz', 'cuadrantes', 'clasificacion', 'dos ejes', 'four quadrants', '2x2', 'matrix', 'without coordinates'],
    example: [
      'type: matrix-2x2',
      'title: Clasificacion',
      'axes:',
      '  x: Esfuerzo',
      '  y: Impacto',
      'quadrants: [Ganar rapido, Estrategico, Descartar, Revisar]',
    ].join('\n'),
  }),
  t({
    type: 'timeline',
    lang: 'diagram',
    engine: 'd2',
    fallbacks: ['mermaid'],
    aliases: ['linea-de-tiempo'],
    purpose: 'Hitos en orden cronologico.',
    whenToUse: 'Para una historia o una sucesion de hitos sin duraciones.',
    whenNotToUse: 'Si hay fechas de inicio y fin por tarea: usa `gantt`.',
    keywords: ['cronologia', 'hitos', 'historia', 'evolucion', 'linea de tiempo', 'milestones', 'chronological', 'history', 'key dates'],
    example: [
      'type: timeline',
      'title: Evolucion',
      'phases:',
      '  - name: 2025',
      '    items: [Piloto]',
      '  - name: 2026',
      '    items: [Despliegue]',
    ].join('\n'),
  }),
  t({
    type: 'roadmap',
    lang: 'diagram',
    engine: 'd2',
    aliases: ['hoja-de-ruta'],
    purpose: 'Fases futuras con su contenido.',
    whenToUse: 'Para comunicar el plan por trimestres o fases sin comprometer fechas exactas.',
    whenNotToUse: 'Si hay compromisos de fecha: usa `gantt`.',
    keywords: ['hoja de ruta', 'roadmap', 'fases', 'trimestres', 'plan', 'futuro', 'phases', 'upcoming', 'plan by phase', 'releases'],
    example: [
      'type: roadmap',
      'title: Hoja de ruta',
      'phases:',
      '  - name: Q1',
      '    items: [Piloto]',
      '  - name: Q2',
      '    items: [Adopcion]',
    ].join('\n'),
  }),
  t({
    type: 'dependency-map',
    lang: 'diagram',
    engine: 'graphviz',
    aliases: ['dependency-graph', 'dependencias'],
    purpose: 'Quien depende de quien.',
    whenToUse: 'Para grafos de dependencia entre modulos, servicios o equipos, incluso con ciclos.',
    whenNotToUse: 'Si el orden temporal importa: usa `sequence`.',
    keywords: ['dependencias', 'acoplamiento', 'grafo', 'modulos', 'servicios', 'impacto', 'dependencies', 'who depends on whom', 'blast radius', 'coupling', 'services graph', 'microservicios', 'microservices', 'que se rompe si cae', 'what breaks if one goes down', 'impacto de una caida'],
    example: ['type: dependency-map', 'title: Dependencias', 'dependencies:', '  - api -> base de datos', '  - web -> api'].join('\n'),
  }),
];

// --------------------------------------------------------------------------
// diagram — proceso de negocio y esquemas libres
// --------------------------------------------------------------------------

const SPECIAL: readonly TypeSpec[] = [
  t({
    type: 'bpmn',
    lang: 'diagram',
    engine: 'bpmn',
    aliases: ['proceso-de-negocio'],
    purpose: 'Proceso de negocio en notacion BPMN estandar.',
    whenToUse: 'Cuando el documento va a manos de negocio o auditoria y la notacion estandar importa.',
    whenNotToUse: 'Para un proceso tecnico interno: `activity` o `flow` son mas breves. Aun no admite carriles por rol.',
    keywords: ['bpmn', 'proceso de negocio', 'carriles', 'roles', 'aprobacion', 'auditoria', 'compuerta', 'business process', 'bpmn notation', 'lanes', 'standard notation'],
    example: [
      'type: bpmn',
      'title: Aprobacion de solicitud',
      'flow:',
      '  - start: Solicitud recibida',
      '  - task: Revisar',
      '  - gateway: Aprobada?',
      '    yes:',
      '      - task: Notificar aprobacion',
      '      - end: Aprobada',
      '    no:',
      '      - end: Rechazada',
    ].join('\n'),
  }),
  t({
    type: 'ascii',
    lang: 'diagram',
    engine: 'svgbob',
    aliases: ['ascii-art', 'sketch'],
    purpose: 'Dibujo hecho con caracteres, convertido a SVG limpio.',
    whenToUse: 'Cuando ya tienes un esquema en arte ASCII —de un RFC, de un README— y quieres publicarlo legible.',
    whenNotToUse: 'Para un diagrama nuevo: cualquier tipo declarativo se mantiene mejor.',
    keywords: ['ascii', 'arte', 'esquema', 'rfc', 'texto', 'boceto', 'goat', 'svgbob', 'ascii art', 'text drawing', 'characters', 'sketch in text'],
    example: [
      'type: ascii',
      'title: Esquema',
      'art: |',
      '  .-------.      .------.',
      '  | Front +----->| API  |',
      "  '-------'      '------'",
    ].join('\n'),
  }),
];

// --------------------------------------------------------------------------
// chart (Vega-Lite)
// --------------------------------------------------------------------------

const CHARTS: readonly TypeSpec[] = [
  t({
    type: 'bar',
    lang: 'chart',
    engine: 'vega-lite',
    aliases: ['column'],
    purpose: 'Comparacion entre categorias.',
    whenToUse: 'Cuando cada barra es una categoria y quieres compararlas.',
    whenNotToUse: 'Si el eje es el tiempo y hay muchos puntos: usa `line`.',
    keywords: ['comparar', 'categorias', 'barras', 'cantidad', 'ranking', 'defectos', 'total', 'compare categories', 'bar chart', 'column chart', 'ranking by value'],
    example: ['type: bar', 'title: Defectos por sprint', 'data:', '  - label: SP1', '    value: 42'].join('\n'),
  }),
  t({
    type: 'horizontal-bar',
    lang: 'chart',
    engine: 'vega-lite',
    purpose: 'Comparacion entre categorias con etiquetas largas.',
    whenToUse: 'Cuando los nombres no caben bajo barras verticales.',
    whenNotToUse: 'Si son pocas categorias con nombres cortos: `bar` ocupa menos.',
    keywords: ['barras horizontales', 'ranking', 'etiquetas largas', 'long labels', 'horizontal bars', 'ranking with names', 'wide category names', 'nombres largos', 'long names', 'names are long'],
    example: ['type: horizontal-bar', 'data:', '  - label: Gestion de defectos', '    value: 12'].join('\n'),
  }),
  t({
    type: 'stacked-bar',
    lang: 'chart',
    engine: 'vega-lite',
    purpose: 'Composicion de un total por categoria.',
    whenToUse: 'Para ver el total y su reparto interno a la vez.',
    whenNotToUse: 'Si quieres comparar las partes entre si: usa `grouped-bar`.',
    keywords: ['apilado', 'composicion', 'total', 'reparto', 'series', 'composition', 'stacked', 'breakdown of total', 'parts of each bar', 'share by category'],
    example: [
      'type: stacked-bar',
      'series:',
      '  - name: Backend',
      '    data:',
      '      - label: SP1',
      '        value: 10',
    ].join('\n'),
  }),
  t({
    type: 'grouped-bar',
    lang: 'chart',
    engine: 'vega-lite',
    purpose: 'Comparacion de varias series por categoria.',
    whenToUse: 'Cuando comparas dos o tres series dentro de cada categoria.',
    whenNotToUse: 'Si el interes es el total: usa `stacked-bar`.',
    keywords: ['agrupado', 'comparar series', 'barras', 'several series', 'side by side', 'grouped columns', 'compare series'],
    example: [
      'type: grouped-bar',
      'series:',
      '  - name: Plan',
      '    data:',
      '      - label: SP1',
      '        value: 10',
    ].join('\n'),
  }),
  t({
    type: 'line',
    lang: 'chart',
    engine: 'vega-lite',
    purpose: 'Evolucion de una magnitud en el tiempo.',
    whenToUse: 'Para tendencias con varios puntos: cobertura por sprint, defectos por mes.',
    whenNotToUse: 'Con dos o tres puntos sin continuidad: usa `bar`.',
    keywords: ['tendencia', 'evolucion', 'tiempo', 'serie', 'historico', 'progreso', 'sprint', 'sprints', 'cobertura', 'mensual', 'trend', 'over time', 'evolution', 'time series', 'monthly'],
    example: ['type: line', 'title: Cobertura', 'data:', '  - label: SP1', '    value: 41'].join('\n'),
  }),
  t({
    type: 'area',
    lang: 'chart',
    engine: 'vega-lite',
    purpose: 'Evolucion con enfasis en el volumen acumulado.',
    whenToUse: 'Cuando importa la magnitud bajo la curva, no solo la forma.',
    whenNotToUse: 'Si comparas varias series que se cruzan: `line` se lee mejor.',
    keywords: ['area', 'volumen', 'acumulado', 'tendencia', 'cumulative volume', 'filled trend', 'area under the curve'],
    example: ['type: area', 'data:', '  - label: Ene', '    value: 10'].join('\n'),
  }),
  t({
    type: 'stacked-area',
    lang: 'chart',
    engine: 'vega-lite',
    purpose: 'Evolucion de la composicion de un total.',
    whenToUse: 'Para ver como cambia el reparto entre series a lo largo del tiempo.',
    whenNotToUse: 'Si las series no suman un total con sentido: usa `line`.',
    keywords: ['area apilada', 'composicion', 'evolucion', 'reparto temporal', 'composition over time', 'stacked trend', 'mix evolution'],
    example: [
      'type: stacked-area',
      'series:',
      '  - name: Backend',
      '    data:',
      '      - label: Ene',
      '        value: 10',
    ].join('\n'),
  }),
  t({
    type: 'scatter',
    lang: 'chart',
    engine: 'vega-lite',
    purpose: 'Relacion entre dos magnitudes.',
    whenToUse: 'Para buscar correlacion: tamano frente a defectos, esfuerzo frente a valor.',
    whenNotToUse: 'Si una de las dos es categorica: usa `bar`.',
    keywords: ['correlacion', 'dispersion', 'relacion', 'nube de puntos', 'dos variables', 'correlation', 'relationship between two', 'points', 'x vs y'],
    example: ['type: scatter', 'data:', '  - x: 120', '    y: 8'].join('\n'),
  }),
  t({
    type: 'heatmap',
    lang: 'chart',
    engine: 'vega-lite',
    aliases: ['mapa-de-calor'],
    purpose: 'Densidad de una magnitud en dos dimensiones categoricas.',
    whenToUse: 'Para cruces: defectos por modulo y por sprint, actividad por dia y hora.',
    whenNotToUse: 'Si una dimension tiene un solo valor: usa `bar`.',
    keywords: ['mapa de calor', 'cruce', 'matriz', 'densidad', 'concentracion', 'density', 'by day and hour', 'intensity', 'matrix of values', 'calendar heat'],
    example: ['type: heatmap', 'data:', '  - x: SP1', '    y: Backend', '    value: 12'].join('\n'),
  }),
  t({
    type: 'histogram',
    lang: 'chart',
    engine: 'vega-lite',
    purpose: 'Distribucion de una variable continua.',
    whenToUse: 'Para ver como se reparten los valores: duracion de las builds, tamano de las HU.',
    whenNotToUse: 'Si los valores ya vienen agrupados en categorias: usa `bar`.',
    keywords: ['distribucion', 'histograma', 'frecuencia', 'reparto', 'rangos', 'distribution', 'how values spread', 'buckets', 'bins', 'frequency', 'spread of times'],
    example: ['type: histogram', 'title: Duracion de builds', 'bins: 10', 'values: [4, 6, 6, 7, 9, 12]'].join('\n'),
  }),
  t({
    type: 'box-plot',
    lang: 'chart',
    engine: 'vega-lite',
    aliases: ['boxplot', 'caja-bigotes'],
    purpose: 'Mediana, dispersion y valores atipicos por grupo.',
    whenToUse: 'Para comparar la variabilidad entre grupos, no solo su promedio.',
    whenNotToUse: 'Con muy pocas observaciones por grupo: la caja enganaria.',
    keywords: ['dispersion', 'mediana', 'variabilidad', 'atipicos', 'percentiles', 'caja', 'median', 'dispersion', 'outliers', 'quartiles', 'variability by group'],
    example: [
      'type: box-plot',
      'title: Duracion por equipo',
      'groups:',
      '  - name: Equipo A',
      '    values: [3, 5, 6, 6, 9]',
    ].join('\n'),
  }),
  t({
    type: 'bullet',
    lang: 'chart',
    engine: 'vega-lite',
    aliases: ['kpi'],
    purpose: 'Valor real frente a su objetivo.',
    whenToUse: 'Para indicadores con meta: cobertura frente al 80 %, disponibilidad frente al SLA.',
    whenNotToUse: 'Si no hay objetivo definido: usa `bar`.',
    keywords: ['kpi', 'objetivo', 'meta', 'indicador', 'sla', 'cumplimiento', 'avance', 'target', 'actual vs goal', 'kpi', 'progress to target'],
    example: [
      'type: bullet',
      'title: Indicadores',
      'data:',
      '  - label: Cobertura',
      '    value: 74',
      '    target: 80',
    ].join('\n'),
  }),
  t({
    type: 'slope',
    lang: 'chart',
    engine: 'vega-lite',
    aliases: ['slopegraph'],
    purpose: 'Cambio entre dos momentos, elemento a elemento.',
    whenToUse: 'Para mostrar quien mejoro y quien empeoro entre dos mediciones.',
    whenNotToUse: 'Con mas de dos momentos: usa `line`.',
    keywords: ['antes y despues', 'cambio', 'mejora', 'comparacion', 'dos momentos', 'pendiente', 'change between two moments', 'before after by item', 'rank shift'],
    example: [
      'type: slope',
      'title: Cobertura antes y despues',
      'from: SP1',
      'to: SP5',
      'data:',
      '  - label: Backend',
      '    before: 41',
      '    after: 81',
    ].join('\n'),
  }),
  t({
    type: 'funnel',
    lang: 'chart',
    engine: 'vega-lite',
    aliases: ['embudo'],
    purpose: 'Caida de volumen a lo largo de etapas sucesivas.',
    whenToUse: 'Para conversiones o filtros: candidatos por fase, incidencias por estado.',
    whenNotToUse: 'Si las etapas no son sucesivas: usa `bar`.',
    keywords: ['embudo', 'conversion', 'etapas', 'caida', 'filtro', 'abandono', 'conversion', 'drop off', 'stages of signup', 'how many survive each step', 'attrition', 'sobreviven', 'cuantos llegan', 'de la visita a la compra', 'drop-off by step', 'how many reach each step'],
    example: [
      'type: funnel',
      'title: Conversion',
      'data:',
      '  - label: Visitas',
      '    value: 1000',
      '  - label: Registros',
      '    value: 220',
    ].join('\n'),
  }),
  t({
    type: 'pie',
    lang: 'chart',
    engine: 'vega-lite',
    purpose: 'Reparto de un total entre pocas partes.',
    whenToUse: 'Con tres o cuatro partes y diferencias grandes entre ellas.',
    whenNotToUse: 'Con muchas partes o valores parecidos: `bar` se compara mejor.',
    keywords: ['reparto', 'porcentaje', 'proporcion', 'tarta', 'cuota', 'share of total', 'percentage split', 'proportions', 'few slices'],
    example: ['type: pie', 'data:', '  - label: Backend', '    value: 60'].join('\n'),
  }),
  t({
    type: 'donut',
    lang: 'chart',
    engine: 'vega-lite',
    aliases: ['doughnut'],
    purpose: 'Reparto de un total, con el centro libre para un dato o un titulo.',
    whenToUse: 'Igual que `pie`, cuando el hueco central aligera visualmente la lamina.',
    whenNotToUse: 'Con muchas partes o valores parecidos: `bar` se compara mejor.',
    keywords: ['reparto', 'porcentaje', 'proporcion', 'anillo', 'donut', 'cuota', 'share of total with center', 'ring chart', 'proportions with a figure'],
    example: ['type: donut', 'data:', '  - label: Backend', '    value: 60'].join('\n'),
  }),
  t({
    type: 'waterfall',
    lang: 'chart',
    engine: 'vega-lite',
    aliases: ['cascada'],
    purpose: 'Como se llega de un valor inicial a uno final, paso a paso.',
    whenToUse: 'Para descomponer una variacion en sus aportes positivos y negativos.',
    whenNotToUse: 'Si solo tienes el inicio y el final: usa `bar`.',
    keywords: ['cascada', 'variacion', 'aportes', 'descomposicion', 'presupuesto', 'delta', 'bridge', 'from one value to another', 'contributions', 'walk from start to end', 'variance bridge', 'sumando y restando', 'adding and subtracting', 'de un resultado a otro', 'from one result to another', 'efectos acumulados'],
    example: [
      'type: waterfall',
      'title: Variacion de defectos',
      'data:',
      '  - label: Inicial',
      '    value: 100',
      '  - label: Corregidos',
      '    value: -60',
    ].join('\n'),
  }),
];

// --------------------------------------------------------------------------
// architecture
// --------------------------------------------------------------------------

const ARCHITECTURE: readonly TypeSpec[] = [
  t({
    type: 'c4-context',
    lang: 'architecture',
    engine: 'likec4',
    fallbacks: ['plantuml-c4'],
    aliases: ['context'],
    purpose: 'El sistema, sus usuarios y los sistemas con los que habla.',
    whenToUse: 'Como primera vista de una arquitectura, para publico que no conoce el sistema.',
    whenNotToUse: 'Si necesitas ver piezas internas: usa `c4-container`.',
    keywords: ['contexto', 'c4', 'arquitectura', 'sistemas externos', 'vision general', 'actores', 'system context', 'users and external systems', 'big picture', 'landscape'],
    example: [
      'type: c4-context',
      'title: Contexto',
      'elements:',
      '  - id: usuario',
      '    kind: person',
      '    name: Usuario',
      '  - id: core',
      '    kind: system',
      '    name: Plataforma',
      'relations:',
      '  - from: usuario',
      '    to: core',
      '    label: Utiliza',
    ].join('\n'),
  }),
  t({
    type: 'c4-container',
    lang: 'architecture',
    engine: 'likec4',
    fallbacks: ['plantuml-c4'],
    aliases: ['container'],
    purpose: 'Las piezas desplegables del sistema y su tecnologia.',
    whenToUse: 'Para explicar de que partes consta el sistema y como se comunican.',
    whenNotToUse: 'Si el detalle es de clases o modulos internos: usa `c4-component` o `component`.',
    keywords: ['contenedores', 'c4', 'aplicaciones', 'servicios', 'bases de datos', 'tecnologia', 'deployable pieces', 'apps and databases', 'technology per piece', 'containers'],
    example: [
      'type: c4-container',
      'title: Contenedores',
      'elements:',
      '  - id: plataforma',
      '    kind: system',
      '    name: Plataforma',
      '  - id: api',
      '    kind: container',
      '    name: API',
      '    technology: NestJS',
      '    parent: plataforma',
    ].join('\n'),
  }),
  t({
    type: 'c4-component',
    lang: 'architecture',
    engine: 'likec4',
    fallbacks: ['plantuml-c4'],
    aliases: ['component-view'],
    purpose: 'Componentes internos de un contenedor.',
    whenToUse: 'Para el interior de una aplicacion concreta, cuando aporta al lector.',
    whenNotToUse: 'Casi siempre: este nivel envejece rapido. Comprueba que alguien lo vaya a leer.',
    keywords: ['componentes', 'c4', 'interior', 'modulos', 'internal components', 'inside a container', 'responsibilities'],
    example: [
      'type: c4-component',
      'title: Componentes de la API',
      'elements:',
      '  - id: api',
      '    kind: container',
      '    name: API',
      '  - id: ctrl',
      '    kind: component',
      '    name: Controlador',
      '    parent: api',
    ].join('\n'),
  }),
];

const TIPOS: readonly TypeSpec[] = [
  ...UML,
  ...FLOW_AND_PRODUCT,
  ...EXECUTIVE,
  ...SPECIAL,
  ...CHARTS,
  ...ARCHITECTURE,
];

// La traduccion se acopla aqui y no dentro de cada definicion: asi la ficha en
// español se lee de corrido y anadir un idioma no obliga a tocar 57 objetos.
export const TYPE_CATALOG: readonly TypeSpec[] = TIPOS.map((spec) => {
  const en = CATALOG_EN[spec.type];
  return en === undefined ? spec : { ...spec, en };
});

const BY_NAME = new Map<string, TypeSpec>();
for (const spec of TYPE_CATALOG) {
  BY_NAME.set(spec.type, spec);
  for (const alias of spec.aliases ?? []) BY_NAME.set(alias, spec);
}

/** Busca un tipo por su nombre canonico o por cualquiera de sus alias. */
export function findType(name: string): TypeSpec | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

export function typesFor(lang: DslLang): TypeSpec[] {
  return TYPE_CATALOG.filter((s) => s.lang === lang);
}

export function typeNames(lang: DslLang): string[] {
  return typesFor(lang)
    .map((s) => s.type)
    .sort();
}

/** Todos los nombres aceptados, alias incluidos. */
export function allTypeNames(): string[] {
  return [...BY_NAME.keys()].sort();
}
