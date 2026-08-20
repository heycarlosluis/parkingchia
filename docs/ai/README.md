# Memoria del proyecto para asistentes de IA

Esta carpeta mantiene contexto verificable para continuar Parking Chía con distintos asistentes sin depender del historial de una conversación.

## Fuente de verdad

- [`../../AGENTS.md`](../../AGENTS.md): reglas operativas y restricciones obligatorias.
- [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md): identidad, alcance y arquitectura estable.
- [`CURRENT_STATE.md`](CURRENT_STATE.md): estado funcional y técnico en el último corte conocido.
- [`DECISIONS.md`](DECISIONS.md): decisiones arquitectónicas aceptadas y sus consecuencias.

Los documentos especializados siguen viviendo en `docs/architecture.md`, `docs/database.md`, `docs/printing.md` y `docs/releases.md`. Esta carpeta los orienta; no intenta reemplazarlos.

## Cómo iniciar una sesión con cualquier asistente

Puedes usar este mensaje:

> Lee `AGENTS.md` y todos los archivos de `docs/ai/` antes de trabajar. Verifica el estado real del repositorio y mantén esa memoria actualizada con los cambios que realices.

Los archivos `CLAUDE.md`, `GEMINI.md` y `.github/copilot-instructions.md` hacen esa remisión automáticamente en herramientas que reconocen esas convenciones.

## Política de mantenimiento

- No guardes transcripciones, razonamientos privados, prompts completos ni información personal.
- Registra hechos comprobables, no planes presentados como terminados.
- Añade fechas ISO (`AAAA-MM-DD`) a los cortes de estado y decisiones.
- Mantén un solo estado actual: actualiza `CURRENT_STATE.md` en lugar de crear archivos de sesión acumulativos.
- Conserva la historia arquitectónica agregando decisiones; si una decisión cambia, márcala como reemplazada y enlaza la nueva.
- Evita duplicar reglas entre archivos puente. La versión completa siempre vive en `AGENTS.md`.
- Antes de cerrar una tarea relevante, comprueba que versión, funcionalidades, limitaciones y próximos pasos sigan siendo ciertos.

## Qué debe actualizar cada tipo de cambio

| Cambio                                      | Memoria que debe revisarse                                    |
| ------------------------------------------- | ------------------------------------------------------------- |
| Nueva funcionalidad o módulo                | `CURRENT_STATE.md` y documentación especializada              |
| Nuevo límite arquitectónico                 | `PROJECT_CONTEXT.md` y `DECISIONS.md`                         |
| Migración o cambio de persistencia          | `CURRENT_STATE.md`, `DECISIONS.md` y `docs/database.md`       |
| Cambio de IPC o seguridad                   | `PROJECT_CONTEXT.md`, `DECISIONS.md` y `docs/architecture.md` |
| Nueva versión o release                     | `CURRENT_STATE.md` y `docs/releases.md`                       |
| Limitación resuelta o nueva                 | `CURRENT_STATE.md`                                            |
| Solo refactor interno sin cambio observable | Normalmente no requiere actualizar memoria                    |
