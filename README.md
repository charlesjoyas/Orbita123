# Órbita

Un espacio de tareas en español para equipos pequeños. React + TypeScript + Vite, Zustand, Framer Motion, dnd-kit y canvas-confetti. Estilos CSS propios y responsive, sin un framework visual que condicione la identidad.

## Ejecutar

Requiere Node.js 22 o superior y pnpm 10.

```sh
pnpm install
pnpm dev
```

Abrir la dirección que imprime Vite (por defecto http://localhost:5173). En este equipo las dependencias ya están instaladas. También puedes abrir `Iniciar Órbita.cmd`, en la carpeta superior.

```sh
pnpm test
pnpm build
pnpm preview
```

La compilación estática queda en `dist/`. La PWA requiere HTTPS o localhost y se registra en la compilación de producción, no en desarrollo.

## Estructura

```text
src/
  components/   Tablero, tarjetas, detalle, vistas, creación rápida y diálogos
  data/         Repositorio abstracto, implementación local y datos iniciales
  lib/          Fechas locales, creación natural, recurrencia y pruebas
  types.ts      Modelo estricto de usuarios, tableros, tareas y actividad
  store.ts      Cambios reversibles y reglas de negocio
  App.tsx       Navegación, personalización, onboarding y comandos
  styles.css    Sistema visual, responsive, temas y movimiento reducido
public/         Manifest, iconos y service worker offline
```

## Entrega por fases

1. **Base:** múltiples tableros; columnas con nombre, color, emoji y límite WIP; tarjetas con asignación; reordenación de tarjetas y columnas con ratón, toque prolongado o teclado. La última columna representa completado y permanece al final al reordenar. Un límite WIP avisa, sin impedir avanzar.
2. **Detalle y velocidad:** panel modal, descripción con negrita/énfasis/listas básicas, checklists, progreso, etiquetas, fechas y horas, prioridades, bloqueos, comentarios, enlaces, archivos locales, filtros combinables, duplicación, conversión de pasos en tareas y deshacer/rehacer (40 cambios). Doble clic en títulos de tarjetas para editar en línea.
3. **Equipo y motivación:** Mi día con máximo tres tareas de foco, Tú y yo con carga estimada en puntos, pasar la pelota con nota, toque amistoso, reacciones en tareas y comentarios, disponibilidad, confeti, sonido opcional, rachas y resumen de los últimos siete días. Modo de concentración con temporizador de 25 minutos.
4. **Vistas y PWA:** Kanban, lista, calendario mensual y fechas de entrega en las próximas dos semanas; paleta Ctrl/Cmd+K, chuleta con `?`, atajos, plantillas de tareas y tableros, recurrencia diaria/semanal/mensual, onboarding, manifest e iconos instalables y caché offline de la aplicación. Los gestos sobre tarjetas permiten completar hacia la derecha y reasignar hacia la izquierda. Deslizar verticalmente desde el inicio comprueba el estado local; no consulta un servidor.
5. **Persistencia y pulido local:** actualización entre pestañas del mismo origen, identidades de perfil por pestaña, exportación/importación JSON, manejo de cuota de almacenamiento, temas, navegación móvil, etiquetas accesibles y foco contenido en los diálogos, arrastre por teclado, soporte de movimiento reducido y compilación separada en paquetes de React, animación y arrastre.

## Límites y lo que falta conectar

**La colaboración entre dispositivos todavía no está conectada.** Los perfiles son una simulación local; cambiar de perfil no autentica a una persona. Cada navegador tiene sus propios datos. La actualización entre pestañas usa el evento `storage`, no una conexión remota. En caso de ediciones simultáneas entre pestañas, prevalece el último estado escrito. No es una solución de resolución de conflictos.

El contrato `Repository` en `src/data/repository.ts` separa `load`, `save` y `subscribe`. Para colaboración real, el siguiente paso es un adaptador asíncrono con autenticación, permisos por tablero e invitaciones. Conviene guardar usuarios, miembros, tableros, columnas, tareas, comentarios y actividad en tablas separadas de Supabase, con RLS; emitir cambios por entidad con Realtime, y usar Storage para archivos. El store local actual conserva instantáneas: antes de conectar varios dispositivos hay que sustituir esa escritura por operaciones por entidad con revisión, cola offline y una política explícita de conflictos. No basta con añadir una URL o una clave al proyecto actual.

Las notificaciones dentro de la app funcionan localmente. Los avisos del sistema son opcionales y se emiten mientras hay una pestaña abierta y llegan actividades de otro perfil. **Los avisos push remotos con la app cerrada necesitan servidor, suscripciones y VAPID.** La instalación depende del navegador. La vista previa de desarrollo no activa el service worker.

Los archivos se guardan dentro de la copia local (máximo 750 KB por archivo, sujeto a la cuota del navegador); para contenido grande, usar enlaces. La importación pide una confirmación visible antes de reemplazar el espacio. La exportación incluye todo el espacio local.

La entrada natural reconoce nombres con `@`, `hoy`, `mañana`, fechas `AAAA-MM-DD`, horas `am/pm`, `#baja/#media/#alta/#urgente` y otras etiquetas. No depende de una API de IA ni promete entender cualquier frase. La recurrencia crea la siguiente ocurrencia al completar la actual, no ejecuta tareas con la aplicación cerrada. Las rachas representan días en que se completaron todas las tareas elegidas como foco. El foco se renueva cada día local.

La línea de tiempo sitúa entregas, porque el modelo no tiene una fecha de inicio ni una duración en días. La estimación de esfuerzo usa puntos. El resumen es un conteo real de los últimos siete días; no muestra récords ni rachas inventadas.

## Verificación

Las pruebas cubren interpretación natural, mediodía/medianoche, límites mensuales, rachas, recuperación de datos, recurrencia única, deshacer y fallos de almacenamiento. Se revisaron en navegador el onboarding, creación, checklist, comentario, persistencia tras recargar, arrastre entre columnas mediante teclado, vistas alternativas, sincronización entre pestañas y tamaños de escritorio/móvil. No se afirma una medición de 60 fps ni una auditoría WCAG completa. Probar con dispositivos reales y un backend compartido sigue siendo el siguiente paso antes de un uso colaborativo de producción.

Referencia de compilación: [documentación oficial de Vite](https://vite.dev/guide/static-deploy).

## Correcciones del 1 de noviembre de 2026

- La creación despeja filtros y vuelve al tablero para que una tarea nueva no quede oculta en Mi día, Actividad, Calendario o un filtro de otra persona.
- El botón + móvil abre un formulario con título, persona y columna. El botón de envío tiene texto visible; el cierre del formulario de columna se llama «Cerrar», en lugar de «Listo».
- Arrastrar a Hecho, completar una tarea recurrente y convertir un paso en tarea son operaciones reversibles completas, sin estados intermedios al deshacer.
- El doble clic edita en línea sin abrir el detalle antes; la flecha para pasar la pelota reasigna realmente. Las transformaciones del arrastre y las animaciones de tarjeta usan elementos separados.
- Los cambios de perfil pertenecen a cada pestaña y no entran en el historial de deshacer. Las asignaciones actualizan los miembros del tablero y quitan el foco de la persona anterior.
- El importador valida campos, referencias, fechas e identificadores antes de aceptar una copia. Un archivo inválido no conserva una confirmación de importación anterior. Los datos dañados se conservan en una copia de recuperación descargable desde el perfil.
- Las preferencias toleran almacenamiento bloqueado; el estado de guardado muestra los errores. Se rechazan fechas y horas imposibles y se reconocen horas de 24 horas.
- La PWA conserva la aplicación offline cuando aparece una pantalla de inicio de sesión, devuelve una respuesta válida si falta un recurso y solo limpia cachés de Órbita.

Se añadieron pruebas de interacción de React además de pruebas de lógica y del service worker. Los flujos principales también se comprobaron sobre la compilación de producción en el navegador.
