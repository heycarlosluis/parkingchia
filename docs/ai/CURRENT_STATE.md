# Estado actual del proyecto

Última actualización: **2026-09-18**.

Este archivo describe el último corte conocido, no sustituye la verificación de `git status`, `package.json`, GitHub Actions ni el comportamiento ejecutable.

## Línea base

- Rama de referencia: `main`.
- Versión del corte: `0.1.0-alpha.7`.
- Versión publicada más reciente: `0.1.0-alpha.6`.
- Tag publicado más reciente: `v0.1.0-alpha.6`.
- CI de la versión publicada: aprobado.
- Release multiplataforma publicada: `0.1.0-alpha.3`, aprobada como pre-release.
- Artefactos publicados: NSIS Windows x64; DMG y ZIP macOS x64/arm64; metadatos YAML y blockmaps.

## Implementado y funcional

- Arranque de Electron con ventana única y cierre ordenado.
- Renderer React navegable con ocho secciones principales; las tarifas dejaron de ser una sección propia y ahora se administran dentro de Configuración.
- Configuración organizada en pestañas (General, Tarifas, Impresión, Seguridad y Sistema) con enlaces directos `?tab=`; la ruta `/tarifas` redirige a su pestaña.
- Onboarding de primera ejecución con nombre, dirección, teléfono y PIN opcional; el perfil admite además un logo local opcional desde Configuración.
- Bloqueo local al iniciar cuando existe un PIN, con pausa tras intentos fallidos.
- Edición del perfil y creación, cambio, bloqueo inmediato o eliminación del PIN desde Configuración.
- Hash `scrypt` con sal aleatoria; el PIN nunca se persiste ni se expone en texto plano.
- Preload aislado y `window.parkingAPI` completamente tipado.
- SQLite local con migraciones Drizzle, WAL, claves foráneas y estado visible en UI.
- Esquema inicial de diez entidades con índices, relaciones y restricciones.
- Seed explícito de desarrollo con dos tarifas, un vehículo y una sesión activa.
- Módulo de tarifas completo: configuración de cobro persistida (unidad por hora o por minuto, tolerancia sobre la fracción, moneda COP, IVA activable con porcentaje y modo, redondeo del total), administración de tarifas por tipo de vehículo con precio, cobro mínimo, plena y gracia propia opcional, y simulador de cobro contra la configuración guardada.
- Motor de liquidación puro y testeado en `src/shared/tariff.ts`, con desglose de base, subtotal, IVA, redondeo y total en enteros COP.
- Tolerancia sobre la fracción: se cobran las horas cumplidas y la fracción final solo si supera la gracia, que se vuelve a aplicar en cada salida. El desglose informa los minutos perdonados. La configuración general define desde qué hora empieza a perdonar: con el valor por defecto `1` la primera hora se cobra completa desde el minuto uno y con `0` la tolerancia también libera el primer tramo.
- Plena: precio por tarifa, y umbral de horas sueltas y duración de la plena en la configuración general. El tiempo avanza en ciclos de la duración configurada: dentro de cada ciclo se cobra por hora hasta el umbral, superarlo congela el tramo en el precio de la plena, y pasada la duración se retoma el cobro por hora hasta volver a superar el umbral.
- Historial de salidas con filtro por matrícula y rango de fechas, totales del filtro y reimpresión de cualquier recibo desde su snapshot. La tabla resuelve el estado en una columna propia (cobrada, mensualidad, sin cobro o anulada), muestra la tarifa aplicada, reparte cada celda en dato principal y contexto, y avisa cuando el listado se recortó en las 100 salidas más recientes.
- Módulo de parqueo completo: registro de ingreso para los diez tipos de vehículo de `VEHICLE_TYPES` (automóvil, camioneta, van o furgón, taxi, autobús, camión, motocicleta, patineta eléctrica, bicicleta y otro), con matrícula normalizada, tarifa sugerida por tipo de vehículo, nota opcional y tiquete de ingreso que conserva matrícula, vehículo, tarifa y precio, fecha y hora, gracia, empleado, nota y logo. El papel imprime QR con el snapshot completo y Code 128 con una referencia corta (D-034). Solo se ofrecen los tipos de vehículo que tienen una tarifa activa y la tarifa sugerida siempre pertenece al tipo elegido (D-027). La pantalla es una columna centrada pensada para operar rápido: el campo de matrícula filtra letras y dígitos mientras se escribe, la nota queda tras «Agregar nota», la tarifa se muestra sin desplegable cuando solo una aplica y el foco encadena un ingreso con el siguiente (D-030).
- Reimpresión del tiquete de ingreso desde la confirmación del registro y desde cada fila de Parqueo activo, únicamente mientras la sesión sigue activa. La migración `0006` guarda un snapshot inmutable para que un cambio posterior de tarifa o turno no altere el duplicado.
- Parqueo activo con búsqueda por matrícula, permanencia y estimado que se refrescan en pantalla, y anulación de un ingreso con motivo obligatorio y auditoría.
- Permanencia y fechas legibles en todas partes: la permanencia se muestra completa (días, horas y minutos) y la fecha y hora de ingreso aparece en Parqueo activo, en el Historial, en el diálogo de salida y en los comprobantes impresos, con un único formato local `formatDateTime`. El tipo de vehículo se selecciona con cajas de radio en lugar de un menú desplegable; la caja elegida queda rellena en color primario, con icono del vehículo y marca de verificación.
- Salida transaccional: cotización contra el proceso principal, medio de pago, efectivo recibido con cálculo de cambio, pago y recibo consecutivo con snapshot inmutable, cierre de sesión e impresión del recibo con reimpresión disponible.
- Registrar salida como pantalla propia en `/salidas`: acepta QR, Code 128 o matrícula, resuelve la sesión activa en el proceso principal y abre el diálogo de cobro ya liquidado. Los lectores USB HID en modo teclado funcionan en el campo y un código con prefijo propio abre la salida desde las demás pantallas cuando no hay un formulario o diálogo activo (D-034).
- El recibo de salida deja constancia del empleado del turno y de la nota de la salida, y todo duplicado sale marcado como «REIMPRESIÓN» con su fecha y hora.
- Salida dentro del tiempo de gracia que cierra la sesión sin cobro ni recibo.
- Migración `0001` que recrea `rate_plans` preservando datos y referencias, con claves foráneas desactivadas alrededor de `migrate()` y verificación posterior con `PRAGMA foreign_key_check`.
- Configuración persistente de logo, impresora, ancho de papel y diálogo del sistema.
- Listado de impresoras y ticket HTML de prueba mediante APIs nativas de Electron.
- Respaldo manual con diálogo nativo y respaldos automáticos previos a migrar.
- Máquina de estados de actualizaciones y proveedor GitHub Releases: consulta al iniciar, aviso persistente en la navegación, canal derivado del SemVer instalado, descarga y reinicio explícitos, cierre coordinado de ventanas, IPC y SQLite antes de iniciar NSIS, salida forzada de respaldo, y publicación protegida contra tags incongruentes o reemplazo de una release existente (D-033 y D-035).
- Módulo de mensualidades completo: clientes mensuales, planes con unidad `month`, suscripciones con vigencia de días completos, renovación a continuación, cancelación con motivo, pagos parciales o totales con recibo inmutable y reimprimible, y resumen de vigentes, por vencer, saldo por cobrar y recaudado del mes.
- La exención por mensualidad se integra al cobro por horas: una sesión activa cubierta por una mensualidad vigente sale con total en cero conservando la permanencia visible, y el historial marca el cliente mensual que la cubrió. El diálogo de salida solo exige efectivo cuando hay algo que cobrar, de modo que las salidas sin cobro (mensualidad o tolerancia) se confirman con normalidad (D-032).
- Módulo de Caja completo: apertura con fondo inicial y empleado asignado, asociación automática de cada pago de parqueo y de mensualidad a la caja abierta, arqueo en vivo (recaudado, anulado y esperado), anulación de un cobro con motivo, cierre con efectivo contado y diferencia, recibo de cierre reimprimible e historial de cierres anteriores.
- La operación exige caja abierta: no se registran ingresos, cobros de salida ni pagos de mensualidad sin una caja abierta. Las salidas sin cobro (gracia o mensualidad) sí se permiten.
- Todo pago en efectivo exige registrar el efectivo recibido (que cubra el total) y calcula el cambio; los demás medios no requieren ese campo.
- Empleados administrados desde Configuración: crear, listar, editar, desactivar y eliminar; cada turno de caja queda asociado al empleado que lo operó.
- Avisos con tono propio (neutro, advertencia, error y éxito): icono, título, descripción y acciones ocupan siempre el mismo lugar, y el texto de cada tono cumple el contraste AA sobre su superficie (D-028).
- Empaquetado Windows/macOS, CI, publicación de tags y pre-releases.
- Pruebas de validación de matrícula, moneda, duración, esquemas IPC, onboarding, acceso local, pantalla principal, estado vacío, inicialización SQLite, actualización del esquema de tarifas preservando referencias, cálculo tarifario, servicio de tarifas, pantalla de tarifas, servicio de parqueo con ingreso, salida, anulación y numeración de recibos, plantillas de impresión, plena con los casos del parqueadero, historial de salidas, calendario y vigencia de mensualidades, servicio de mensualidades (clientes, planes, suscripciones, pagos, cobertura y resumen), servicio de caja (apertura, cierre, arqueo, anulación y asociación de pagos) y pantallas de ingreso, parqueo activo, historial, mensualidades y caja.

