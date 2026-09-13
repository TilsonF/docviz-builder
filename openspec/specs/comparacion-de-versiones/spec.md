# Comparación entre dos versiones de la documentación

## Purpose

Saber qué diagramas cambiaron entre dos versiones, sin dibujar ninguno y sin
tener que confiar en el diff textual del Markdown.

## Requirements

### Requirement: La comparación habla de diagramas, no de archivos

El sistema **MUST** clasificar cada diagrama de las dos versiones como nuevo,
eliminado, modificado o igual, indicando documento, título y línea.

El diff de un `.md` muestra que se tocó un bloque YAML, pero no si el dibujo
resultante es distinto; y quien revisa un cambio de documentación necesita
justamente eso para saber qué mirar.

#### Scenario: Un diagrama ampliado y otro añadido
- **DADO** una versión anterior con dos diagramas y una nueva con esos dos, uno de ellos ampliado, más un tercero
- **CUANDO** se comparan
- **ENTONCES** el reporte marca uno como modificado, uno como igual y uno como nuevo

### Requirement: Lo que se compara es el contenido efectivo

La identidad de un diagrama **MUST** derivarse del motor y de la fuente
compilada, y **MUST NOT** depender del tema, de la versión del motor ni del
nombre del recurso generado.

El nombre del recurso cambia cuando cambia el tema o se actualiza PlantUML, y
ninguna de esas dos cosas es un cambio de diagrama. Una comparación que las
reportara obligaría a revisar de nuevo todo el documento sin motivo.

#### Scenario: Cambio de tema
- **DADO** dos versiones idénticas compiladas con temas distintos
- **CUANDO** se comparan
- **ENTONCES** ningún diagrama aparece como modificado

### Requirement: Mover un diagrama no lo convierte en nuevo

La identidad **MUST** basarse en el documento y el título, no en la línea.

Insertar un párrafo al principio de un documento desplaza todos sus bloques. Un
reporte que marcara doce diagramas como nuevos por eso sería ruido, y el ruido
hace que se deje de leer el reporte.

#### Scenario: Párrafo insertado antes de los diagramas
- **DADO** una versión nueva idéntica salvo por un párrafo añadido al principio
- **CUANDO** se comparan
- **ENTONCES** los diagramas aparecen como iguales
- **Y** la línea reportada es la de la versión nueva

### Requirement: Una versión rota no impide comparar

Un bloque que no se puede interpretar **MUST** reportarse indicando de qué lado
está, y **MUST NOT** abortar la comparación.

La versión anterior puede estar rota —es historia, ya no se puede arreglar— y
aun así interesa saber qué cambió respecto a ella.

#### Scenario: Bloque inválido en la versión anterior
- **DADO** una versión anterior con un bloque inválido y otro correcto
- **CUANDO** se comparan
- **ENTONCES** el bloque inválido se reporta como aviso del lado `base`
- **Y** el bloque correcto se compara con normalidad

### Requirement: La comparación encaja en un pipeline

El sistema **MUST** ofrecer la comparación en JSON y **MUST** poder terminar con
código distinto de cero cuando haya cambios.

Es lo que permite que un pipeline pida revisión humana solo cuando la
documentación visual cambió de verdad, en lugar de en cada commit que toque un
`.md`.

#### Scenario: Comparación sin cambios en un pipeline
- **DADO** dos versiones con los mismos diagramas
- **CUANDO** se comparan pidiendo código de salida
- **ENTONCES** el proceso termina con código cero
