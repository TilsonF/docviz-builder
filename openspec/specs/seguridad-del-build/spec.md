# Seguridad del build

## Purpose

El compilador procesa documentación que puede ser confidencial y bloques
escritos por un modelo de lenguaje. Ninguna de las dos cosas puede convertirse
en una vía para filtrar información, leer el disco o ejecutar código.

## Requirements

### Requirement: Ningún contenido sale del proceso por defecto

El build **MUST** completarse sin realizar ninguna petición de red cuando el
backend es `local`, que **MUST** ser el valor por defecto.

Documentación de arquitectura, credenciales mencionadas de pasada, nombres de
sistemas internos: enviar todo eso a un servicio de terceros para que dibuje un
rectángulo es un intercambio inaceptable. Que el modo seguro sea el
predeterminado —y no una opción que haya que recordar activar— es la diferencia
entre una política y una intención.

#### Scenario: Build sin configuración
- **DADO** un proyecto sin `docviz.config.yaml`
- **CUANDO** se compila un documento con los seis motores
- **ENTONCES** no se abre ninguna conexión de red

### Requirement: El servicio público de Kroki está bloqueado

La configuración **MUST** rechazar `kroki.io` salvo que se active de forma
explícita `renderers.kroki.allowPublicService`, y **MUST** rechazar cualquier
host no local salvo que se active `renderers.kroki.allowRemoteHost`.

Apuntar a Kroki es legítimo; apuntar al Kroki público con documentación interna
es una fuga. La barrera obliga a que alguien tome la decisión conscientemente y
la deje escrita en el repositorio.

#### Scenario: URL pública
- **DADO** `renderers.kroki.url: https://kroki.io` sin autorización explícita
- **CUANDO** se carga la configuración
- **ENTONCES** falla indicando que el servicio público está bloqueado

#### Scenario: Instancia corporativa
- **DADO** una URL remota con `allowRemoteHost: true`
- **CUANDO** se carga la configuración
- **ENTONCES** se acepta

### Requirement: Los diagramas no acceden al sistema de archivos

El renderer de PlantUML **MUST** rechazar `!include`, `!includeurl` e `!import`,
y **MUST** alimentar el motor por entrada estándar en lugar de por ruta de
archivo. El renderer de Vega-Lite **MUST** rechazar `data.url` a cualquier
profundidad de la especificación.

Ambas directivas convierten un diagrama en un lector de archivos o en un cliente
HTTP. Un bloque generado por un LLM —o copiado de una fuente no confiable—
podría así exfiltrar `/etc/passwd` o llamar a una URL controlada por un tercero.

#### Scenario: Inclusión de archivo
- **DADO** un bloque PlantUML con `!include /etc/passwd`
- **CUANDO** se compila
- **ENTONCES** el build falla indicando que la directiva está deshabilitada

#### Scenario: Datos remotos anidados
- **DADO** una especificación Vega-Lite con `data.url` dentro de una capa
- **CUANDO** se compila
- **ENTONCES** el build falla indicando dónde está la carga remota

### Requirement: Toda escritura queda contenida en el directorio de salida

El sistema **MUST** validar cada ruta de escritura contra el directorio de
salida configurado, y **MUST** rechazar recorridos `..`, rutas absolutas y bytes
nulos.

El nombre de un recurso deriva del título del diagrama, que viene del documento.
Sin contención, un título malicioso podría escribir fuera del árbol del
proyecto.

#### Scenario: Título con recorrido de directorios
- **DADO** un diagrama titulado `../../../../etc/passwd`
- **CUANDO** se compila
- **ENTONCES** el nombre generado es un slug ASCII contenido en `assets/generated`

#### Scenario: assetsDir fuera de la salida
- **DADO** `output.assetsDir: ../fuera`
- **CUANDO** se carga la configuración
- **ENTONCES** falla indicando que no puede apuntar fuera del directorio de salida

### Requirement: Los SVG generados no ejecutan código

Todo SVG **MUST** pasar por un saneado que elimine elementos `script`,
manejadores de eventos inline y URLs `javascript:`.

Un SVG es un documento activo. Si más adelante se incrusta en un portal —dentro
de HTML, no como `<img>`— un script embebido se ejecutaría con el origen de ese
portal. Sanear en el momento de generar evita depender de cómo se consuma
después.

#### Scenario: SVG con script
- **DADO** un motor que emite un elemento `script` dentro del SVG
- **CUANDO** se escribe el recurso
- **ENTONCES** el archivo resultante no contiene ningún script
- **Y** conserva intacto el contenido gráfico

### Requirement: Límites de tiempo y tamaño

Cada render **MUST** tener un límite de tiempo y cada recurso generado **MUST**
tener un límite de tamaño, ambos configurables.

Un diagrama con un ciclo o con miles de nodos puede colgar el build o agotar la
memoria de la máquina de integración continua. Un límite convierte un bloqueo
indefinido en un error diagnosticable.

#### Scenario: Render que no termina
- **DADO** un diagrama cuyo render supera `renderers.timeoutMs`
- **CUANDO** se compila
- **ENTONCES** el build falla indicando el límite superado

#### Scenario: Recurso desproporcionado
- **DADO** un diagrama cuyo SVG supera `renderers.maxOutputBytes`
- **CUANDO** se compila
- **ENTONCES** el build falla sugiriendo dividir el diagrama o subir el límite