## Implementado como base, no como lógica comercial final

- Reportes tiene navegación y estado vacío; falta su flujo de negocio.
- Un cobro solo se anula dentro de la caja abierta que lo contiene; un cobro emitido sin caja abierta o en una caja ya cerrada no se anula desde Caja.
- Anular un cobro de parqueo no reabre la sesión ya cerrada: solo descuenta el importe del arqueo y deja el recibo anulado. Reabrir o volver a cobrar es una corrección manual del operador.
- No hay noción de cupos ni de aforo del parqueadero.
- El plan `day` del modelo no tiene pantalla ni servicio; queda reservado para un eventual cobro por día distinto de la plena.

## Validaciones conocidas de la línea base

Se verificaron correctamente:

```text
npm ci
npm run format:check
npm run typecheck
npm run lint
npm run test:run       25 archivos, 213 pruebas
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm run dev
npm run dist:mac
```

El workflow de release verificó además `npm run dist:win` en Windows y `npm run dist:mac` en macOS.

## Limitaciones y riesgos conocidos

- Los instaladores todavía no están firmados. Windows puede mostrar SmartScreen y macOS puede bloquear o advertir sobre la aplicación.
- Las actualizaciones automáticas reales en macOS requieren firma de código.
- El cierre reforzado de `0.1.0-alpha.4` está cubierto por pruebas automatizadas, pero el salto completo entre dos releases debe certificarse en Windows después de publicar la versión.
- `0.1.0-alpha.1` fuerza el canal estable y no puede descubrir otra pre-release; como la release no registra descargas, los equipos deben instalar directamente la siguiente versión. Si ya existiera una instalación de `alpha.1`, necesitará esa actualización manual una sola vez.
- Se usa el icono predeterminado de Electron hasta disponer de `.ico` e `.icns` definitivos.
- La impresión está implementada y falla de forma controlada, pero no se ha certificado todavía con hardware térmico físico ni drivers específicos.
- El flujo por lector usa el estándar USB HID/teclado y está probado por software, pero todavía debe certificarse con el YHD-9300 físico del cliente, incluyendo calidad real del QR y Code 128 sobre su papel e impresora.
- No existe restauración guiada de respaldos.
- No existe recuperación remota del PIN. Es una decisión coherente con la ausencia de cuentas; deberá diseñarse una recuperación local segura antes de ofrecerla.
- ESC/POS, corte de papel y apertura de cajón son extensiones futuras.
- El módulo de tarifas administra únicamente planes por tiempo (`minute` y `hour`). Los planes `day` y `month` quedan reservados para Mensualidades: editarlos, eliminarlos o simularlos desde Tarifas se rechaza con `RATE_PLAN_NOT_APPLICABLE` (D-024).
- La plena solo se cobra con la unidad por hora. Cobrando por minuto el valor guardado en la tarifa se conserva pero no se aplica, y tanto el formulario como el listado de tarifas lo advierten.
- Al cambiar la unidad de cobro los precios no se convierten automáticamente; la interfaz lo advierte y exige confirmación, pero la revisión es responsabilidad del operador.
- La auditoría de npm de la línea base reportó cuatro avisos moderados en dependencias transitivas de desarrollo de Drizzle Kit y ninguno alto o crítico. No se aplicó el downgrade incompatible sugerido automáticamente.
- Las acciones oficiales de GitHub emitieron un aviso de transición de su runtime interno de Node.js, sin fallar CI ni la release; conviene actualizar sus versiones en un cambio de mantenimiento futuro.

