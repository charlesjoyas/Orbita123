# Cuentas y roles de Órbita

Órbita guarda usuarios, sesiones, invitaciones y tareas en SQLite. El desarrollo local usa un archivo. En Vercel, la API usa SQLite remoto mediante Turso.

## Probar en este equipo

Abre **Iniciar Órbita.cmd**, en la carpeta superior, o ejecuta `pnpm dev` en esta carpeta. Requiere Node.js 24. La aplicación y la API se sirven juntas en la dirección que imprime Vite.

La primera entrada permite crear tu cuenta administradora. Puedes conservar los tableros y tareas del navegador; los perfiles simulados se sustituyen por tu cuenta y después puedes reasignar las tareas a personas reales.

SQLite guarda los datos en `.data/orbita.sqlite`, una carpeta excluida de Git. No se entregan contraseñas predeterminadas ni usuarios de prueba dentro de esa base. La comprobación del navegador usa una base distinta en `.sites-runtime/`.

Después de entrar, abre **Nuestro equipo → Crear usuario por invitación**. Escribe el correo y el rol y comparte el enlace directamente con esa persona. El enlace caduca en siete días y sirve una vez. Generar otro para el mismo correo invalida el anterior. Si se desactiva a quien invitó o pierde su rol de administrador, sus invitaciones pendientes se revocan. El espacio tiene un máximo de 10 cuentas.

## Roles del espacio

| Rol | Permisos |
| --- | --- |
| Administrador | Trabaja con tareas y administra tableros, columnas, usuarios y roles. Puede activar o desactivar cuentas. |
| Miembro | Crea, edita, asigna, mueve y completa tareas; usa comentarios, checklists y reacciones. |
| Solo lectura | Consulta el espacio, sus tareas y su actividad; puede editar su propio perfil y contraseña. |

Los roles son del espacio compartido, no un permiso distinto por cada tarjeta. Las verificaciones se hacen en la API, además de adaptar los controles visibles. Siempre debe quedar al menos un administrador activo. La desactivación de una cuenta revoca sus sesiones.

El cambio de contraseña está en el perfil y revoca las otras sesiones. Las invitaciones se comparten manualmente. La recuperación automática de contraseña por correo queda pendiente.

## Despliegue de producción

El servidor Node sirve el frontend y la API desde el mismo origen. Configura una instancia con un volumen local persistente y un proxy HTTPS. Usa `/healthz` para verificar que el servidor puede consultar la base de datos.

- `ORBITA_DB_PATH` debe ser una ruta absoluta al archivo en el volumen persistente.
- `APP_ORIGIN` debe ser el origen HTTPS que visitarán los usuarios, sin barra al final. Para validar en la propia máquina también se admite HTTP en loopback.
- `SETUP_TOKEN` es obligatorio en una base vacía. Genera un código con el comando siguiente y consérvalo como secreto del servidor hasta crear la primera cuenta.
- `HOST` y `PORT` controlan la escucha de Node. Por defecto usa `127.0.0.1:8080`; la imagen Docker escucha en `0.0.0.0:8080`. Haz que el proxy HTTPS reenvíe las peticiones a ese puerto y permita cuerpos de hasta 6 MiB.

Ejecuta estos comandos en la carpeta de Órbita con Node.js 24 y pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# Configura las variables del entorno o crea .env.local a partir de .env.example.
pnpm start
```

Con Docker, define `APP_ORIGIN` y `SETUP_TOKEN` en un archivo privado de entorno. La imagen ya apunta a `/data/orbita.sqlite`.

```sh
docker build -t orbita .
docker volume create orbita-data
docker run -d --name orbita --restart unless-stopped --env-file .env.production \
  -p 127.0.0.1:8080:8080 -v orbita-data:/data orbita
