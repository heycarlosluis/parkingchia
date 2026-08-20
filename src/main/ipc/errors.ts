/**
 * Error de dominio cuyo mensaje sí puede mostrarse al usuario.
 *
 * Cualquier otro error se convierte en un mensaje genérico para no filtrar
 * rutas, trazas ni detalles internos al renderer.
 */
export class OperationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'OperationError'
  }
}
