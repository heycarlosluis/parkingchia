# Registro de decisiones arquitectónicas

Este registro conserva decisiones que deben sobrevivir a una conversación. No reemplaza ADR extensos si el proyecto los necesita en el futuro.

Estados posibles: `propuesta`, `aceptada`, `reemplazada` o `descartada`.

## D-001 — Aplicación Electron offline-first

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: construir una aplicación Electron completamente operativa sin conexión, sin backend remoto obligatorio.
- Motivo: la continuidad del parqueadero no puede depender de conectividad externa.
- Consecuencia: red, autenticación cloud, sincronización y servicios opcionales nunca deben bloquear la operación local.

## D-002 — SQLite pertenece exclusivamente al proceso principal

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: usar `better-sqlite3` y Drizzle únicamente en el proceso principal. El renderer accede mediante operaciones IPC concretas.
- Motivo: proteger el archivo, reducir privilegios y mantener una frontera auditable.
- Consecuencia: no se permiten imports de base de datos, Node.js o Electron en componentes React.

## D-003 — Preload mínimo e IPC de lista permitida

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: exponer `window.parkingAPI` mediante `contextBridge`, con canales constantes, contratos compartidos, entradas Zod y errores públicos uniformes.
- Motivo: impedir IPC arbitrario y evitar filtrar detalles internos.
- Consecuencia: cada capacidad nueva debe actualizar contrato, canal, esquema, handler, preload y pruebas como un solo cambio coherente.

## D-004 — Persistencia orientada a integridad y portabilidad

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: guardar la base bajo `app.getPath("userData")`, usar UUID de texto, UTC, enteros COP, claves foráneas, WAL y restricciones de dominio.
- Motivo: preservar datos entre actualizaciones y mantener significado consistente entre plataformas.
- Consecuencia: desarrollo usa bases separadas; el instalador y desinstalador no borran datos del usuario.

## D-005 — Migraciones versionadas con respaldo previo

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: distribuir migraciones Drizzle como recursos y crear un respaldo consistente antes de migrar una base existente.
- Motivo: una actualización no debe dejar datos irrecuperables ni un esquema parcialmente actualizado.
- Consecuencia: cambios de esquema requieren migración versionada, prueba aislada y estrategia de recuperación; no se modifica una base real con scripts de desarrollo.

## D-006 — Impresión mediante adapter independiente del fabricante

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: definir `TicketPrinter` y usar inicialmente un adapter basado en impresión nativa de Electron y tickets HTML monocromáticos.
- Motivo: permitir impresoras del sistema sin acoplar el dominio a una marca o protocolo.
- Consecuencia: ESC/POS, corte y cajón pueden añadirse como adapters futuros sin cambiar la API del renderer.

## D-007 — Actualizaciones explícitas desde GitHub Releases

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: usar electron-updater únicamente en builds empaquetados, consultar sin bloquear y requerir autorización del usuario para descargar e instalar.
- Motivo: una actualización no debe interrumpir parqueo, cobro o impresión.
- Consecuencia: desarrollo nunca consulta actualizaciones; macOS requerirá firma antes de considerar confiable la actualización automática real.

## D-008 — Distribución inicial sin firma, nunca omitiendo protecciones

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: generar artefactos de prueba sin certificados mientras el pipeline queda preparado para secretos futuros.
- Motivo: validar empaquetado antes de adquirir y configurar identidad de firma.
- Consecuencia: se documentan SmartScreen y Gatekeeper; no se recomienda desactivar permanentemente las protecciones del sistema.

## D-009 — Memoria de IA canónica y portable

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: mantener reglas comunes en `AGENTS.md`, hechos y estado en `docs/ai/`, y archivos puente mínimos para asistentes específicos.
- Motivo: permitir continuidad entre herramientas sin copiar instrucciones que después diverjan.
- Consecuencia: los adaptadores no deben adquirir reglas propias; todo cambio sustancial revisa la memoria canónica correspondiente.

## D-010 — Onboarding local con PIN opcional de 8 dígitos

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: solicitar nombre, dirección y teléfono en la primera ejecución y ofrecer un PIN local opcional de exactamente 8 dígitos, sin cuentas ni servicio remoto.
- Motivo: personalizar tickets y operación manteniendo un acceso rápido, comprensible y completamente offline.
- Consecuencia: el PIN se deriva con `scrypt` y sal aleatoria, bloquea los IPC operativos además de la interfaz y se administra desde Configuración. No existe recuperación por Internet y la interfaz debe advertirlo antes de activarlo.

## D-011 — Política tarifaria única y explícita

- Fecha: 2026-08-18
- Estado: aceptada
- Nota: la regla de gracia descrita aquí fue reemplazada por D-015. El resto sigue vigente.
- Decisión: la política de cobro vive en `app_settings` bajo el prefijo `tariff.` y contiene unidad de cobro (`hour` o `minute`), tiempo de gracia, moneda fija `COP`, IVA activable con porcentaje y modo (incluido en el precio o sumado) y redondeo del total. Cada `rate_plan` aporta precio por unidad, cobro mínimo, tope por día iniciado y una gracia propia opcional (`NULL` usa la general). El cálculo es una función pura en `src/shared/tariff.ts`.
- Motivo: el operador necesita un solo lugar donde definir cómo se cobra, y la liquidación de salidas necesita una regla reproducible y testeable antes de existir.
- Consecuencia: el orden de aplicación es unidades cobrables, tope diario, cobro mínimo, IVA y redondeo del total. Cambiar la unidad de cobro sincroniza la unidad de las tarifas por tiempo dentro de la misma transacción y exige confirmación explícita, porque los precios no se convierten. Los importes siguen siendo enteros COP.

