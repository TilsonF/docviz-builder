---
title: Arquitectura de DocViz Builder
---

# Arquitectura de DocViz Builder

DocViz Builder convierte bloques declarativos escritos dentro de Markdown en
imágenes SVG, y reescribe el documento para que quede como **Markdown estándar y
portable**: quien lo lee no necesita saber que existieron PlantUML, Mermaid, D2,
Vega-Lite, Graphviz ni LikeC4.

## Capas

![Contenedores de DocViz Builder](./assets/generated/contenedores-de-docviz-builder-dc1c0ff3e9f6.svg)

## Recorrido de un bloque

![Del bloque declarativo a la imagen](./assets/generated/del-bloque-declarativo-a-la-imagen-1b769ee1342b.svg)

## Estados de un recurso

![Ciclo de vida de un recurso generado](./assets/generated/ciclo-de-vida-de-un-recurso-generado-16e649a41c31.svg)

## Dependencias internas

![Dependencias entre módulos](./assets/generated/dependencias-entre-modulos-f94993987604.svg)

## Decisiones de diseño

| Decisión | Motivo |
|---|---|
| Reemplazo por posición en lugar de reserializar | Reserializar con `remark-stringify` normalizaría viñetas, comillas y saltos; el criterio de aceptación exige mantener intacto el resto del Markdown |
| Motores locales por defecto | La documentación puede ser confidencial: nada sale del proceso salvo que se configure un Kroki propio |
| El hash incluye el tema y la versión del motor | Cambiar un color o actualizar PlantUML debe invalidar las imágenes afectadas, no todas |
| Emisor SVG propio para LikeC4 | La exportación oficial exige un navegador con Playwright; el emisor propio mantiene LikeC4 tan offline como el resto y respeta el tema |
| Identificadores del SVG renumerados | Vega mantiene un contador global por proceso: sin renumerar, el mismo gráfico produce bytes distintos y el caché deja de ser determinista |
