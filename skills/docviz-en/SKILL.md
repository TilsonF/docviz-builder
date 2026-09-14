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

There are 57 types. Before writing a block, if you are not sure:

```bash
npx docviz suggest "the approval process for a request"  # recommends the type
npx docviz types --lang en                               # the catalog with purposes
npx docviz types sequence --lang en                      # one type, plus an example that compiles as-is
```

`docviz types <type>` prints the minimal skeleton. Copy it and fill it in: it is
the fastest way to not get the fields wrong.

## Workflow

```bash
npx docviz check docs-src                     # validate without drawing (fast)
npx docviz build docs-src --output docs       # compile to Markdown + SVG
npx docviz verify docs                        # check for broken images
npx docviz diff <previous docs-src> docs-src  # which diagrams changed
```

While writing, `npx docviz preview docs --watch` recompiles on save and reloads
the browser by itself.

Do not consider the task done while `check` or `verify` fail.

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

`docviz init` leaves an `AGENTS.md` with the full catalog of all 57 types and
their decision tables. Consult it when you need detail this summary does not
carry.
