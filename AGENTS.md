# Instrucciones para asistentes de inteligencia artificial

Este archivo es la fuente canónica de instrucciones para cualquier asistente que trabaje en Parking Chía. Los archivos `CLAUDE.md`, `GEMINI.md` y `.github/copilot-instructions.md` son únicamente puntos de entrada y no deben duplicar estas reglas.

## Lectura obligatoria

Antes de proponer o modificar código:

1. Lee este archivo completo.
2. Lee `docs/ai/PROJECT_CONTEXT.md` y `docs/ai/CURRENT_STATE.md`.
3. Consulta `docs/ai/DECISIONS.md` y la documentación especializada relacionada con la tarea.
4. Revisa `git status`, el código existente y las pruebas cercanas antes de editar.

Si el código contradice la documentación, no supongas cuál es correcto: verifica el historial y el comportamiento, corrige la fuente obsoleta dentro del mismo cambio y explica la decisión.

## Propósito y etapa del producto

Parking Chía es una aplicación de escritorio offline-first para operar un parqueadero en Windows y macOS. La base técnica está implementada, pero la lógica comercial definitiva de ingresos, salidas, liquidación de tarifas, cobros, caja, mensualidades y reportes sigue en desarrollo.

No presentes como terminada una funcionalidad que solo tenga interfaz, contrato o datos de ejemplo. Los datos del seed son exclusivamente de desarrollo.

## Reglas no negociables

### Seguridad de Electron

- Conserva `nodeIntegration: false`, `contextIsolation: true` y el sandbox.
- El renderer no puede importar módulos de Node.js, Electron, `better-sqlite3` ni acceder al sistema de archivos.
- No expongas `ipcRenderer`, `require`, `process` ni una API IPC genérica.
- Cada operación nueva debe tener un canal constante en `src/shared/ipc.ts`, tipos en `src/shared/contracts.ts`, validación Zod de toda entrada no confiable, implementación en el proceso principal y una función concreta en el preload.
- No envíes al renderer trazas, rutas internas ni mensajes técnicos sensibles.
- Bloquea navegación no autorizada y limita enlaces externos a protocolos explícitamente seguros.

### Datos locales

- SQLite solo se usa desde el proceso principal.
- La base de producción siempre vive bajo `app.getPath("userData")` con el nombre `parkingchia.sqlite`.
- Desarrollo y pruebas deben usar datos separados de producción.
- Los importes monetarios se persisten como enteros en pesos colombianos; nunca como coma flotante.
- Los timestamps se persisten en UTC y se convierten a hora local únicamente al presentarlos.
- Mantén claves foráneas, WAL, restricciones, índices y transacciones para operaciones críticas.
- Toda migración debe preservar datos. Antes de una migración potencialmente destructiva, implementa y verifica un respaldo recuperable.
- Actualizar o desinstalar la aplicación no debe borrar la base de datos del usuario.
- Nunca versiones archivos `.sqlite`, datos reales, tickets, respaldos o información personal.

### Producto offline-first

- Ninguna operación esencial puede depender de Internet.
- No agregues Supabase, Firebase, servicios cloud, telemetría, analytics, publicidad ni autenticación remota sin una solicitud explícita del propietario.
- Internet se reserva para actualizaciones y futuras funciones opcionales que no bloqueen la operación.

### Interfaz

- Todo texto visible debe estar en español claro y usar estilo de oración.
- Optimiza para rapidez, legibilidad y reducción de errores durante una operación presencial.
- Mantén HTML semántico, navegación por teclado, foco visible, etiquetas accesibles, contraste suficiente y objetivos táctiles adecuados.
- Respeta `prefers-reduced-motion`; evita animación ornamental, gradientes decorativos y glassmorphism.
- Cobrar, registrar una salida, cerrar caja, anular o borrar son acciones explícitas y requieren confirmación proporcional al riesgo.
- Usa los componentes y tokens existentes antes de crear variantes nuevas.
- No mantengas datos simulados dentro de componentes de producción; usa IPC real, estados vacíos o el seed de desarrollo.

