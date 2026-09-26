# Instructions for agents — visual documentation

*Este documento en español: [AGENTS.md](./AGENTS.md)*

This project uses **DocViz** to generate diagrams, charts and visualizations
inside Markdown documents.

## The main rule

Only edit the source documents under:

```
docs-src/
```

Never edit by hand:

```
docs/
docs/assets/generated/
```

Those are generated directories. Any manual change is lost on the next build.

---

## Describe the intent, not the technology

DocViz knows which engine to use. You only declare what you want to explain,
with one of these three fences:

| Fence | When |
|---|---|
| `diagram` | Interaction, flow, states, dependencies, strategic analysis |
| `chart` | Quantitative comparison, trend, distribution |
| `architecture` | C4 model |

### Which type to pick

Search by **what you want to explain**, not by the technology.

<!-- docviz:tipos-tablas-4-en -->
#### Diagrams — `diagram` block

| What you need | `type` | Engine |
|---|---|---|
| Who talks to whom, and in what order | `sequence` | plantuml (or d2) |
| Classes or entities and how they relate | `class` | plantuml (or d2) |
| The states of one thing and the transitions between them | `state` | plantuml (or d2) |
| A process with decisions and parallel branches | `activity` | plantuml (or d2) |
| Data entities, their fields and their cardinality | `erd` | plantuml (or mermaid) |
| What each actor can do with the system | `use-case` | plantuml (or d2) |
| Software components, grouped, and how they connect | `component` | plantuml (or d2) |
| Where each piece runs and on what infrastructure | `deployment` | plantuml (or d2) |
| A sketch of a screen: fields, buttons and layout | `wireframe` | plantuml |
| The shape of a JSON drawn as a tree | `json` | plantuml |
| The shape of a YAML drawn as a tree | `yaml` | plantuml |
| The hierarchical breakdown of a project | `wbs` | plantuml (or d2) |
| A simple end-to-end flow | `flow` | mermaid (or d2) |
| Tasks placed on the calendar | `gantt` | mermaid (or plantuml / vega-lite) |
| A person walking through a process, with how they feel at each step | `journey` | mermaid (or d2) |
| The history of branches, commits and merges | `git-graph` | mermaid |
| Cards spread across status columns | `kanban` | mermaid (or d2) |
| Items placed on two continuous axes | `quadrant` | mermaid (or vega-lite) |
| How a quantity splits as it moves from one state to another | `sankey` | mermaid |
| The composition of a total by proportional area | `treemap` | mermaid |
| A profile across several dimensions at once | `radar` | mermaid (or vega-lite) |
| Exploring a topic in free branches | `mindmap` | mermaid (or plantuml) |
| Blocks laid out on a grid, with no flow semantics | `block` | mermaid (or d2) |
| Breaking an objective down into lines of action | `strategy-tree` | d2 |
| Breaking a problem down into its causes | `issue-tree` | d2 |
| The alternatives of a decision and where each one leads | `decision-tree` | d2 |
| The pillars holding up an objective, with their content | `strategy-pillars` | d2 |
| Capabilities grouped by domain | `capability-map` | d2 |
| The layers of an operating model, from business to infrastructure | `operating-model` | d2 |
| Chained stages that create value | `value-chain` | d2 |
| A comparison of two scenarios | `before-after` | d2 |
| Four quadrants with their content, without coordinates | `matrix-2x2` | d2 |
| Milestones in chronological order | `timeline` | d2 (or mermaid) |
| Upcoming phases with their content | `roadmap` | d2 |
| Who depends on whom | `dependency-map` | graphviz |
| A business process in standard BPMN notation | `bpmn` | bpmn |
| A drawing made of characters, turned into clean SVG | `ascii` | svgbob |

#### Charts — `chart` block

| What you need | `type` | Engine |
|---|---|---|
| A comparison between categories | `bar` | vega-lite |
| A comparison between categories with long labels | `horizontal-bar` | vega-lite |
| The composition of a total, per category | `stacked-bar` | vega-lite |
| A comparison of several series per category | `grouped-bar` | vega-lite |
| How a magnitude evolves over time | `line` | vega-lite |
| Evolution with the accumulated volume emphasised | `area` | vega-lite |
| How the composition of a total evolves | `stacked-area` | vega-lite |
| The relationship between two magnitudes | `scatter` | vega-lite |
| The density of a magnitude across two categorical dimensions | `heatmap` | vega-lite |
| The distribution of a continuous variable | `histogram` | vega-lite |
| Median, spread and outliers per group | `box-plot` | vega-lite |
| The actual value against its target | `bullet` | vega-lite |
| A comparison between categories with less ink than a bar | `lollipop` | vega-lite |
| The gesture of a series, with no axes and the size of a sentence | `sparkline` | vega-lite |
| A row of big numbers, each with its label and its target | `kpi-card` | vega-lite |
| A long period in cells: week across, day of the week down | `calendar-heatmap` | vega-lite |
| How a ranking changes: who overtakes whom | `bump` | vega-lite |
| The change between two moments, item by item | `slope` | vega-lite |
| How volume drops along successive stages | `funnel` | vega-lite |
| How a total splits between a few parts | `pie` | vega-lite |
| How a total splits, with the centre free for a figure or a title | `donut` | vega-lite |
| How you get from a starting value to a final one, step by step | `waterfall` | vega-lite |

