---
name: docviz
description: Generate diagrams and charts inside Markdown documentation by declaring the intent (sequence, flow, C4 architecture, bars, trend…) instead of hand-writing PlantUML, Mermaid, D2 or Vega-Lite. Use it whenever you are about to draw something in a document, when you are unsure which diagram type fits, or when a diagram block fails to compile. Everything renders locally and the output is standard Markdown with SVG images, so it looks the same on GitHub, in a wiki or in a PDF.
---

# DocViz — diagrams as code inside Markdown

You write **what you want to explain**; DocViz picks the engine and returns
portable Markdown with the image already generated. Do not hand-write PlantUML,
Mermaid, D2, Graphviz, Vega-Lite or LikeC4: every viewer supports a different
subset, and the result stops rendering depending on where it is read.

## The three fences

| Fence | When |
|---|---|
| `diagram` | Interaction, flow, states, dependencies, strategic analysis |
| `chart` | Quantitative comparison, trend, distribution |
| `architecture` | C4 model |

````md
```diagram
type: sequence
title: Authentication

participants:
  - User
  - API

flow:
  - User -> API: Login
  - API --> User: Token
```
````

`->` is a message, `-->` is a reply.

## Don't guess the type — ask

There are 62 types. Before writing a block, if you are not sure:

```bash
npx docviz suggest "the approval process for a request"  # recommends the type
npx docviz types --lang en                               # the catalog with purposes
npx docviz types sequence --lang en                      # one type, plus an example that compiles as-is
```

`docviz types <type>` prints the minimal skeleton. Copy it and fill it in: it is
the fastest way to not get the fields wrong.

## Say where the drawing is going

The same diagram does not read the same embedded in a page and projected in a
room. Declare the destination and DocViz scales the canvas so the text reaches
the minimum height that destination requires:

| Destination | What for | Minimum text |
|---|---|---|
| `fit` | Whatever the engine emitted (the default) | — |
| `doc-inline` | Inside a page's reading width | 12 px |
| `doc-wide` | Full bleed, the page's whole width | 12 px |
| `slide-16x9` · `slide-4x3` | A projected slide | 16 px |
| `social-og` | A link card; it is seen as a thumbnail | 18 px |
| `print-a4-landscape` | A4 landscape | 11 px |

Declare it once in `docviz.config.yaml` (`size: slide-16x9`), and override it
per block on the fence:

````md
```diagram size=slide-16x9
type: flow
title: Customer onboarding
description: Three steps, signup to billing, with validation the only retry point
steps: [Signup, Validation, Billing]
```
````

Nothing is laid out again: only the canvas changes, exactly as if you enlarged
the image. If the drawing **does not fit** the destination at a legible size,
you get a `WARN [DV108]`. That is not a system failure: it means the diagram
carries too much information for where it is going. Cut it or change the
destination; do not silence it.

## Always write a `description`

`title` says **what** the diagram is of; `description` says **what you see in
it**, and it is the only thing that reaches someone who cannot look at it. It
becomes the SVG's `<desc>`, next to the `<title>` and `role="img"` that DocViz
writes for you.

A useful description names what the drawing proves, not its shape: "billing
depends on validation, the only step with a retry", not "a diagram with three
connected boxes".

## Workflow

```bash
npx docviz check docs-src                     # validate without drawing (fast)
npx docviz build docs-src --output docs       # compile to Markdown + SVG
npx docviz verify docs                        # check for broken images
npx docviz lint docs                          # review the generated SVGs
npx docviz diff <previous docs-src> docs-src  # which diagrams changed
```

`verify` looks at the **Markdown** (that it cites no image that is missing);
`lint` looks at the **SVGs** (accessible name, unique ids, references that
resolve, a usable canvas, text legible for the destination). They answer
different questions and neither replaces the other.

While writing, `npx docviz preview docs --watch` recompiles on save and reloads
the browser by itself.

Do not consider the task done while `check`, `verify` or `lint` fail.

## When something fails

Every error carries a **code** as well as a file and a line. Read it, don't
guess:

| Code | What to do |
|---|---|
| `DV101` | A required field is missing; the detail says which |
| `DV102` | The field has the wrong shape (a list where a map was expected, or vice versa) |
| `DV103` | The value is not one of the allowed ones; the detail lists them |
| `DV104` | You wrote a field this type does not use. If it proposes another name, it is a typo |
| `DV105` | The block is not valid YAML; usually the indentation |
| `DV106` | The `type` does not exist, or belongs to another fence; use `docviz suggest` |
| `DV107` | A fallback engine drew it, so it looks different. Something is missing on the machine, not in the block |
| `DV108` | The drawing does not reach the destination's minimum text size. Cut it or change `size` |
| `DV005` | Java or Chromium is missing on this machine. Do not change the diagram: say so |

A document with several broken blocks reports them **all at once**: fix them in
a single pass. And before rewriting a block by hand:

```bash
npx docviz fix block.yaml    # fixes typos and says whether that was enough
```

A warning `AVISO ... [DV104]` does not break the build, but it means a field you
wrote never reached the drawing. Either it is redundant, or it is misspelled;
never ignore it.

## Rules

- Edit the source documents; never the output directory or `assets/generated`.
- Do not hand-write SVG or PNG if DocViz can generate them.
- Do not hardcode colours: the theme carries its dark-mode equivalent, and a
  hand-written colour loses that property.
- Do not replace a declarative diagram with a screenshot.
- Before drawing, check that it adds something: for simple information a table
  or a paragraph communicates better. A twenty-box diagram explains nothing —
  split it.

## First time in a project

```bash
npm install -D docviz-builder
npx docviz setup    # downloads plantuml.jar (the only network operation)
npx docviz init     # config, AGENTS.md and a sample document
npx docviz doctor   # which engines this machine can use
```

`docviz init` leaves an `AGENTS.md` with the full catalog of all 62 types and
their decision tables. Consult it when you need detail this summary does not
carry.