## Próxima prioridad funcional sugerida

1. Reportes por periodo apoyados en `payments`, `receipts` y `parking_sessions`, junto con un resumen de cierres de caja por turno.
2. Reconciliar las limitaciones de anulación: decidir si anular un cobro de parqueo debe reabrir la sesión o requerir un nuevo ingreso.

La política de cobro está implementada y documentada en D-011. Falta confirmar con el propietario dos casos que hoy no cubre: pérdida de ticket y tarifas diferenciadas por franja horaria.

## Trabajo activo al cerrar este corte

La política de cobro sumó dos ajustes generales. La tolerancia arranca en una hora configurable (`tariff.graceFromHour`, D-025): con el valor por defecto `1` la primera hora se cobra completa desde el minuto uno y la gracia solo perdona la fracción a partir de esa hora, mientras que con `0` se recupera el comportamiento anterior de perdonar el primer tramo. La plena pasó de un ciclo fijo de 24 horas a un ciclo configurable (`tariff.plenaHours` y `tariff.plenaThresholdHours`, D-026): dentro de cada ciclo se cobra por hora hasta superar el umbral, superarlo congela el tramo en el precio de la plena y pasada la duración se retoma el cobro por hora. El umbral debe ser menor que la duración; la regla se valida sobre el resultado combinado y se rechaza con `PLENA_THRESHOLD_INVALID`.