## D-012 — Errores de dominio con mensaje público

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: `OperationError` (`src/main/ipc/errors.ts`) transporta un código y un mensaje en español pensado para el operador; cualquier otro error se sigue convirtiendo en `OPERATION_FAILED` genérico.
- Motivo: mensajes como «esta tarifa ya se usó» o el detalle de una validación son accionables, mientras que trazas y rutas internas no deben salir del proceso principal.
- Consecuencia: solo se lanza `OperationError` con texto revisado; nunca se envuelve en él un error de infraestructura.

## D-013 — Ingreso y salida como operaciones transaccionales

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: `ParkingService` resuelve el ciclo completo en el proceso principal. El ingreso crea o reutiliza el vehículo y abre la sesión; la salida recalcula el cobro, registra el pago, emite el recibo con un snapshot inmutable y cierra la sesión, todo dentro de una sola transacción SQLite. La anulación marca la sesión como `cancelled` con motivo obligatorio.
- Motivo: el cobro y el cierre no pueden quedar a medias, y el recibo debe poder reimprimirse sin recalcular una tarifa que pudo cambiar después.
- Consecuencia: una salida dentro del tiempo de gracia cierra la sesión sin pago ni recibo, porque `payments.amount_cop` exige un valor positivo. El consecutivo del recibo se calcula dentro de la transacción. La impresión ocurre después de confirmar la escritura y nunca revierte la operación: si falla, el resultado lo informa sin perder el registro.

## D-014 — El total confirmado se verifica al cobrar

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: `closeSession` recibe el total que vio el operador y lo compara con el que recalcula al momento de cerrar. Si difieren, rechaza la operación con el código `CHARGE_CHANGED` y la interfaz vuelve a cotizar.
- Motivo: entre cotizar y confirmar puede cruzarse el límite de una hora o de un minuto, y cobrar en silencio un valor distinto al mostrado rompe la confianza en la caja.
- Consecuencia: la salida usa siempre la tarifa vigente al momento de cerrar, no la del ingreso. El diálogo de salida debe cotizar contra el proceso principal antes de habilitar el cobro; el estimado que se muestra en el listado es solo informativo.

## D-015 — La gracia es una tolerancia sobre la fracción

- Fecha: 2026-08-19
- Estado: aceptada
- Reemplaza: la regla de gracia de D-011
- Decisión: cobrando por hora se cobran las horas cumplidas y la fracción final solo cuando supera la gracia. Con 5 minutos de tolerancia, salir a la hora y 5 cobra una hora y salir a la hora y 6 cobra dos. La tolerancia se vuelve a aplicar en cada salida, no solo al ingresar. Cobrando por minuto no existe fracción, así que la gracia actúa como umbral inicial.
- Motivo: es la regla real del parqueadero. La versión anterior cobraba el tiempo completo apenas se superaba la gracia inicial, de modo que una hora y diez minutos costaba dos horas.
- Consecuencia: con gracia cero el resultado equivale a redondear hacia arriba, así que el modelo anterior sigue disponible configurando 0. `ParkingCharge` expone `forgivenMinutes` para que la interfaz y el recibo expliquen qué se perdonó. La base de cálculo son minutos cumplidos (`elapsedMinutes`), no iniciados: contar minutos iniciados adelantaría el salto de hora casi un minuto y contradiría la regla en el borde.

## D-016 — La plena reemplaza el tope diario

- Nota: el ciclo de 24 horas y el borde descritos aquí fueron reemplazados por D-026. El resto sigue vigente.

- Fecha: 2026-08-19
- Estado: aceptada
- Reemplaza: el tope por día iniciado introducido en D-011
- Decisión: cada tarifa define el precio de su plena, el día completo, y la configuración general define el umbral de horas que la activa. Cada 24 horas cobrables cuentan como una plena; el excedente se convierte en otra plena cuando alcanza el umbral y, si no lo alcanza, se cobra por hora. Con el umbral en 10, hora a 5.000 y plena a 30.000: 9 horas cuestan 45.000, 10 horas cuestan 30.000, 33 horas cuestan 75.000 y 34 horas cuestan 60.000.
- Motivo: es la regla real del parqueadero. El tope por día iniciado que existía antes solo limitaba el total y no reproducía el umbral ni la reanudación del cobro por horas después del día.
- Consecuencia: `daily_cap_cop` se migró a `plena_cop` conservando los valores. La plena solo aplica cobrando por hora, porque el umbral se expresa en horas. La regla es un umbral, no un techo: quedarse 9 horas cuesta más que quedarse 10, y eso es intencional. Los recibos pasan a versión 2 con `plenaCount`, `plenaUnitCop` y `chargedUnits`; los de versión 1 se normalizan al reimprimirse.

## D-017 — Historial de salidas de solo lectura

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: el historial consulta sesiones cerradas y anuladas con filtro por matrícula y rango de fechas locales, y permite reimprimir cualquier recibo desde su snapshot. No modifica nada.
- Motivo: el operador necesita recuperar un recibo después de cambiar de pantalla, y hasta ahora solo podía reimprimir la última salida.
- Consecuencia: los totales se calculan sobre todo el filtro aunque la página muestre menos registros. Anular o corregir un cobro ya emitido queda para Caja, porque afecta el arqueo del turno.

