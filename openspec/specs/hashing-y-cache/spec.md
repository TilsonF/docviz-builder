# Hashing y caché de recursos

## Purpose

Que compilar dos veces el mismo documento produzca exactamente el mismo
resultado sin rehacer el trabajo, y que un cambio invalide solo lo que
realmente afecta.

## Requirements

### Requirement: La identidad del recurso es su contenido efectivo

El nombre de cada recurso **MUST** derivarse de un hash SHA256 que incluya el
tipo de renderer, la fuente, el nombre del tema, la huella de contenido del
tema, la versión del motor y el formato de salida.

Cada componente responde a una invalidación concreta: cambiar el diagrama,
cambiar de tema, retocar un color dentro del mismo tema, actualizar PlantUML o
pedir PNG en lugar de SVG producen imágenes distintas y deben producir nombres
distintos. Omitir cualquiera de ellos deja imágenes obsoletas publicadas.

#### Scenario: Cambio de fuente
- **DADO** un diagrama ya compilado
- **CUANDO** se modifica su código y se recompila
- **ENTONCES** se genera un recurso con hash distinto

#### Scenario: Retoque de un color del tema
- **DADO** un proyecto compilado con el tema `corporate`
- **CUANDO** se modifica un color de ese tema sin cambiar su nombre
- **ENTONCES** los recursos afectados se regeneran

#### Scenario: Actualización del motor
- **DADO** un diagrama compilado con una versión de PlantUML
- **CUANDO** se actualiza PlantUML y se recompila
- **ENTONCES** el recurso se regenera
- **Y** los diagramas de otros motores conservan su hash

### Requirement: El truncado del hash exige detección de colisiones

El hash **MAY** truncarse a entre 8 y 16 caracteres, y el build **MUST** abortar
si dos fuentes distintas producen el mismo prefijo.

Truncar acorta los nombres de archivo, que es deseable. Pero sin detección, una
colisión haría que un diagrama sobrescribiera silenciosamente a otro y el
documento mostraría la imagen equivocada. Detectarla convierte un fallo
silencioso en un error explícito con instrucción de solución.

#### Scenario: Colisión de prefijo
- **DADO** dos diagramas distintos cuyos hashes truncados coinciden
- **CUANDO** se compila
- **ENTONCES** el build falla
- **Y** el mensaje indica que se aumente `hash.length`

### Requirement: Determinismo byte a byte

El mismo diagrama renderizado dos veces **MUST** producir bytes idénticos,
incluso dentro del mismo proceso.

El modelo de caché se apoya en que el contenido es función de la entrada. Vega
mantiene un contador global de identificadores por proceso y Mermaid usa el
identificador de render como prefijo de sus clases CSS: sin normalizar ambos, el
mismo gráfico produce dos archivos distintos y el `git diff` se llena de ruido.

#### Scenario: Doble render en el mismo proceso
- **DADO** un gráfico Vega-Lite
- **CUANDO** se renderiza dos veces sin reiniciar el proceso
- **ENTONCES** ambos resultados son idénticos byte a byte

#### Scenario: Renumeración de identificadores
- **DADO** un SVG cuya hoja de estilos está acotada por el identificador del elemento raíz
- **CUANDO** se normalizan los identificadores
- **ENTONCES** los selectores CSS se reescriben con el nuevo identificador
- **Y** el diagrama conserva todos sus estilos

### Requirement: El caché sobrevive a la limpieza de la salida

El caché **MUST** residir fuera del directorio de salida.

`--clean` existe para eliminar recursos huérfanos de compilaciones anteriores.
Si borrara también el caché, cada limpieza costaría un build completo y el
equipo dejaría de usar la opción.

#### Scenario: Build limpio tras un build previo
- **DADO** un proyecto ya compilado
- **CUANDO** se compila de nuevo con `--clean`
- **ENTONCES** el directorio de salida se regenera por completo
- **Y** todos los diagramas se resuelven desde el caché

#### Scenario: Segundo build sin cambios
- **DADO** un proyecto con N diagramas ya compilados
- **CUANDO** se compila de nuevo sin modificar nada
- **ENTONCES** se regeneran 0 diagramas
- **Y** se registran N aciertos de caché

#### Scenario: Cambio en un único diagrama
- **DADO** un proyecto con N diagramas ya compilados
- **CUANDO** se modifica uno solo y se recompila
- **ENTONCES** se regenera 1 diagrama
- **Y** se registran N-1 aciertos de caché
