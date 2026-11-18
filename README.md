# Órbita

Aplicación de tareas en español para equipos pequeños. Usa React, TypeScript y Vite en el navegador, con Node.js y SQLite en el servidor. El espacio compartido admite administradores, miembros y usuarios de solo lectura.

## Desarrollo local

Requiere Node.js 24 y pnpm 10. Ejecuta los comandos desde esta carpeta.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abre la dirección que imprime Vite. En Windows también puedes usar `Iniciar Órbita.cmd` desde la carpeta superior. Crea el primer administrador desde la pantalla de bienvenida. La base local se guarda en `.data/orbita.sqlite`.

## Producción

`pnpm build` compila la interfaz en `dist/`. `pnpm start` sirve el compilado y la API con un archivo SQLite en disco persistente. Vercel ejecuta la API con Turso. [Cuentas, despliegue y copias de seguridad](./AUTH.md)

## Funciones

- Tableros Kanban con columnas editables, límites de trabajo en curso y arrastre por ratón, teclado o pantalla táctil. Vistas de lista, calendario y próximos vencimientos.
- Tareas con asignación, prioridades, fechas, etiquetas, checklists, comentarios, reacciones, archivos y enlaces. Puedes crear tareas desde plantillas o escribir el título con fechas y etiquetas en el campo rápido.
- Al completar una tarea recurrente se crea su siguiente ocurrencia. El temporizador de foco, las rachas y el resumen se basan en la actividad registrada.
- Inicio de sesión con correo y contraseña. Los administradores crean invitaciones y gestionan roles y cuentas. Los cambios llegan a otras sesiones mediante consultas cada siete segundos. En un conflicto se conserva un borrador que puede descargarse desde el perfil.
- PWA instalable bajo HTTPS o localhost. La caché permite cargar la interfaz. La sesión y la colaboración requieren conexión con el servidor. Los avisos de actividad funcionan con la app abierta.

## Verificación

```sh
pnpm test
pnpm build
pnpm audit --prod
```

Las pruebas cubren autenticación y permisos, persistencia y transacciones SQLite, sincronización, creación y recurrencia de tareas, deshacer, controles de interfaz y caché de la PWA.