## D-018 — Mensualidades con vigencia de días completos y pagos por abono

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: el módulo de Mensualidades se apoya en `monthly_customers`, `monthly_subscriptions` y los planes con `billing_unit = 'month'`. El operador elige fechas locales `AAAA-MM-DD`; `startsAt` es el comienzo del primer día cubierto y `endsAt` el comienzo del día siguiente al último, de modo que la cobertura es el intervalo semiabierto `[startsAt, endsAt)`. El estado vigente se deduce del calendario (pendiente, vigente, vencida) salvo la cancelación, que es la única decisión persistida tal cual. Una mensualidad se paga por abonos: el saldo es la diferencia entre el costo acordado y lo abonado, y cada pago emite un recibo inmutable reimprimible. Un vehículo no puede tener dos mensualidades que se crucen; renovar crea un periodo nuevo que empieza el día siguiente al último cubierto.
- Motivo: reproducir la regla real del parqueadero: el cliente paga por adelantado un periodo de días completos y su vehículo entra y sale sin cobro por horas mientras la mensualidad lo cubra. Los días completos evitan ambigüedad de horarios y la vigencia derivada impide que una mensualidad quede desactualizada tras la medianoche.
- Consecuencia: la exención se resuelve consultando cobertura por fecha en la salida (no por el estado guardado), dejando el total en cero sin ocultar la permanencia. El plan define el costo sugerido y el tipo de vehículo, sin bloquearlos al crear la mensualidad. Los pagos de mensualidad no dependen de Caja y su `cash_register_session_id` queda en `NULL` hasta que exista ese módulo. El plan `day` queda reservado para un cobro por día distinto de la plena y no se administra aquí.

## D-019 — Caja con una sola sesión abierta y arqueo en vivo

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: la caja es una sesión de turno con fondo inicial, una sola sesión abierta a la vez y cierre explícito. Cada pago de parqueo o de mensualidad se asocia, al registrarse, a la caja abierta en ese momento mediante `payments.cash_register_session_id`; si no hay caja abierta, el pago se registra igual y su campo queda en `NULL`. El arqueo se calcula en vivo como fondo inicial más lo recaudado (pagos `completed`) menos lo anulado. El cierre guarda lo contado por el operador y lo esperado, y expone la diferencia (sobrante o faltante).
- Motivo: la operación presencial necesita un solo lugar donde caigan los cobros del turno y un cierre que reconcilie lo contado contra lo esperado, sin bloquear el registro de una salida cuando por error no se abrió la caja.
- Consecuencia: un cobro solo se anula dentro de la caja abierta que lo contiene, para no alterar el arqueo inmutable de una caja ya cerrada. Anular deja `payments.status = 'voided'` y `receipts.status = 'voided'`, y no reabre la sesión de parqueo ni revierte el saldo de una mensualidad más allá de lo que deduce el propio cálculo (el abono de una mensualidad se recalcula a partir de pagos `completed`). La anulación exige motivo.

## D-020 — Empleados y turno de caja asociado

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: cada turno de caja se asocia a un empleado, administrado desde Configuración. Al abrir la caja se selecciona un empleado activo y la sesión guarda `cash_register_sessions.employee_id`; el estado y el cierre muestran su nombre.
- Motivo: el arqueo debe identificar quién operó el turno, sin recurrir a cuentas ni a autenticación remota.
- Consecuencia: un empleado con turnos registrados no se elimina, solo se desactiva; abrir caja exige un empleado activo. La caja cerrada conserva la referencia al empleado con borrado restrictivo, de modo que el historial de turnos permanece íntegro.

## D-021 — Caja abierta como requisito para operar y cierre con recibo

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: la operación monetaria exige caja abierta: no se registran ingresos, cobros de salida ni pagos de mensualidad sin una caja abierta. El cierre de caja genera un arqueo persistente que queda en un historial consultable y que se puede imprimir como recibo (empleado, fondo, recaudado, anulado, esperado, contado y diferencia).
- Motivo: sin caja abierta un cobro quedaría sin turno ni responsable, imposible de anular o conciliar; el recibo de cierre respalda el arqueo y el operador necesita recuperarlo después.
- Consecuencia: las salidas sin cobro (gracia o mensualidad) no exigen caja, pero su ingreso sí. El historial de cierres se reconstruye desde `cash_register_sessions` y sus pagos; no se crea una entidad nueva. El arqueo de una caja cerrada es inmutable.

## D-022 — Efectivo recibido obligatorio en pagos en efectivo

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: todo cobro en efectivo (salida de parqueo o pago de mensualidad) exige registrar el efectivo recibido, que debe cubrir el total, y calcula el cambio automáticamente. Los demás medios no llevan ese campo. Se valida en el esquema de entrada y se revalida en el servicio.
- Motivo: el operador siempre recibe el efectivo al cobrar; dejarlo opcional dejaba pagos sin cambio ni trazabilidad y rompía la coherencia con el arqueo de caja.
- Consecuencia: las salidas sin cobro (gracia o mensualidad) siguen sin exigir efectivo. El desglose del recibo conserva recibido y cambio como enteros COP.

## D-023 — Los duplicados se marcan y el tiquete solo se reimprime en sesión activa