La presentación del tiempo y de las fechas quedó unificada: `describeElapsed` conserva los minutos al superar un día, de modo que la permanencia se muestra completa en Parqueo activo, el diálogo de salida, el Historial y los comprobantes impresos; y `formatDateTime` muestra fecha y hora locales completas, de modo que la fecha de entrada aparece en Parqueo activo, en el diálogo de salida y en la columna «Ingreso» del Historial. El tipo de vehículo se selecciona con cajas de radio (`RadioCards`) en lugar de un menú desplegable. La selección dejó de señalarse solo con un tinte del 5 %: la caja activa se rellena con el color primario y su texto en `primary-foreground`, conserva un contorno de 2 px y suma una marca de verificación, de modo que el estado no dependa únicamente del color. Cada opción muestra además el icono de su vehículo.

Las cajas se derivan de las tarifas activas (D-027): un tipo sin tarifa activa no se ofrece, desactivar la última tarifa de un tipo lo retira del registro, y si el tipo seleccionado deja de estar disponible la selección pasa al primero que sí lo esté. Con eso desaparece el respaldo que ante un tipo sin tarifa propia caía sobre todas las tarifas activas y podía registrar una bicicleta con la tarifa del automóvil.

Los avisos se rehicieron como un sistema de cuatro tonos con rejilla fija y acciones a la derecha (D-028), el historial de salidas pasó a una tabla de siete columnas con estado propio y celdas de dos líneas (D-029), Registrar ingreso se rehízo como una columna centrada con el campo de matrícula filtrado al escribir (D-030), Registrar salida se sumó como pantalla gemela que solo pide la matrícula (D-031) y se corrigió el bloqueo que impedía confirmar cualquier salida sin cobro (D-032). Los cambios pasan format, typecheck, lint, 247 pruebas y build. `npm run dev` sí lanza Electron en este equipo: el fallo anterior lo causaba la variable `ELECTRON_RUN_AS_NODE=1` presente en el entorno de la terminal, no una incompatibilidad de Electron 43 con `@electron-toolkit/utils`. Si vuelve a aparecer, arranca con `env -u ELECTRON_RUN_AS_NODE npm run dev`. La verificación visual de estos cambios queda a cargo del propietario. No hay migración de esquema en curso: los dos ajustes nuevos viven en `app_settings` y las instalaciones existentes toman los valores por defecto.

