import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert, AlertActions, AlertDescription, AlertTitle } from './alert'

describe('Alert', () => {
  it('anuncia un error de inmediato e informa el resto sin interrumpir', () => {
    const { rerender } = render(
      <Alert variant="destructive">
        <AlertTitle>No fue posible cobrar</AlertTitle>
      </Alert>,
    )
    expect(screen.getByRole('alert')).toHaveClass('alert-destructive')

    rerender(
      <Alert variant="warning">
        <AlertTitle>No hay una caja abierta</AlertTitle>
      </Alert>,
    )
    expect(screen.getByRole('status')).toHaveClass('alert-warning')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('pone el icono del tono sin que la pantalla tenga que pasarlo', () => {
    const { container } = render(
      <Alert variant="success">
        <AlertTitle>Salida registrada</AlertTitle>
      </Alert>,
    )
    const icon = container.querySelector('.alert-icon')
    expect(icon).not.toBeNull()
    // El icono es decorativo: el título ya dice lo mismo.
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('permite quitar el icono', () => {
    const { container } = render(
      <Alert icon={null}>
        <AlertTitle>Sin icono</AlertTitle>
      </Alert>,
    )
    expect(container.querySelector('.alert-icon')).toBeNull()
  })

  it('mantiene las acciones fuera de la descripción', () => {
    render(
      <Alert variant="warning">
        <AlertTitle>No hay una caja abierta</AlertTitle>
        <AlertDescription>Abre la caja del turno antes de registrar ingresos.</AlertDescription>
        <AlertActions>
          <button type="button">Abrir caja</button>
        </AlertActions>
      </Alert>,
    )
    const description = screen.getByText('Abre la caja del turno antes de registrar ingresos.')
    const action = screen.getByRole('button', { name: 'Abrir caja' })
    expect(description).toHaveAttribute('data-slot', 'alert-description')
    expect(description).not.toContainElement(action)
    expect(action.closest('.alert-actions')).not.toBeNull()
  })
})