- Fecha: 2026-08-21
- Estado: aceptada
- Decisión: el tiquete de ingreso se reimprime desde la confirmación del registro y desde Parqueo activo, pero únicamente mientras la sesión está activa; una sesión cerrada o anulada responde `SESSION_NOT_ACTIVE`. El tiquete no guarda snapshot: se reconstruye con los datos vigentes de la tarifa, que no puede eliminarse mientras una sesión la referencie. Todo documento reimpreso, de ingreso o de salida, se marca en el papel como «REIMPRESIÓN» con la fecha y hora del duplicado. El recibo de salida agrega el empleado del turno y la nota de la salida, lo que lleva `ReceiptSnapshot` a la versión 3.
- Motivo: el tiquete es lo que el cliente entrega para retirar el vehículo y el recibo es el respaldo de un cobro; un duplicado indistinguible del original permite sacar un vehículo ya cobrado o justificar dos veces el mismo pago. Reimprimir el tiquete de una sesión cerrada o anulada crearía directamente ese comprobante de un vehículo que ya no está en el parqueadero. El empleado y la nota ya existían en la operación pero no llegaban al papel que se entrega.
- Consecuencia: el recibo de salida conserva su snapshot inmutable, así que la marca de duplicado es una decisión de render y no altera lo guardado. Los recibos anteriores a la versión 3 se normalizan sin empleado en lugar de atribuirse a quien opera hoy. Si más adelante se necesita reponer un tiquete perdido después de la salida, debe resolverse como una operación propia con su auditoría, no reabriendo esta reimpresión.

## D-024 — Tarifas solo administra planes por tiempo y el cobro exige un reloj coherente

- Fecha: 2026-08-21
- Estado: aceptada
- Decisión: el módulo de Tarifas rechaza con `RATE_PLAN_NOT_APPLICABLE` cualquier plan cuya unidad no sea `minute` ni `hour`, tanto al editar como al eliminar y al simular, y `registerEntry` rechaza abrir una sesión con uno de esos planes. La lectura de `app_settings` valida cada ajuste por separado: un valor corrupto cae a su predeterminado sin arrastrar a los demás. Si la hora del equipo queda antes de la del ingreso, el cobro se rechaza con `CLOCK_BEFORE_ENTRY` y un mensaje accionable, mientras que las pantallas informativas muestran cero en lugar de caerse.
- Motivo: `listPlans` ya ocultaba los planes de Mensualidades, pero eliminar y simular no lo comprobaban: se podía borrar desde Tarifas un plan mensual sin suscripciones y simular uno de 150.000 al mes como si fueran 150.000 por hora, que devolvía 300.000 por dos horas. La lectura de ajustes hacía `safeParse` del conjunto completo, así que una sola clave inválida revertía en silencio la unidad de cobro y el redondeo con los que se estaba cobrando. Y un reloj retrasado hacía que `elapsedMinutes` lanzara un `RangeError`, que llegaba al operador como un fallo genérico sin explicación y bloqueaba la salida.
- Consecuencia: Mensualidades sigue siendo el único módulo que administra los planes `month`, igual que ya lo hacía en sus consultas. Las sesiones antiguas que referencien un plan que no sea por tiempo se pueden seguir cerrando, porque la guardia está en el ingreso y no en la liquidación. Un ajuste inválido deja de ser silencioso solo en su propio campo: si se necesita avisarlo al operador, debe añadirse aparte. El cobro nunca liquida una permanencia negativa como cero.

## D-025 — La tolerancia arranca en la hora que se configure

- Fecha: 2026-08-26
- Estado: aceptada
- Complementa: D-015
- Decisión: la configuración general suma `tariff.graceFromHour`, la hora cobrable a partir de la cual la tolerancia empieza a perdonar la fracción. Con el valor por defecto `1`, la primera hora se cobra completa desde el minuto uno y la gracia solo entra al superarla: con 5 minutos de tolerancia, salir a los 4 minutos cobra una hora, salir a la hora y 5 cobra una hora y salir a la hora y 6 cobra dos. Con `0` se recupera exactamente el comportamiento de D-015, en el que la tolerancia también perdona el primer tramo y la salida temprana no genera cobro ni recibo. Cobrando por minuto la gracia sigue siendo un umbral inicial gratuito, que solo existe con el umbral en `0`. El ajuste es general, no por tarifa.
- Motivo: el parqueadero cobra la hora desde que el vehículo entra; la tolerancia existe para que quien alcanza el límite de una hora tenga margen para pagar y salir, no para regalar las estadías cortas. Con la regla anterior, cualquier salida dentro de la gracia se iba sin pagar.
- Consecuencia: `ParkingCharge` expone `graceFromHour` junto a `graceMinutes`, así que el desglose y el recibo pueden explicar la política vigente. Una permanencia de cero minutos cumplidos sigue sin generar cobro, que es el caso del ingreso registrado por error. El ajuste vive en `app_settings` y no necesita migración; las instalaciones existentes que no lo tengan guardado toman el valor por defecto `1`, de modo que la actualización cambia el cobro de las salidas tempranas.

## D-026 — La plena es un ciclo configurable con bloqueo de costo

- Fecha: 2026-08-26
- Estado: aceptada
- Reemplaza: el ciclo de 24 horas y el borde del umbral de D-016
- Decisión: la configuración general suma `tariff.plenaHours`, la duración que cubre una plena, junto al umbral `tariff.plenaThresholdHours`, que pasa a leerse como el máximo de horas sueltas que se cobran antes de la plena. El tiempo cobrable avanza en ciclos de `plenaHours`: dentro de cada ciclo se cobran horas sueltas mientras no se supere el umbral, y la primera hora que lo supera congela el tramo en el precio de la plena hasta cerrar el ciclo. El borde deja de ser «alcanzar» y pasa a ser «superar». Con hora a 3.500, plena a 20.000, umbral de 5 y plena de 12: 5 horas cobran 17.500, 5 h 06 con 5 minutos de tolerancia cobran 20.000, 12 horas cobran 20.000, 12 h 06 cobran 23.500, 17 horas cobran 37.500 y 17 h 06 cobran 40.000. El umbral debe ser menor que la duración de la plena; la regla cruza dos ajustes que se guardan por separado, así que se valida sobre el resultado combinado en `TariffService.updateSettings` y se rechaza con `PLENA_THRESHOLD_INVALID`.
- Motivo: es la regla real del parqueadero. El ciclo de 24 horas no era configurable, de modo que una plena de 12 horas no se podía expresar, y el borde en «alcanzar» cobraba la plena en la hora del umbral en lugar de dejar que esa hora todavía se cobrara suelta.
- Consecuencia: la tolerancia sigue resolviéndose antes del reparto, así que el margen de la plena y el del umbral salen de la misma regla de D-015 y D-025 sin lógica aparte. `splitIntoPlenas` recibe el par umbral/duración y ya no conoce el día. Al leer los ajustes, un umbral guardado que no quepa en la plena vigente cae a su predeterminado en lugar de bloquear el guardado de los demás ajustes, que es el caso de las instalaciones anteriores a esta decisión. La duración es general, no por tarifa: cada tarifa sigue aportando solo el precio de su plena.