Las actualizaciones quedaron alineadas con las releases de GitHub (D-033): las instalaciones pre-release ya no fuerzan el canal estable, el workflow verifica que tag y `package.json` coincidan y se niega a reemplazar artefactos publicados. El pipeline puede firmar Windows y firmar/notarizar macOS cuando existan los secretos correspondientes; sin ellos sigue produciendo únicamente builds de prueba. Se verificaron el YAML del workflow, la coincidencia del tag, format, typecheck, lint, 247 pruebas, build y `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac -- --publish never`; el paquete generó ZIP, DMG, blockmaps y `latest-mac.yml` para x64 y arm64. Falta ejecutar una prueba extremo a extremo entre dos versiones publicadas, validar el instalador Windows en GitHub Actions y, para macOS, adquirir y configurar las credenciales Developer ID de Apple.

El tiquete de ingreso y la salida por lector se rediseñaron en D-034. Los ingresos nuevos guardan `entry_snapshot_json`; la impresión añade el logo del perfil, los datos originales de entrada, un QR con el snapshot y un Code 128 con la referencia. `parking:resolve-exit-target` acepta ambos formatos o una matrícula y solo devuelve una sesión activa validada desde SQLite. El renderer soporta lectores que escriben como teclado, tanto en el campo de salida como desde el resto de la aplicación cuando no interfiere con formularios o diálogos. Pasaron `format:check`, `typecheck`, `lint`, 30 archivos con 258 pruebas, `build`, `db:generate`, una migración desde `0005` y otra sobre una base desechable; `npm audit --omit=dev` quedó sin vulnerabilidades. La aplicación se revisó visualmente en ejecución y se comprobó el salto global a Registrar salida simulando un lector. Falta certificar el recorrido con el lector y la impresora físicos del cliente.

Se preparó `0.1.0-alpha.2` y se generó desde macOS un instalador NSIS Windows x64 de prueba con `npmRebuild=false`, usando el binario precompilado que `better-sqlite3` 13 distribuye para `win32-x64`. Se verificó que tanto el instalador como el módulo nativo sean PE de Windows y se copió el `.exe` a Descargas con SHA-256 coincidente. El instalador no está firmado y no puede someterse a una prueba funcional en macOS; la release oficial debe volver a construirlo y probarlo en el runner Windows.

`0.1.0-alpha.3` es la primera actualización de prueba destinada a validar el flujo completo desde una instalación local de `alpha.2`: detección al iniciar, aviso persistente, descarga, reinicio e instalación. El cambio visible deliberadamente pequeño está en Configuración > Sistema, donde se aclara que las actualizaciones conservan los datos locales. El resultado extremo a extremo solo puede darse por confirmado después de publicar los artefactos y probar el salto en Windows.

