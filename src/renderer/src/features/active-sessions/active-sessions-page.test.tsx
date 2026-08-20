import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useParkingStore } from '@/store/parking-store'
import { ActiveSessionsPage } from './active-sessions-page'

describe('Parqueo activo', () => {
  beforeEach(() => {
    useParkingStore.setState({ sessions: [], search: '', loading: true, error: null })
  })

  it('lista los vehículos activos con su permanencia y cobro estimado', async () => {
    render(<ActiveSessionsPage />)

    const table = await screen.findByRole('table')
    const row = within(table).getByRole('row', { name: /ABC123/ })
    expect(within(row).getByText('Automóvil')).toBeInTheDocument()
    expect(within(row).getByText(/^1 h 3\d min$/)).toBeInTheDocument()
    expect(within(row).getByText(/^\$\s10\.000$/)).toBeInTheDocument()
  })

  it('orienta al operador cuando la búsqueda no encuentra la matrícula', async () => {
    render(<ActiveSessionsPage />)
    await screen.findByRole('table')

    await userEvent.type(screen.getByPlaceholderText('Buscar matrícula'), 'XYZ')

    expect(await screen.findByText('Ninguna matrícula coincide')).toBeInTheDocument()
  })

  it('cotiza la salida y registra el cobro con su recibo', async () => {
    render(<ActiveSessionsPage />)
    await screen.findByRole('table')

    await userEvent.click(screen.getByRole('button', { name: /Salida/ }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Total a cobrar')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Cobrar \$\s10\.000/ })).toBeDisabled()

    await userEvent.type(within(dialog).getByLabelText(/Efectivo recibido/), '20000')
    expect(within(dialog).getByText(/Cambio a entregar: \$\s10\.000/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Cobrar \$\s10\.000/ })).toBeEnabled()

    await userEvent.click(within(dialog).getByRole('button', { name: /Cobrar/ }))

    expect(await screen.findByText(/Salida registrada · ABC123/)).toBeInTheDocument()
    expect(screen.getByText(/Recibo N\.º 1/)).toBeInTheDocument()
  })

  it('no permite cobrar con efectivo insuficiente', async () => {
    render(<ActiveSessionsPage />)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: /Salida/ }))

    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Total a cobrar')
    await userEvent.type(within(dialog).getByLabelText(/Efectivo recibido/), '5000')

    expect(
      within(dialog).getByText('El efectivo recibido es menor que el total a cobrar.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Cobrar/ })).toBeDisabled()
  })

  it('explica el fallo cuando no se puede cotizar la salida', async () => {
    vi.mocked(window.parkingAPI.quoteSessionExit).mockResolvedValueOnce({
      ok: false,
      error: { code: 'SESSION_NOT_ACTIVE', message: 'Esa sesión ya no está activa.' },
    })
    render(<ActiveSessionsPage />)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: /Salida/ }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Esa sesión ya no está activa.')).toBeInTheDocument()
    expect(within(dialog).queryByText('Calculando el cobro…')).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Reintentar' }))
    expect(await within(dialog).findByText('Total a cobrar')).toBeInTheDocument()
  })

  it('informa el resultado de reimprimir y permite cerrar el aviso', async () => {
    render(<ActiveSessionsPage />)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: /Salida/ }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Total a cobrar')
    await userEvent.type(within(dialog).getByLabelText(/Efectivo recibido/), '10000')
    await userEvent.click(within(dialog).getByRole('button', { name: /Cobrar/ }))

    await screen.findByText(/Salida registrada/)
    await userEvent.click(screen.getByRole('button', { name: /Reimprimir recibo/ }))
    expect(await screen.findByText('No hay impresoras.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    expect(screen.queryByText(/Salida registrada/)).not.toBeInTheDocument()
  })

  it('exige un motivo antes de anular un ingreso', async () => {
    render(<ActiveSessionsPage />)
    await screen.findByRole('table')

    await userEvent.click(screen.getByRole('button', { name: /Anular/ }))
    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: 'Anular ingreso' })
    expect(confirm).toBeDisabled()

    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Matrícula errada')
    expect(confirm).toBeEnabled()

    await userEvent.click(confirm)
    await waitFor(() => {
      expect(window.parkingAPI.cancelSession).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Matrícula errada' }),
      )
    })
    expect(vi.isMockFunction(window.parkingAPI.cancelSession)).toBe(true)
  })
})