## D-027 — El registro de ingreso solo ofrece tipos de vehículo con tarifa activa

- Fecha: 2026-08-27
- Estado: aceptada
- Decisión: las cajas de tipo de vehículo de «Registrar ingreso» se derivan de las tarifas activas en lugar de listar los cuatro valores de `VEHICLE_TYPE_LABELS`. Un tipo sin ninguna tarifa activa no se ofrece, y desactivar la última tarifa de un tipo lo retira de la pantalla. Si el tipo seleccionado deja de estar disponible, la selección pasa al primer tipo que sí lo esté. Con ningún tipo disponible se conserva el aviso «Todavía no hay tarifas activas» que ya enlazaba a Configuración. Cuando se oculta al menos un tipo, la pantalla lo explica bajo el grupo. Administrar tarifas sigue trabajando sobre los cuatro tipos: la restricción es solo del registro.
- Motivo: ofrecer un tipo sin tarifa activa presenta como operable algo que no se puede cobrar. «Otro» aparecía siempre aunque nunca se le hubiera creado una tarifa, y una tarifa desactivada seguía estorbando en la pantalla que más se usa.
- Consecuencia: desaparece el respaldo silencioso de `suggestedPlans`, que ante un tipo sin tarifa propia caía sobre todas las tarifas activas y preseleccionaba la de otro tipo. Ese respaldo permitía registrar una bicicleta con la tarifa del automóvil sin ningún aviso, así que la sesión quedaba con un cobro que no correspondía. Ahora la lista de tarifas del tipo elegido nunca está vacía y el plan sugerido siempre pertenece al tipo seleccionado. `RadioCards` reparte el ancho con `auto-fit`, de modo que el grupo se ve completo con dos, tres o cuatro opciones.

## D-028 — Los avisos tienen tono, rejilla fija y acciones fuera del texto

- Fecha: 2026-08-27
- Estado: aceptada
- Decisión: `Alert` pasa de dos variantes a cuatro con tono propio (`default`, `warning`, `destructive`, `success`), cada una con superficie, contorno, icono y color de texto. El icono lo pone el componente según el tono y la pantalla ya no lo pasa. El aviso se arma sobre una rejilla de tres columnas —icono, texto y acciones— de modo que las acciones viven en `AlertActions`, a la derecha y centradas, en lugar de colgar dentro de `AlertDescription`. Un error usa `role="alert"`; los demás tonos usan `role="status"`. `AlertTitle` deja de ser `<h5>` y pasa a `<p>`.
- Motivo: un requisito pendiente («no hay caja abierta») se veía igual que una nota neutra, y el botón de la acción quedaba suelto bajo el texto con la única ayuda de una clase de maquetación por pantalla. El icono absoluto no se alineaba con el título, y un `<h5>` suelto ensuciaba el esquema de encabezados de la página.
- Consecuencia: desaparecen `.alert-with-action`, `.exit-summary` y la regla muerta `.inline-error`. Los resúmenes de salida, cierre de caja y pago mensual pasan a `success`, y los avisos de requisito a `warning`. La región viva anidada de `.reprint-status` se retira: el aviso ya es una región viva y anunciarlo dos veces duplicaba la lectura. Los colores del texto van a opacidad plena porque cualquier transparencia sobre el tinte baja del 4.5:1 de la norma; la jerarquía la da el peso y el tamaño, no el color. Se suman a la paleta `--warning`, `--success` y las superficies y contornos de los tres tonos con tinte.

## D-029 — El historial resuelve el estado de la salida en una columna propia

- Fecha: 2026-08-27
- Estado: aceptada
- Decisión: `exitStatusOf` en `src/shared/parking.ts` deriva el estado de una salida —`charged`, `monthly`, `free` o `cancelled`— a partir de la anulación, la cobertura mensual y la existencia de recibo, en ese orden. El historial pasa de nueve columnas a siete más las acciones: matrícula con el tipo de vehículo debajo, estado como insignia, salida con la hora arriba y la fecha debajo, permanencia con la marca de ingreso debajo, cobro con la tarifa aplicada arriba y el desglose debajo, total y recibo con el medio de pago debajo. La función recibe la forma mínima del registro y no `ExitRecord`, porque `contracts` ya depende de `parking` y el import inverso sería circular.
- Motivo: la columna «Cobro» mezclaba el estado con el detalle del importe en una sola cadena, de modo que «Ingreso anulado», «Mensualidad · nombre del cliente», «Sin cobro» y «2 plenas + 3 horas · 12 min de tolerancia» competían por el mismo ancho. Con dos columnas de fecha y hora completas al lado, la fila se volvía ilegible.
- Consecuencia: `ratePlanName` ya venía en el contrato y no se mostraba en ninguna parte; ahora encabeza la columna del cobro, que es el dato que permite auditar por qué se cobró ese importe. `formatDate` y `formatTime` se suman a `src/shared/format.ts` para partir una marca en dos líneas sin repetir la fecha en cada fila. El listado consulta con `LIMIT MAX_HISTORY_PAGE_SIZE` mientras `totalCount` cuenta todo el filtro: con más de cien salidas la tabla mostraba cien y el encabezado anunciaba el total sin que nada indicara el recorte, así que ahora aparece un aviso con ambas cifras. La barra de filtros suma «Limpiar filtros». `Badge` gana tonos suaves (`success`, `warning`, `danger`, `muted`) apoyados en los tokens de D-028.