#### Architecture — `architecture` block

| What you need | `type` | Engine |
|---|---|---|
| The system, its users and the systems it talks to | `c4-context` | likec4 (or plantuml-c4) |
| The deployable pieces of the system and their technology | `c4-container` | likec4 (or plantuml-c4) |
| The internal components of one container | `c4-component` | likec4 (or plantuml-c4) |
<!-- /docviz:tipos-tablas-4-en -->

### Don't guess — ask

```bash
npx docviz suggest "the approval process for a request"   # recommends the type
npx docviz types --lang en                                # the catalog, with purpose
npx docviz types sequence --lang en                       # one type, with an example that compiles as-is
```

`docviz types <type>` prints the minimal skeleton of that type. Copy it and fill
it in: it is the fastest way to not get the fields wrong.

---

## Example

````md
```diagram
type: sequence
title: User authentication

participants:
  - User
  - API

flow:
  - User -> API: Login
  - API --> User: Token
```
````

`->` is a message; `-->` is a reply.

---

## The required workflow

After creating or changing documentation:

```bash
npx docviz check docs-src                    # validate without drawing (fast)
npx docviz build docs-src --output docs      # compile to Markdown + SVG
npx docviz verify docs                       # check there are no broken images
npx docviz diff <previous docs-src> docs-src # which diagrams changed
```

Do not report the task as finished while `check` or `verify` fail.

### What to do with each error code

Every error carries a **code** as well as a file and a line. A document with
several broken blocks reports them **all at once**: fix them in a single pass.

| Code | What to do |
|---|---|
| `DV101` | A required field is missing. The detail says which one; `docviz types <type>` shows the full skeleton |
| `DV102` | The field is there but with the wrong shape (a list where a map was expected, or the other way round) |
| `DV103` | The value is not one of the allowed ones; the detail lists them |
| `DV104` | You wrote a field that this type does not use. If the message proposes another name, it is a typo: fix it |
| `DV105` | The block is not valid YAML. Usually indentation, or an unescaped colon |
| `DV106` | The `type` does not exist, or belongs to another fence. `docviz suggest "..."` proposes the right one |
| `DV005` | The engine is not on this machine. Do not change the diagram: say that Java or Chromium is missing |

Before rewriting a block by hand:

```bash
npx docviz fix block.yaml    # fixes the typos and says whether that was enough
```

### Warnings are not optional reading

An `AVISO ... [DV104]` means the block compiled but part of what you wrote never
reached the drawing. It does not fail the build, which is exactly why it is easy
to publish without noticing. Treat it as an error: either the field is
redundant and goes away, or it was misspelled and gets fixed.

---

## Rules

- Do not hand-write SVG or PNG when DocViz can generate them.
- Do not modify hashes or generated image names.
- Do not introduce absolute paths.
- Do not replace a declarative diagram with a screenshot.
- Do not hardcode colours: the theme carries its dark-mode equivalent, and a
  hand-written colour loses that property.
- Do not send confidential documentation to external services.
- Do not ignore an unrecognised-field warning: either it is redundant or it is
  misspelled.

---

## When *not* to draw

Before creating a visualization, check that it adds something. For simple
information, a Markdown table or a paragraph communicates better. A diagram with
twenty boxes explains nothing: split it into several with distinct purposes.

---

## MCP tools

If your client has the DocViz MCP server configured, prefer it over running
commands:

| Tool | Use |
|---|---|
| `docviz_suggest` | Describe in one sentence what you want to explain, and get the type and the block |
| `docviz_types` | Consult the full catalog with purposes and examples |
| `docviz_validate_document` | Validate what you just wrote, before saving it |
| `docviz_render_diagram` | Try a single diagram |
| `docviz_build_document` | Compile the documentation |
| `docviz_diff` | Check which diagrams changed against the previous version |
| `docviz_fix` | Before rewriting a failed block by hand, ask for the corrected one |
| `docviz_preview` | Review the result and detect broken images |

In a project that does not have DocViz yet, `npx docviz skill` installs this
contract into your skills directory and `npx docviz init` leaves the full
`AGENTS.md`.
