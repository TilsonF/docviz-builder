---
title: DocViz Builder — showcase
theme: corporate
---

# DocViz Builder — showcase

Este documento existe para la validación manual: contiene al menos una
visualización de cada motor soportado, escritas tanto en el lenguaje nativo del
motor como en el DSL de alto nivel de DocViz.

Al compilarlo, **todos** los bloques de abajo deben convertirse en imágenes
Markdown estándar con rutas relativas. El documento resultante debe poder
moverse junto a su carpeta `assets/` sin perder ninguna imagen.

| Sección | Motor | Escrito en |
|---|---|---|
| Contexto del sistema | LikeC4 | DSL `architecture` |
| Contenedores | LikeC4 | LikeC4 nativo |
| Autenticación | PlantUML | DSL `diagram` |
| Modelo de dominio | PlantUML | DSL `diagram` |
| Ciclo de vida | PlantUML | PlantUML nativo |
| Publicación de documentación | Mermaid | DSL `diagram` |
| Plan de entregas | Mermaid | DSL `diagram` |
| Estrategia de calidad | D2 | DSL `diagram` |
| Mapa de capacidades | D2 | DSL `diagram` |
| Defectos por sprint | Vega-Lite | DSL `chart` |
| Cobertura por disciplina | Vega-Lite | DSL `chart` |
| Dependencias entre módulos | Graphviz | DSL `diagram` |

---

## 1. C4 — Contexto del sistema

Quién usa la plataforma y con qué sistemas habla. Escrito con el DSL
`architecture`: el autor no elige tecnología.

![Contexto de la plataforma de documentación](./assets/generated/contexto-de-la-plataforma-de-documentacion-daa8d8ce02d9.svg)

---

## 2. C4 — Contenedores

El mismo modelo un nivel más abajo, esta vez escrito directamente en LikeC4
para mostrar que el lenguaje nativo sigue disponible.

![Contenedores de DocViz](./assets/generated/contenedores-de-docviz-5efa6d04d096.svg)

---

## 3. UML Sequence — Autenticación

![Autenticación de usuario](./assets/generated/autenticacion-de-usuario-7319772b57b0.svg)

---

## 4. UML Class — Modelo de dominio

![Modelo de dominio de DocViz](./assets/generated/modelo-de-dominio-de-docviz-0c8990947dc3.svg)

---

## 5. UML State — Ciclo de vida de un recurso

Escrito en PlantUML nativo.

![Ciclo de vida de un recurso](./assets/generated/ciclo-de-vida-de-un-recurso-c48d11d1888f.svg)

---

## 6. Mermaid Flowchart — Publicación de documentación

![Flujo de publicación de documentación](./assets/generated/flujo-de-publicacion-de-documentacion-09447454335a.svg)

---

## 7. Mermaid Gantt — Plan de entregas

![Plan de adopción de DocViz](./assets/generated/plan-de-adopcion-de-docviz-bf7acf314440.svg)

---

## 8. D2 Strategy Tree — Estrategia de calidad

![Estrategia de reducción de defectos](./assets/generated/estrategia-de-reduccion-de-defectos-e18092846a3b.svg)

---

## 9. D2 Capability Map — Mapa de capacidades

![Capacidades de la fábrica de software](./assets/generated/capacidades-de-la-fabrica-de-software-43ca2fd8f97c.svg)

---

## 10. Vega-Lite Bar Chart — Defectos por sprint

![Defectos por sprint](./assets/generated/defectos-por-sprint-6c7a10cc3ced.svg)

---

## 11. Vega-Lite Line Chart — Cobertura por disciplina

![Evolución de la cobertura de pruebas](./assets/generated/evolucion-de-la-cobertura-de-pruebas-74e948876854.svg)

---

## 12. Graphviz — Dependencias entre módulos

![Dependencias internas de DocViz](./assets/generated/dependencias-internas-de-docviz-033485a73eaa.svg)

---

## Lo que no se toca

Los bloques de código que no son visualizaciones se conservan tal cual:

```typescript
export interface DiagramRenderer {
  readonly type: string;
  render(source: string, options: RenderOptions): Promise<RenderResult>;
}
```

```bash
npm run docs:check && npm run docs:build && npm run docs:test
```

```json
{ "formats": { "plantuml": "svg", "likec4": "svg" } }
```

Y el Markdown normal —listas, tablas, énfasis, enlaces— llega intacto al
documento compilado.