## D-030 — Registrar ingreso es una sola columna centrada y el campo de matrícula filtra al escribir

- Fecha: 2026-08-27
- Estado: aceptada
- Decisión: `sanitizePlateInput` en `src/shared/validation.ts` deja el campo de matrícula únicamente con letras sin tilde y dígitos, y lo corta en `MAX_PLATE_LENGTH`. Las tildes y la eñe se reducen a su letra base en lugar de borrarse. La pantalla de ingreso pasa a una columna centrada de 34 rem: título breve con la instrucción «Escribe la matrícula y presiona Enter», campo de matrícula grande y centrado, cajas de tipo de vehículo de 4.5 rem, tarifa y botón principal de ancho completo. La nota se oculta tras «Agregar nota». Cuando solo una tarifa aplica al tipo elegido se muestra su nombre y precio en lugar de un desplegable. Registrado el ingreso, el foco pasa a «Registrar otro ingreso».
- Motivo: el registro es la operación que más se repite y debe resolverse sin ratón ni lectura. El esquema ya rechazaba los símbolos, pero lo hacía después de enviar, así que el error aparecía cuando el operador creía haber terminado. La pantalla estaba alineada a la izquierda con una tarjeta titulada, un desplegable de un solo elemento y un campo de nota siempre visible: tres cosas que estorban en el camino rápido.
- Consecuencia: el saneado y el esquema comparten `MIN_PLATE_LENGTH` y `MAX_PLATE_LENGTH`, de modo que el campo nunca puede llegar a un valor que el esquema rechace por formato; solo queda posible el error de largo mínimo, que es el único que el operador puede corregir escribiendo. El campo pasa de `register` a `Controller` porque el valor se transforma en cada pulsación. `.narrow-page` desaparece: solo la usaba esta pantalla y su `margin-inline: 0` era justamente lo que la dejaba descentrada. El desplegable sigue apareciendo en cuanto haya dos o más tarifas para el tipo, así que el ahorro de un clic no oculta ninguna opción real.

## D-031 — Registrar salida es una pantalla propia que solo pide la matrícula

- Fecha: 2026-08-27
- Estado: aceptada
- Decisión: la ruta `/salidas` monta `ExitPage`, gemela de Registrar ingreso: columna centrada, un único campo de matrícula con el mismo saneado de D-030 y un botón «Registrar salida». Al enviar, la pantalla busca la sesión activa y abre directamente el `ExitDialog` que ya existe, con la cotización, el medio de pago, el efectivo recibido y el cobro. Cerrado el cobro, la pantalla muestra el resumen de la salida con el recibo y deja el foco en «Registrar otra salida». El acceso queda únicamente en el dashboard: un botón junto a «Registrar ingreso» y la baldosa de acciones rápidas, que ya se llamaba «Registrar salida» y apuntaba a Parqueo activo. No se añade a la navegación lateral.
- Motivo: cobrar una salida obligaba a entrar a Parqueo activo, buscar la fila y pulsar su acción. Con la matrícula en la mano, la búsqueda y la elección sobran: una matrícula tiene como mucho un ingreso activo, que `registerEntry` garantiza rechazando el duplicado con `SESSION_ALREADY_OPEN`.
- Consecuencia: no se añade ningún canal IPC. La búsqueda reutiliza `listActiveSessions`, cuya coincidencia es parcial, y la pantalla exige coincidencia exacta sobre el resultado: escribir «ABC» no debe cobrar la salida de «ABC123». Sin coincidencia se avisa con la matrícula buscada y un enlace a Parqueo activo, que sigue siendo la pantalla para revisar y anular. `ExitDialog` se reutiliza sin tocarlo, de modo que la regla de cobro vive en un solo sitio; la pantalla limpia el error del store antes de abrirlo para que un fallo anterior no aparezca como si fuera de esta salida. Las clases de maquetación de la pantalla rápida pasan de `entry-*` a `quick-*` porque ahora las comparten las dos.

## D-032 — El diálogo de salida solo exige efectivo cuando hay algo que cobrar

- Fecha: 2026-08-27
- Estado: aceptada
- Corrige: la condición de habilitación introducida junto a D-022
- Decisión: `missingCash` en `ExitDialog` pasa a evaluarse solo cuando el total es mayor que cero, que es la misma condición que aplica `closeSession` en el proceso principal. Registrar salida se suma a la navegación lateral, debajo de Registrar ingreso.
- Motivo: `missingCash` era `method === 'cash' && (receivedValue === null || receivedValue < total)`. Con el total en cero, el diálogo no dibuja el medio de pago ni el campo de efectivo, pero `method` seguía valiendo `'cash'` y `received` seguía siendo `NaN`, de modo que la condición era verdadera y el botón de confirmar quedaba deshabilitado sin ningún campo donde corregirlo. Toda salida sin cobro era imposible de registrar desde la interfaz: las cubiertas por una mensualidad vigente y también las que salen dentro de la tolerancia. El proceso principal siempre estuvo bien y sus pruebas lo demostraban; el bloqueo era únicamente del renderer, así que ninguna prueba del servicio podía detectarlo.
- Consecuencia: una mensualidad vigente vuelve a poder entrar y salir dejando la sesión cerrada, sin pago, sin recibo y con el vínculo a la suscripción, que es lo que `closeSession` ya hacía. `PaymentDialog` de mensualidades usa una condición parecida, pero allí el importe siempre es positivo y el campo de efectivo siempre está en pantalla, así que no tiene el estado inalcanzable y se deja como está. La barra inferior de pantallas angostas pasa de `repeat(8, 1fr)` a columnas automáticas: estaba fijada al número de secciones y la novena la habría desbordado.