## Mapa del código

```text
src/main/database/     SQLite, Drizzle, migraciones, respaldos y ciclo de conexión
src/main/ipc/          handlers IPC y límite de errores
src/main/printing/     abstracción e implementación nativa de impresión
src/main/settings/     configuración persistida
src/main/parking/      ingresos, salidas, pagos y recibos
src/main/tariffs/      política de cobro y planes de tarifa
src/main/updates/      electron-updater y máquina de estados
src/main/security/     navegación y enlaces externos
src/main/windows/      BrowserWindow y Content Security Policy
src/preload/           window.parkingAPI, limitada y tipada
src/renderer/          React, rutas, componentes y funcionalidades
src/shared/            contratos, canales, esquemas Zod y helpers puros
drizzle/               migraciones versionadas; no editar snapshots manualmente
scripts/               herramientas CLI seguras para desarrollo
docs/                  documentación técnica y memoria del proyecto
```

Los alias vigentes son `@main`, `@preload`, `@renderer`, `@shared` y `@`. Respeta el límite entre procesos al utilizarlos.

## Forma de trabajar

### Antes del cambio

- Confirma el alcance del pedido y distingue diagnóstico de autorización para modificar.
- Inspecciona cambios sin commit y conserva cualquier trabajo ajeno a la tarea.
- Busca implementaciones existentes antes de añadir archivos, dependencias o abstracciones.
- Usa npm y conserva `package-lock.json`; no mezcles otro administrador de paquetes.
- No cambies una versión ya publicada ni reutilices un tag.

### Durante el cambio

- Prefiere cambios pequeños, tipados y comprobables.
- Mantén lógica de dominio fuera de los componentes React y del registro de IPC.
- Evita `any`, canales dinámicos, rutas absolutas de una máquina y secretos.
- Añade o ajusta pruebas junto con el comportamiento.
- Si una decisión altera límites, persistencia, seguridad, distribución o datos, regístrala en `docs/ai/DECISIONS.md`.

### Validación proporcional

Para un cambio de código normal ejecuta, como mínimo:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:run
npm run build
```

Para cambios de base de datos añade `npm run db:generate`, una migración sobre una base desechable y la prueba de migración. Para impresión, actualizaciones o empaquetado, ejecuta además el comando específico que sea viable en el sistema actual y documenta lo que solo puede validar CI.

No ignores errores ni afirmes que un comando pasó si no fue ejecutado.

### Cierre y memoria

- Actualiza `docs/ai/CURRENT_STATE.md` cuando cambie el estado funcional, la versión, una limitación, una validación importante o la siguiente prioridad.
- Actualiza `docs/ai/PROJECT_CONTEXT.md` solo cuando cambien hechos estables del producto o la arquitectura.
- Añade una decisión a `docs/ai/DECISIONS.md` cuando corresponda; no reescribas decisiones históricas silenciosamente.
- Mantén README y documentos especializados alineados con el comportamiento público.
- Informa archivos modificados, validaciones reales, riesgos y trabajo pendiente.
- No hagas commit, push, tag, release ni cambios externos salvo que el pedido actual lo autorice expresamente.

## Git y releases

- Rama principal: `main`.
- Repositorio: `heycarlosluis/parkingchia`.
- Versionado semántico; la versión actual se consulta en `package.json`.
- Los tags `v*` activan el workflow de release.
- Nunca hagas force push ni sustituyas artefactos de una versión publicada como si fueran una versión nueva.
- Firma de Windows y firma/notarización de macOS deben usar secretos del pipeline; nunca archivos o tokens versionados.

## Jerarquía documental

Ante una diferencia, aplica este orden:

1. Solicitud actual y explícita del usuario.
2. Reglas de seguridad y datos de este archivo.
3. Decisiones aceptadas en `docs/ai/DECISIONS.md`.
4. Contexto y estado en `docs/ai/`.
5. Documentación especializada y README.
6. Comentarios del código.

Una solicitud que ponga en riesgo datos reales, secretos o las protecciones de Electron debe señalarse antes de ejecutarse.