`0.1.0-alpha.4` corrige el cierre al elegir **Reiniciar e instalar** (D-035). El estado `installing` se devuelve al renderer antes de iniciar el apagado; después se cierran IPC, SQLite y todas las ventanas, NSIS se ejecuta silenciosamente con relanzamiento y un temporizador finaliza el proceso si Electron siguiera vivo cinco segundos más tarde. `autoInstallOnAppQuit` permanece desactivado para que cerrar la aplicación por otra causa nunca instale una descarga sin confirmación. El commit en `main` no distribuye esta versión: se requiere publicar el tag coincidente en una acción separada y explícita.

Para este corte pasaron `format:check`, `typecheck`, `lint`, 30 archivos con 258 pruebas y `build`. Desde macOS ARM se generó el NSIS Windows x64 con el paquete unificado NSIS 3.12 y `npmRebuild=false`; se verificaron como PE de Windows el ejecutable empaquetado y `better-sqlite3/prebuilds/win32-x64.node`. El instalador de 126.320.489 bytes se copió a Descargas y ambas copias tienen SHA-256 `580142f14bea80ffc9cab8a0d05c1656ef656ffeb2cca75c8d5d0f26705e08ff`. Sigue pendiente ejecutarlo y probar la actualización extremo a extremo en Windows.

El 2026-09-17 se corrigieron dos detalles de operación. El campo de Registrar salida filtra la matrícula igual que Registrar ingreso (solo letras y dígitos, en mayúsculas y con el mismo largo máximo) y conserva intacto un código escaneado con prefijo `PC1Q` o `PC1S`, que se muestra en letra compacta. La impresión dejó de maquetar sobre el ancho del rollo y de usar una página fija de 200 mm: todos los documentos usan el ancho imprimible (72 mm en 80 mm, 48 mm en 58 mm) y una página del alto medido, lo que corrige el contenido descentrado observado con una impresora POS de 80 mm cuyo driver publica papel de 72 mm. Pasaron `format:check`, `typecheck`, `lint`, 30 archivos con 261 pruebas y `build`, y se verificó en PDF que el tiquete de ingreso ocupa una sola página centrada. Falta confirmar el resultado en papel con la impresora del cliente.

En el mismo corte se rediseñaron los cinco documentos impresos (tiquete de ingreso, recibo de salida, recibo de mensualidad, cierre de caja y ticket de prueba) porque la negrita se leía mal en la impresora térmica del cliente. Ya no hay texto en negrita; la jerarquía sale del tamaño, las mayúsculas espaciadas y un recuadro para el importe principal y la reimpresión. Todos comparten encabezado, filas y pie, y las fechas pasaron del formato largo al formato local `formatDateTime` que ya usa la pantalla. Se revisaron en PDF a 72 y 48 mm; falta confirmarlos en papel.

Los datos del parqueadero suman un NIT opcional (D-036). Configuración > General lo recibe como aparece en el RUT, valida el dígito de verificación de la DIAN, sugiere el DV cuando falta y lo guarda en `app_settings` sin migración de esquema. Todos los documentos impresos lo muestran bajo el nombre. Pasaron `format:check`, `typecheck`, `lint`, 31 archivos con 272 pruebas y `build`.

Los tipos de vehículo pasaron de cuatro a diez (D-037): automóvil, camioneta, van o furgón, taxi, autobús, camión, motocicleta, patineta eléctrica, bicicleta y otro. `VEHICLE_TYPES` en `src/shared/tariff.ts` es el origen único del valor, la etiqueta y el orden, así que Tarifas, Mensualidades, Registrar ingreso y los comprobantes los ofrecen sin cambios adicionales. La migración `0007` amplía las restricciones `CHECK` de `vehicles` y `rate_plans` recreando ambas tablas con `INSERT ... SELECT`, sin perder datos ni referencias. Pasaron `format:check`, `typecheck`, `lint`, 31 archivos con 273 pruebas, `build`, `db:generate`, `db:migrate` y `db:seed` sobre una base desechable, y una prueba de migración que inserta los diez tipos sobre una base creada en `0006` y comprueba que un tipo desconocido sigue rechazado.

