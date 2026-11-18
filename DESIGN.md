# Sistema de diseño de Órbita

## Demostraciones

- [Tablero claro](https://orbita123-ten.vercel.app/design.html) y [tablero oscuro](https://orbita123-ten.vercel.app/design.html?tema=oscuro).
- [Tarjeta en arrastre y zona activa](https://orbita123-ten.vercel.app/design.html?arrastre=1).
- [Biblioteca clara](https://orbita123-ten.vercel.app/design.html?componentes=1) y [biblioteca oscura](https://orbita123-ten.vercel.app/design.html?componentes=1&tema=oscuro).

Los ejemplos muestran ocho tareas de un lanzamiento editorial ficticio. La demostración funciona en memoria y no envía cambios al espacio del equipo. En local, abre `/design.html` tras ejecutar `pnpm dev`.

## Tokens compartidos

Los valores se declaran en `src/design.css`. Las proporciones se calcularon con luminancia relativa sRGB sobre el par indicado. Los umbrales son 4,5:1 para texto normal y 3:1 para texto grande, iconos funcionales y estados que dependen de un borde visible. [Contraste de texto, W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [Contraste de controles, W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

| Token o par | Claro | Oscuro | Claro / oscuro |
| --- | --- | --- | ---: |
| Fondo | `#F4EEFC` | `#171220` | |
| Superficie | `#FAF7FF` | `#21192D` | |
| Tarjeta | `#FFFFFF` | `#2B2138` | |
| Elevado | `#EFE5FB` | `#382B49` | |
| Texto principal sobre fondo | `#241834` | `#F7F0FF` | 14,72 / 16,49 |
| Texto secundario sobre tarjeta | `#4C3E60` | `#E0D2EF` | 9,70 / 10,62 |
| Texto terciario sobre elevado | `#655577` | `#C4B3D7` | 5,54 / 6,69 |
| Borde de control sobre tarjeta | `#817091` | `#A18DB8` | 4,51 / 5,09 |
| Separador decorativo | `#E2D6EF` | `#524264` | |
| Foco sobre elevado | `#6A38B7` | `#D2B6FF` | 6,03 / 7,38 |
| Texto del botón primario | `#FFFFFF` sobre `#6232A5` | `#211132` sobre `#C6A3FF` | 8,34 / 8,47 |
| Acento en chip | `#6232A5` sobre `#EAE0FB` | `#C6A3FF` sobre `#483562` | 6,57 / 5,14 |
| Éxito | `#235D4A` sobre `#E0F2E9` | `#98DFBD` sobre `#233F36` | 6,60 / 7,42 |
| Advertencia | `#80430B` sobre `#FAEBD4` | `#FFCD91` sobre `#493521` | 6,57 / 7,93 |
| Información | `#295788` sobre `#E2EDFC` | `#AACDFF` sobre `#2B3B58` | 6,31 / 6,89 |
| Peligro | `#9C3050` sobre `#FCE6ED` | `#FFABC3` sobre `#502A3E` | 5,99 / 6,81 |
| Contador Por hacer | `#795609` sobre `#F5ECCB` | `#EFD082` sobre `#4B3C24` | 5,64 / 7,11 |
| Contador En marcha | `#A0491C` sobre `#FAEBD4` | `#FFB58B` sobre `#493521` | 5,17 / 6,74 |
| Contador En revisión | `#5142A8` sobre `#E2EDFC` | `#C2B6FF` sobre `#2B3B58` | 6,59 / 6,11 |
| Contador Hecho | Par de éxito | Par de éxito | 6,60 / 7,42 |

- **Tipografía** · Outfit para marca, título y cifras de progreso. DM Sans para controles y contenido. 12 px en etiquetas y metadatos, 13–14 px en controles, 15 px en títulos de tarjeta y 25–38 px en el título protagonista.
- **Espaciado** · Base de 4 px con pasos de 4, 8, 12, 16, 20, 24, 28 y 32 px. Radios de 8 px para controles, 12 px para tarjetas y 16 px para paneles. Los chips usan una forma de píldora.
- **Elevación** · Claro `0 1px 2px #35224B14, 0 2px 6px #35224B0A` para tarjetas y `0 12px 28px #35224B24, 0 2px 6px #35224B12` para menús y arrastre. Oscuro `0 1px 3px #08050F4D` para tarjetas y `0 14px 30px #08050F8C, 0 2px 6px #08050F80` para elevado.

## Componentes y comportamiento

| Componente | Decisión |
| --- | --- |
| Botones y chips | Primario morado, secundario lavanda y fantasma sin relleno. El foco usa un contorno de 2 px con separación de 3 px. Los controles principales tienen un área táctil de 44 px en móvil. |
| Insignias y avatares | Los no leídos muestran una cifra. La selección de navegación combina una marca lateral y un nombre en negrita. La pila de la tarjeta muestra el avatar de la persona asignada primero y, si corresponde, el de otra persona que comentó. |
| Tarjetas | Mínima para títulos simples, estándar con prioridad, etiquetas y fecha, completa con subtareas, comentarios y adjuntos. En reposo hay un borde suave, al pasar el cursor sube la elevación, el foco tiene contorno, la selección usa el acento, el arrastre muestra inclinación, completada muestra un check y vencida incluye texto explícito junto a la fecha. |
| Columnas | Color de estado en barra y contador. Los límites WIP muestran ocupación y capacidad. La zona vacía indica dónde soltar. Al arrastrar, el destino se resalta y muestra una instrucción. «Añadir columna» tiene un botón con texto separado al pie. |
| Navegación | Secciones Personal, Tableros y Equipo. Los nombres se truncan con tooltip. En escritorio se puede colapsar la barra y en tablet se compacta automáticamente. En móvil se usa una barra inferior y el tablero encaja por columna. |
| Captura | Los chips permiten elegir persona, fecha y etiquetas. El botón «Captura inteligente» activa la interpretación local de menciones, fechas y etiquetas al escribir. Pulsa `N` para enfocar la captura y `Ctrl/Cmd + K` para abrir la búsqueda. |
| Guardado | El chip de la cabecera muestra guardado, guardando, sin conexión o cambios sin guardar. Si falla una escritura ofrece reintentar. |

## Microinteracciones

| Acción | Respuesta | Duración y curva |
| --- | --- | --- |
| Completar | El check pasa por un pico de escala de 1,12. El contador cambia inmediatamente y la barra avanza. Se lanzan 18 partículas de confeti. | Check y contador 180 ms, barra 240 ms. `cubic-bezier(.2,.8,.2,1)`. |
| Añadir | Aparece la tarjeta con un desplazamiento de 12 px y un cambio de opacidad. Se devuelve el foco al campo de captura. | 180 ms, `cubic-bezier(.2,.8,.2,1)`. |
| Racha | Al cambiar la cifra, el indicador realiza un pulso breve. | 220 ms, `cubic-bezier(.2,.8,.2,1)`. |
| Controles | Cambio de fondo, texto o borde ante interacción. | 140 ms. |

Con movimiento reducido se omiten el confeti, el desplazamiento al crear y las animaciones de progreso y racha.

## Contrastes corregidos en modo oscuro

| Elemento | Antes | Después |
| --- | --- | --- |
| Wordmark | `#454250` sobre `#25212D` · 1,61:1 | `#F7F0FF` sobre `#21192D` · 15,19:1 |
| Icono del selector de espacio | `#9A88C5` sobre `#3A2F49` · 3,98:1 | `#C6A3FF` sobre `#483562` · 5,14:1 |
| Tablero activo en la barra lateral | `#7D65B0` sobre `#3A2F49` · 2,59:1 | `#C6A3FF` sobre `#483562` · 5,14:1 |
| Contador de Por hacer | `#887395` sobre `#211E29` · 3,85:1 | `#EFD082` sobre `#4B3C24` · 7,11:1 |
| Botón Añadir habilitado | `#FFFFFF` sobre `#A28AC7` · 3,00:1 | `#211132` sobre `#C6A3FF` · 8,47:1 |
| Texto de ejemplo en la captura | `#92809F` sobre `#2B2733` · 4,03:1 | `#C4B3D7` sobre `#2B2138` · 7,82:1 |

## Justificación

- El título y la captura concentran las acciones de entrada. El saludo y la fecha quedan en una línea secundaria. La vista de escritorio usa el espacio horizontal para que el progreso no añada altura sobre el Kanban.
- Cuatro superficies con valores distintos separan la aplicación, las columnas, las tarjetas y los elementos elevados. Los estados importantes conservan una señal de texto o icono.
- Los metadatos aparecen solo cuando existen. El título, el check y el asa quedan en la misma fila. Así las tarjetas sencillas hacen espacio a las tareas que tienen más información.
- Las pestañas permanecen visibles al desplazar la página. Las flechas, Inicio y Fin recorren las vistas. En pantallas estrechas, el desplazamiento horizontal ocurre dentro del tablero.

La revisión en navegador cubrió 1280 × 768 px, 768 px y 390 px. A 1280 × 768 se ven dos tarjetas completas por columna en ambos temas con los datos de muestra. También se probó la captura con teclado, el selector de persona y la apertura de los estados de arrastre y biblioteca.