```

El esquema se prepara automáticamente al abrir SQLite. En la primera visita al dominio público, crea la cuenta administradora con el código de configuración. Comprueba el inicio de sesión, crea una tarea, reinicia el servicio y vuelve a comprobar la tarea. Retira `SETUP_TOKEN` del entorno después de configurar el administrador.

### Vercel con Turso

Importa el proyecto de Órbita como Vite con Node.js 24. `vercel.json` incluye el compilado estático y la API en la región de São Paulo. Configura estas variables de servidor en el proyecto de Vercel.

| Variable | Valor |
| --- | --- |
| `TURSO_DATABASE_URL` | URL `libsql://` de la base remota |
| `TURSO_AUTH_TOKEN` | Token de base con permisos de lectura y escritura |
| `APP_ORIGIN` | Origen HTTPS exacto que abrirá el equipo, sin barra final |
| `SETUP_TOKEN` | Código aleatorio de al menos 32 caracteres para el alta inicial |

La API prepara el esquema en el primer arranque. Para inicializar Turso de forma explícita, define las credenciales en el entorno y ejecuta `pnpm db:migrate --turso`. El comando es idempotente y conserva los datos existentes. El archivo de desarrollo conserva sus propios datos. Para llevar tareas a una base remota vacía, exporta un JSON local e impórtalo desde el formulario del primer administrador. El mantenimiento de copias de la instancia remota se hace desde Turso. [Turso para Vercel](https://docs.turso.tech/integrations/vercel)

Verifica `/api/session` desde el dominio público, crea el administrador si el espacio está vacío y comprueba una tarea desde otra sesión. Configura un origen y una base de prueba propios para los despliegues de vista previa. Los cuerpos de escritura se limitan a 4 MiB en Vercel. [Límites de Vercel Functions](https://vercel.com/docs/functions/limitations#request-body-size)

### Copias y restauración

Ejecuta `pnpm db:backup /ruta/nueva/orbita.sqlite` con el mismo `ORBITA_DB_PATH` del servidor. El comando crea una copia consistente aunque la aplicación esté abierta y verifica el archivo con SQLite. En Docker puedes hacerlo con `docker exec orbita node scripts/backup.mjs /data/copia.sqlite` y sacar la copia del volumen con `docker cp`. Conserva las copias con acceso restringido porque contienen cuentas, sesiones y tareas.

Para restaurar, detén el servicio y copia el respaldo a un archivo nuevo en un directorio persistente. Actualiza `ORBITA_DB_PATH` y arranca con ese archivo, evitando mezclarlo con el WAL de otra base. Conserva la base anterior hasta comprobar login y tareas. La exportación JSON del perfil contiene el espacio y puede importarse durante el alta inicial. Un administrador puede importar copias compatibles del mismo espacio.

## Arquitectura

- `server/api.ts`: inicio y cierre de sesión, creación por invitación, perfiles, contraseña, permisos y estado compartido.
- `server/security.ts`: scrypt con sal aleatoria; comparación segura de hashes y tokens.
- `server/db.ts`: consultas parametrizadas y transacciones con SQLite como único motor.
- `server/start.ts` atiende la aplicación en producción y `server/vite-api.ts` sirve la API durante el desarrollo.
- `src/auth/`: pantallas de acceso, administración de cuentas y conexión del estado al servidor.

Las sesiones usan tokens aleatorios, se guardan como hash en la base y viajan en cookies HttpOnly, SameSite y Secure bajo HTTPS. No se guardan contraseñas ni tokens de sesión en localStorage. La API comprueba el origen y el encabezado de las peticiones de escritura y limita los intentos de acceso.

El espacio compartido se actualiza mediante consulta al servidor cada siete segundos. Las escrituras usan una revisión para evitar sobrescribir silenciosamente cambios de otra sesión. Si hay un conflicto, se recupera el estado del servidor y se conserva una copia local del borrador, descargable desde el perfil. No se presenta como sincronización por WebSocket.

Cada archivo adjunto admite hasta 750 KB. El formulario reserva espacio para cambios futuros y reduce el límite total de adjuntos para que el espacio pueda guardarse en Vercel. Usa enlaces para archivos grandes.

## Comprobaciones

```sh
pnpm test
pnpm build
```

Las pruebas de autenticación usan SQLite en memoria. Cubren login, hashes, cookies, invitaciones de un solo uso, roles falsificados, permisos de escritura, revisión de datos, origen de las solicitudes, último administrador y revocación de sesiones. También se comprueba la persistencia del archivo SQLite tras cerrar y volver a abrir la conexión.

Referencias: [contraseñas de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [sesiones de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [funciones Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js).