El recibo de salida dejó de imprimir la fila «Cobrado»: la permanencia y la tarifa ya explican el cobro y el desglose del tiempo facturado sigue disponible en el Historial. El recuadro del importe principal conserva el borde pero usa el mismo tamaño de letra que el resto del documento, en todos los comprobantes.

`0.1.0-alpha.5` reúne el trabajo del 2026-09-17 y es la primera versión publicada desde `0.1.0-alpha.3`: el filtro de matrícula en Registrar salida, el NIT del parqueadero, el rediseño de los comprobantes impresos y los diez tipos de vehículo con la migración `0007`. `0.1.0-alpha.4` quedó en el historial sin publicarse; su corrección del cierre antes de instalar viaja dentro de esta versión y todavía debe certificarse en Windows saltando desde una instalación anterior.

El 2026-09-18 se revisó el flujo del lector porque el YHD-9601D del cliente no abría la salida (D-038). Se encontraron cuatro causas. El QR llevaba el snapshot en base64url y, con el teclado en distribución latinoamericana, el lector convertía `-` y `_` en `'` y `?`. El Code 128 tenía módulos de 1,7 puntos, con barras irregulares de 1 o 2 puntos. Un prefijo en minúsculas por el bloqueo de mayúsculas se rechazaba. Un lector con Tab como sufijo no buscaba desde el campo de salida. Ahora ambos símbolos llevan un código de 16 dígitos con verificación Luhn, impreso también en texto para teclearlo, con módulos de 3 u 8 puntos en 80 mm y 2 o 6 en 58 mm, y el campo de salida busca también con Tab. Los tiquetes antiguos se siguen leyendo y su QR se repara si llega dañado por el teclado. Rasterizando a 8 puntos por milímetro en blanco y negro, ambos símbolos se decodifican en los dos anchos; en 80 mm también con un punto de sangrado y con desenfoque, y en 58 mm el Code 128 falla con sangrado mientras el QR se sigue leyendo. Falta confirmar la lectura con el lector y la impresora físicos.

`0.1.0-alpha.5` se publicó el 2026-09-17 tras subir los artefactos a mano, porque la API de subida de GitHub devolvió errores 500 intermitentes y el job de publicación agotó sus 15 minutos. Para `0.1.0-alpha.6`, que distribuye la corrección del lector (D-038), el workflow crea el release como borrador, sube cada archivo con hasta cinco reintentos, comprueba que estén todos y solo entonces lo publica; volver a ejecutar el job reutiliza el borrador en lugar de fallar, y una versión ya publicada sigue sin poder reemplazarse.

`0.1.0-alpha.6` se publicó el 2026-09-18 y en un equipo Windows del cliente el lector funcionó, pero el tiquete salió cortado a la derecha. `0.1.0-alpha.7` hace que la impresión se adapte al área que declara cada driver (D-039): se eliminó la regla `@page` que anulaba los márgenes del driver, se imprime con `printableArea`, el contenido se centra y se encoge dentro de esa área, y el alto se mide con margen para no partir el documento. Configuración › Impresión suma ancho de impresión, ajuste horizontal y una guía impresa con regla para calibrar un equipo cuyo driver declare medidas falsas. Una simulación de cuatro drivers (72 mm y 80 mm, con y sin 4 mm de margen) confirmó que tiquetes y recibos quedan dentro del área, en una hoja y con los códigos legibles. Pasaron `format:check`, `typecheck`, `lint`, 32 archivos con 290 pruebas y `build`. Falta confirmarlo en el equipo Windows y, si hiciera falta, calibrarlo con la guía.
