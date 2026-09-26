/**
 * Ficha de cada tipo en ingles.
 *
 * Vive aparte del catalogo para que la traduccion se pueda revisar de un
 * vistazo, y para que anadir un idioma no obligue a tocar las 57 definiciones.
 *
 * No es documentacion decorativa: `docviz suggest` puntua la peticion contra
 * esta prosa igual que contra la española, asi que una peticion en ingles deja
 * de depender solo de las palabras clave. Una prueba comprueba que no falte
 * ningun tipo.
 */

export interface TypeSpecEn {
  readonly purpose: string;
  readonly whenToUse: string;
  readonly whenNotToUse: string;
}

export const CATALOG_EN: Readonly<Record<string, TypeSpecEn>> = {
  sequence: {
    purpose: 'Who talks to whom, and in what order.',
    whenToUse: 'To explain an interaction between components over time: a login, a payment, a call between services.',
    whenNotToUse: 'If the order in time does not matter; then it is a component or a dependency diagram.',
  },
  class: {
    purpose: 'Classes or entities and how they relate.',
    whenToUse: 'For the domain model of an object-oriented system, with attributes, methods and inheritance.',
    whenNotToUse: 'If what you describe are tables and foreign keys: use `erd`.',
  },
  state: {
    purpose: 'The states of one thing and the transitions between them.',
    whenToUse: 'When something has a lifecycle: an order, a request, a deployment.',
    whenNotToUse: 'If the process is a sequence of tasks with no states of its own: use `activity` or `flow`.',
  },
  activity: {
    purpose: 'A process with decisions and parallel branches.',
    whenToUse: 'When conditions fork the path: validations, approvals, retries.',
    whenNotToUse: 'If the process is linear and simple, `flow` reads cleaner. If it is a business process with roles: `bpmn`.',
  },
  erd: {
    purpose: 'Data entities, their fields and their cardinality.',
    whenToUse: 'To document a relational data model: tables, keys and cardinalities.',
    whenNotToUse: 'If the focus is behaviour rather than data: use `class`.',
  },
  'use-case': {
    purpose: 'What each actor can do with the system.',
    whenToUse: 'To scope the functionality against users and external systems.',
    whenNotToUse: 'If you need to detail how each case happens: that is `sequence` or `activity`.',
  },
  component: {
    purpose: 'Software components, grouped, and how they connect.',
    whenToUse: 'For the internal structure of an application when C4 is overkill.',
    whenNotToUse: 'If you describe the whole system and its surroundings: use `c4-context` or `c4-container`.',
  },
  deployment: {
    purpose: 'Where each piece runs and on what infrastructure.',
    whenToUse: 'To document nodes, containers, artifacts and the databases of an environment.',
    whenNotToUse: 'If the interest is logical responsibility rather than the machine: use `component` or C4.',
  },
  wireframe: {
    purpose: 'A sketch of a screen: fields, buttons and layout.',
    whenToUse: 'To agree on an interface without opening a design tool, inside the document itself.',
    whenNotToUse: 'If you need real visual fidelity; this is a sketch, not a design.',
  },
  json: {
    purpose: 'The shape of a JSON drawn as a tree.',
    whenToUse: 'To document an API request or response body at a glance.',
    whenNotToUse: 'If the JSON is short: a code block reads better and can be copied.',
  },
  yaml: {
    purpose: 'The shape of a YAML drawn as a tree.',
    whenToUse: 'To explain a manifest or a long configuration by its shape.',
    whenNotToUse: 'If the file is short or the reader will copy it: use a code block.',
  },
  wbs: {
    purpose: 'The hierarchical breakdown of a project.',
    whenToUse: 'To break a scope down into deliverables and work packages.',
    whenNotToUse: 'If what matters are the dates: use `gantt`. If it is a causal analysis: `issue-tree`.',
  },
  flow: {
    purpose: 'A simple end-to-end flow.',
    whenToUse: 'To chain steps or components when seeing where things go through is enough.',
    whenNotToUse: 'If there are many conditions: `activity`. If it is an interaction over time: `sequence`.',
  },
  gantt: {
    purpose: 'Tasks placed on the calendar.',
    whenToUse: 'For a plan with dates and dependencies between tasks.',
    whenNotToUse: 'If there are no concrete dates: use `roadmap` or `timeline`.',
  },
  journey: {
    purpose: 'A person walking through a process, with how they feel at each step.',
    whenToUse: 'To show where the user suffers and who takes part at each step.',
    whenNotToUse: 'If the interest is technical rather than the experience: use `flow` or `sequence`.',
  },
  'git-graph': {
    purpose: 'The history of branches, commits and merges.',
    whenToUse: 'To explain the branching strategy of the team.',
    whenNotToUse: 'If what you document is the review process rather than the topology: use `flow`.',
  },
  kanban: {
    purpose: 'Cards spread across status columns.',
    whenToUse: 'To snapshot the state of a board inside a report.',
    whenNotToUse: 'If the board changes daily: link the tool instead of freezing it.',
  },
  quadrant: {
    purpose: 'Items placed on two continuous axes.',
    whenToUse: 'To prioritise with data: every item has a concrete position, not just a quadrant.',
    whenNotToUse: 'If you only want to name the four quadrants without placing anything: use `matrix-2x2`.',
  },
  sankey: {
    purpose: 'How a quantity splits as it moves from one state to another.',
    whenToUse: 'To show volumes that divide: where defects come from, a conversion funnel with leaks.',
    whenNotToUse: 'If you only compare totals with no flow between them: use `bar`.',
  },
  treemap: {
    purpose: 'The composition of a total by proportional area.',
    whenToUse: 'To see at a glance who weighs most inside a hierarchical set.',
    whenNotToUse: 'If you compare a few categories with no hierarchy: `bar` is more precise to read.',
  },
  radar: {
    purpose: 'A profile across several dimensions at once.',
    whenToUse: 'For maturity or capability assessments, and to compare two profiles.',
    whenNotToUse: 'With more than seven axes, or if the dimensions are not comparable to each other.',
  },
  mindmap: {
    purpose: 'Exploring a topic in free branches.',
    whenToUse: 'To open up a scope or collect ideas before structuring them.',
    whenNotToUse: 'If the hierarchy is already firm and deliberate: `strategy-tree` conveys the intent better.',
  },
  block: {
    purpose: 'Blocks laid out on a grid, with no flow semantics.',
    whenToUse: 'For layers, bands or a schematic view where position matters more than arrows.',
    whenNotToUse: 'If there are relationships to explain: use `flow` or `component`.',
  },
  'strategy-tree': {
    purpose: 'Breaking an objective down into lines of action.',
    whenToUse: 'To bring an objective down to concrete initiatives in front of leadership.',
    whenNotToUse: 'If you are exploring the causes of a problem: `issue-tree` names the intent better.',
  },
  'issue-tree': {
    purpose: 'Breaking a problem down into its causes.',
    whenToUse: 'For root cause analysis, or to structure a diagnosis.',
    whenNotToUse: 'If you already know what to do and only want to present it: `strategy-tree`.',
  },
  'decision-tree': {
    purpose: 'The alternatives of a decision and where each one leads.',
    whenToUse: 'To present mutually exclusive options and what each one leads to.',
    whenNotToUse: 'If the decision happens inside a process: use `activity`.',
  },
  'strategy-pillars': {
    purpose: 'The pillars holding up an objective, with their content.',
    whenToUse: 'For a leadership slide with three or four themes and their initiatives.',
    whenNotToUse: 'If the hierarchy has more than two levels: use `strategy-tree`.',
  },
  'capability-map': {
    purpose: 'Capabilities grouped by domain.',
    whenToUse: 'To show what an organisation or a product knows how to do, without talking about technology.',
    whenNotToUse: 'If you describe software components: use `component` or C4.',
  },
  'operating-model': {
    purpose: 'The layers of an operating model, from business to infrastructure.',
    whenToUse: 'To relate levels: business, processes, applications, technology.',
    whenNotToUse: 'If there is a single layer with loose items: use `capability-map`.',
  },
  'value-chain': {
    purpose: 'Chained stages that create value.',
    whenToUse: 'For the journey of an activity from start to finish, in broad steps.',
    whenNotToUse: 'If there are conditions or loops back: use `flow` or `activity`.',
  },
  'before-after': {
    purpose: 'A comparison of two scenarios.',
    whenToUse: 'To justify a change by showing the current situation against the proposal.',
    whenNotToUse: 'If the comparison is numeric: use `bar` or `slope`.',
  },
  'matrix-2x2': {
    purpose: 'Four quadrants with their content, without coordinates.',
    whenToUse: 'To classify into four qualitative groups.',
    whenNotToUse: 'If each item has a measured position: use `quadrant`.',
  },
  timeline: {
    purpose: 'Milestones in chronological order.',
    whenToUse: 'For a history or a succession of milestones with no durations.',
    whenNotToUse: 'If there are start and end dates per task: use `gantt`.',
  },
  roadmap: {
    purpose: 'Upcoming phases with their content.',
    whenToUse: 'To communicate the plan by quarter or phase without committing to exact dates.',
    whenNotToUse: 'If there are date commitments: use `gantt`.',
  },
  'dependency-map': {
    purpose: 'Who depends on whom.',
    whenToUse: 'For dependency graphs between modules, services or teams, cycles included.',
    whenNotToUse: 'If the order in time matters: use `sequence`.',
  },
  bpmn: {
    purpose: 'A business process in standard BPMN notation.',
    whenToUse: 'When the document goes to business or audit and the standard notation matters.',
    whenNotToUse: 'For an internal technical process, `activity` or `flow` are shorter. Lanes by role are not supported yet.',
  },
  ascii: {
    purpose: 'A drawing made of characters, turned into clean SVG.',
    whenToUse: 'When you already have an ASCII sketch —from an RFC, from a README— and want to publish it legibly.',
    whenNotToUse: 'For a new diagram: any declarative type ages better.',
  },
  bar: {
    purpose: 'A comparison between categories.',
    whenToUse: 'When each bar is a category and you want to compare them.',
    whenNotToUse: 'If the axis is time and there are many points: use `line`.',
  },
  'horizontal-bar': {
    purpose: 'A comparison between categories with long labels.',
    whenToUse: 'When the names do not fit under vertical bars.',
    whenNotToUse: 'If there are few categories with short names: `bar` takes less room.',
  },
  'stacked-bar': {
    purpose: 'The composition of a total, per category.',
    whenToUse: 'To see the total and how it breaks down inside, at the same time.',
    whenNotToUse: 'If you want to compare the parts against each other: use `grouped-bar`.',
  },
  'grouped-bar': {
    purpose: 'A comparison of several series per category.',
    whenToUse: 'When you compare two or three series within each category.',
    whenNotToUse: 'If the interest is the total: use `stacked-bar`.',
  },
  line: {
    purpose: 'How a magnitude evolves over time.',
    whenToUse: 'For trends with several points: coverage per sprint, defects per month.',
    whenNotToUse: 'With two or three points and no continuity: use `bar`.',
  },
  area: {
    purpose: 'Evolution with the accumulated volume emphasised.',
    whenToUse: 'When the magnitude under the curve matters, not just its shape.',
    whenNotToUse: 'If you compare several series that cross each other: `line` reads better.',
  },
  'stacked-area': {
    purpose: 'How the composition of a total evolves.',
    whenToUse: 'To see how the split between series changes over time.',
    whenNotToUse: 'If the series do not add up to a meaningful total: use `line`.',
  },
  scatter: {
    purpose: 'The relationship between two magnitudes.',
    whenToUse: 'To look for correlation: size against defects, effort against value.',
    whenNotToUse: 'If one of the two is categorical: use `bar`.',
  },
  heatmap: {
    purpose: 'The density of a magnitude across two categorical dimensions.',
    whenToUse: 'For crossings: defects by module and sprint, activity by day and hour.',
    whenNotToUse: 'If one dimension has a single value: use `bar`.',
  },
  histogram: {
    purpose: 'The distribution of a continuous variable.',
    whenToUse: 'To see how values spread out: build durations, story sizes.',
    whenNotToUse: 'If the values already come grouped into categories: use `bar`.',
  },
  'box-plot': {
    purpose: 'Median, spread and outliers per group.',
    whenToUse: 'To compare variability between groups, not just their average.',
    whenNotToUse: 'With very few observations per group: the box would mislead.',
  },
  bullet: {
    purpose: 'The actual value against its target.',
    whenToUse: 'For indicators with a goal: coverage against 80 %, availability against the SLA.',
    whenNotToUse: 'If there is no defined target: use `bar`.',
  },
  lollipop: {
    purpose: 'A comparison between categories with less ink than a bar.',
    whenToUse: 'With many categories or long names: the thin rule separates them without filling the drawing.',
    whenNotToUse: 'If parts of a total must add up: use `stacked-bar`.',
  },
  sparkline: {
    purpose: 'The gesture of a series, with no axes and the size of a sentence.',
    whenToUse: 'Next to a number, to say whether it has been rising or falling without opening a chart.',
    whenNotToUse: 'If concrete values must be read: use `line`.',
  },
  'kpi-card': {
    purpose: 'A row of big numbers, each with its label and its target.',
    whenToUse: 'To open a report with the three or four figures that summarise the state.',
    whenNotToUse: 'To compare many categories against each other: use `bar` or `lollipop`.',
  },
  'calendar-heatmap': {
    purpose: 'A long period in cells: week across, day of the week down.',
    whenToUse: 'To see rhythm and gaps over months: runs per day, defects per day.',
    whenNotToUse: 'With few days: a `bar` reads them better.',
  },
  bump: {
    purpose: 'How a ranking changes: who overtakes whom.',
    whenToUse: 'When relative position matters and magnitude does not: top modules per sprint.',
    whenNotToUse: 'If what changes is the magnitude: use `line`.',
  },
  slope: {
    purpose: 'The change between two moments, item by item.',
    whenToUse: 'To show who improved and who got worse between two measurements.',
    whenNotToUse: 'With more than two moments: use `line`.',
  },
  funnel: {
    purpose: 'How volume drops along successive stages.',
    whenToUse: 'For conversions or filters: candidates per stage, incidents per status.',
    whenNotToUse: 'If the stages are not successive: use `bar`.',
  },
  pie: {
    purpose: 'How a total splits between a few parts.',
    whenToUse: 'With three or four parts and large differences between them.',
    whenNotToUse: 'With many parts or similar values: `bar` compares better.',
  },
  donut: {
    purpose: 'How a total splits, with the centre free for a figure or a title.',
    whenToUse: 'Same as `pie`, when the hole in the middle lightens the slide.',
    whenNotToUse: 'With many parts or similar values: `bar` compares better.',
  },
  waterfall: {
    purpose: 'How you get from a starting value to a final one, step by step.',
    whenToUse: 'To break a variation down into its positive and negative contributions.',
    whenNotToUse: 'If you only have the start and the end: use `bar`.',
  },
  'c4-context': {
    purpose: 'The system, its users and the systems it talks to.',
    whenToUse: 'As the first view of an architecture, for an audience that does not know the system.',
    whenNotToUse: 'If you need to see internal pieces: use `c4-container`.',
  },
  'c4-container': {
    purpose: 'The deployable pieces of the system and their technology.',
    whenToUse: 'To explain what parts the system consists of and how they communicate.',
    whenNotToUse: 'If the detail is about internal classes or modules: use `c4-component` or `component`.',
  },
  'c4-component': {
    purpose: 'The internal components of one container.',
    whenToUse: 'For the inside of one specific application, when it helps the reader.',
    whenNotToUse: 'Almost always: this level ages fast. Check that someone is going to read it.',
  },
};