## D-033 — El canal de actualización se deriva de la versión instalada

- Fecha: 2026-09-01
- Estado: aceptada
- Complementa: D-007 y D-008
- Decisión: `electron-updater` conserva la selección de pre-releases que deriva del SemVer instalado y no fuerza el canal `latest`. Una instalación `alpha` puede avanzar a otra `alpha`, a `beta` o a estable; una `beta` no vuelve a `alpha`; una estable no recibe pre-releases. Solo los tags `v*` cuya versión coincide con `package.json` publican una actualización, y una release existente nunca reemplaza sus artefactos. La consulta al arrancar es automática, pero descargar y reiniciar siguen siendo decisiones explícitas del operador. El pipeline admite credenciales de firma mediante secretos sin exigirlas todavía a los builds de prueba.
- Motivo: forzar `allowPrerelease = false` y `channel = 'latest'` hacía que la única versión publicada, `0.1.0-alpha.1`, buscara exclusivamente una release estable y no pudiera recibir la siguiente `alpha`. Publicar cada push no sirve sin incrementar SemVer y enviaría trabajo no liberado a los equipos. El reinicio desatendido puede interrumpir un cobro o una impresión. En macOS, Electron exige firma para actualizar y el sistema exige notarización para una distribución normal fuera de la App Store.
- Consecuencia: enviar `main` solo ejecuta CI; distribuir exige incrementar la versión y enviar su tag. `0.1.0-alpha.1` necesita una actualización manual única si la siguiente versión también es pre-release, mientras que los instaladores creados después de esta decisión siguen su canal automáticamente. GitHub Actions rechaza tags incongruentes y releases duplicadas. Los secretos `WIN_CSC_*`, `CSC_*` y `APPLE_*` nunca se versionan; hasta configurarlos, Windows continúa con advertencias y macOS no se considera apto para actualización automática real.

## D-034 — El tiquete guarda un snapshot y los lectores operan como teclado

- Fecha: 2026-09-15
- Estado: aceptada
- Reemplaza: la parte de D-023 que reconstruía el tiquete con la tarifa vigente; complementa D-031
- Decisión: cada ingreso nuevo guarda en `parking_sessions.entry_snapshot_json` una copia versionada de los datos emitidos. El papel incluye un QR `PC1Q` con ese snapshot y un Code 128 `PC1S` con la referencia compacta de la sesión. La salida acepta cualquiera de esos códigos o una matrícula mediante el canal validado `parking:resolve-exit-target`. Los lectores se soportan por USB HID en modo teclado, con Enter o Tab como terminador; no se integra un SDK de fabricante. Un logo opcional validado se conserva en `app_settings` y se imprime sin exponer rutas al renderer.
- Motivo: el tiquete debe demostrar qué matrícula, tarifa, hora y operador existían al recibir el vehículo, incluso si la configuración cambia antes de reimprimir. El lector YHD-9300 comprado soporta QR y Code 128, pero usar el estándar de teclado mantiene el flujo compatible con muchos modelos 1D/2D y completamente offline. El Code 128 corto evita intentar meter todo el snapshot en un símbolo lineal excesivamente ancho.
- Consecuencia: SQLite sigue siendo la autoridad para cobrar. Un QR se contrasta con el snapshot almacenado y un código de una sesión cerrada o alterado no abre el cobro; nunca se liquida usando el precio impreso. Las sesiones anteriores a `0006` conservan `NULL` y todavía pueden resolverse por matrícula o por referencia. La escucha global solo reconoce prefijos propios y se desactiva cuando el foco está en un campo o existe un diálogo, para no interferir con la operación.

## D-035 — La instalación cierra recursos y ventanas antes de ejecutar NSIS

- Fecha: 2026-09-15
- Estado: aceptada
- Complementa: D-007 y D-033
- Decisión: **Reiniciar e instalar** cambia primero al estado `installing` y devuelve ese estado al renderer. Tras una pausa breve para entregar la respuesta IPC, el proceso principal bloquea la reapertura de ventanas, desregistra los handlers, cierra SQLite, destruye todas las ventanas y ejecuta `quitAndInstall` silenciosamente con relanzamiento. Si Electron siguiera activo cinco segundos después, `app.exit(0)` lo finaliza. `autoInstallOnAppQuit` permanece desactivado aun con la descarga completa.
- Motivo: el flujo anterior iniciaba el instalador interactivo antes de que `quitAndInstall` solicitara el cierre de Electron y además activaba una segunda ruta implícita al cerrar. En Windows el instalador podía detectar Parking Chía todavía activo y quedar esperando, que impedía completar la actualización desde el botón.
- Consecuencia: instalar sigue requiriendo la confirmación explícita del operador y no ocurre por un cierre ordinario. La base se libera antes de reemplazar archivos, no se crean ventanas nuevas durante el apagado y las llamadas repetidas al botón no lanzan más de un instalador. La salida forzada solo se arma después de cerrar los recursos locales y debe conservarse mientras `electron-updater` inicie NSIS antes de terminar el proceso padre.

## D-036 — El NIT del parqueadero se valida con el dígito de verificación de la DIAN

- Fecha: 2026-09-17
- Estado: aceptada
- Decisión: el perfil del parqueadero admite un NIT opcional guardado en `app_settings` con la clave `parking.nit`, en forma compacta `base-DV` (`800197268-4`). Se acepta escrito con puntos, espacios o comas, exige el dígito de verificación tras un guion y lo contrasta con el módulo 11 de la DIAN. La base admite de 3 a 10 dígitos para cubrir con una sola regla a personas jurídicas (9 dígitos), personas naturales (su cédula) y otros inscritos en el RUT. Se muestra y se imprime agrupado (`800.197.268-4`) bajo el nombre en todos los documentos.
- Motivo: el NIT identifica al responsable en tiquetes y recibos. Distinguir tipos de persona solo cambiaría el largo esperado, mientras que el dígito de verificación detecta un número mal escrito en cualquiera de ellos. El guion obligatorio evita confundir una cédula de 10 dígitos con un NIT de 9 dígitos y su DV pegado.
- Consecuencia: no hay migración de esquema; las instalaciones existentes quedan sin NIT hasta que el operador lo registre. Un perfil que omite el campo conserva el valor guardado y un campo vacío lo elimina. Si más adelante se requiere facturación electrónica, el tipo de persona y la responsabilidad frente al IVA deberán modelarse aparte.

## D-037 — Los tipos de vehículo son una lista compartida respaldada por restricciones

- Fecha: 2026-09-17
- Estado: aceptada
- Complementa: D-027
- Decisión: `VEHICLE_TYPES` en `src/shared/tariff.ts` define el valor, el orden visible y, junto a `VEHICLE_TYPE_LABELS`, la etiqueta en español de cada tipo. La lista pasa a diez: `car`, `pickup`, `van`, `taxi`, `bus`, `truck`, `motorcycle`, `scooter`, `bicycle` y `other`. Las columnas `vehicle_type` de `vehicles` y `rate_plans` conservan una restricción `CHECK` con los mismos valores; la migración `0007` recrea ambas tablas preservando filas y referencias. `src/main/database/schema.ts` repite la lista porque drizzle-kit no resuelve los alias del proyecto, y `migration.test.ts` verifica que ambas coincidan.
- Motivo: un parqueadero cobra distinto a una camioneta, un camión o un bus, y con cuatro tipos esas tarifas se mezclaban en «Otro». Mantener la lista en un solo módulo evita que cada pantalla arme su propio menú, y la restricción en SQLite impide que un valor inventado entre por IPC o por una migración futura.
- Consecuencia: agregar o retirar un tipo exige una migración y actualizar la lista de `schema.ts`; un tipo retirado necesitaría además reasignar las filas que lo usen. La pantalla de ingreso no se recarga de opciones porque solo muestra los tipos con una tarifa activa (D-027). Los iconos de cada tipo viven en el renderer y no forman parte del contrato.

## D-038 — El tiquete imprime un código numérico en lugar del snapshot

- Fecha: 2026-09-18
- Estado: aceptada
- Reemplaza: la parte de D-034 que ponía el snapshot en el QR y el UUID decimal en el Code 128
- Decisión: el QR y el Code 128 del tiquete llevan el mismo código de 16 dígitos: los primeros 48 bits del UUID de la sesión en decimal (15 dígitos) y un dígito de verificación Luhn. El proceso principal busca la sesión activa cuyo identificador empieza por ese prefijo y pide la matrícula si hubiera más de una. Los módulos se dibujan con un número entero de puntos del cabezal y con zona de silencio propia. El snapshot sigue guardándose en `parking_sessions.entry_snapshot_json` para reimprimir; solo deja de viajar en el papel. Los códigos `PC1Q` y `PC1S` ya impresos se siguen leyendo, reparando los daños conocidos del teclado.
- Motivo: el lector funciona como un teclado estadounidense. En la distribución latinoamericana del cliente, el `-` y el `_` del base64url llegaban como `'` y `?`, y el bloqueo de mayúsculas invertía las letras, así que el QR con el snapshot fallaba. El Code 128 de 43 caracteres ocupaba el ancho completo con módulos de 1,7 puntos: sus barras salían de 1 o 2 puntos según la posición y no respetaban las proporciones del símbolo; en 58 mm ni siquiera se decodificaba en una simulación a 8 puntos por milímetro. Un código numérico corto es idéntico en cualquier distribución, cabe con módulos de 2 o 3 puntos y un dígito de verificación detecta errores al teclearlo.
- Consecuencia: el papel ya no permite comprobar sin la base qué datos tenía el ingreso; SQLite sigue siendo la única autoridad del cobro. Un código de 16 dígitos no puede confundirse con una matrícula, por lo que no lleva prefijo. Cambiar el tamaño de los módulos exige verificar de nuevo la lectura rasterizando a 8 puntos por milímetro, y el Code 128 en 58 mm debe considerarse un respaldo del QR.

## Plantilla para una nueva decisión

```markdown
## D-NNN — Título breve

- Fecha: AAAA-MM-DD
- Estado: propuesta | aceptada | reemplazada | descartada
- Reemplaza: D-NNN (si aplica)
- Decisión: qué se decidió.
- Motivo: por qué esta opción satisface las restricciones.
- Consecuencia: qué deben respetar los cambios futuros.
```
