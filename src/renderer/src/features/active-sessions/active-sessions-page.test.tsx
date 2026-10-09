import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pendingPayment } from '@/test/setup'
import { useParkingStore } from '@/store/parking-store'
import { ActiveSessionsPage } from './active-sessions-page'

describe('Parqueo activo', () => {
  beforeEach(() => {
    useParkingStore.setState({
      sessions: [],
      pendingPayments: [],
      search: '',
      loading: true,
      error: null,
    })
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

  it('deja una salida con pago pendiente desde el cobro', async () => {
    render(<ActiveSessionsPage />)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: /Salida/ }))

    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Total a cobrar')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pago pendiente' }))

    expect(await screen.findByText(/Pago pendiente registrado · ABC123/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.parkingAPI.markPaymentPending).toHaveBeenCalledWith({
      sessionId: 'session-1',
      expectedTotalCop: 10_000,
    })
  })

  it('lista los pagos pendientes en un bloque propio y los cobra', async () => {
    vi.mocked(window.parkingAPI.listPendingPayments).mockResolvedValueOnce({
      ok: true,
      data: [pendingPayment],
    })
    render(<ActiveSessionsPage />)

    const table = await screen.findByRole('table', { name: /salieron sin pagar/ })
    expect(screen.getByText(/1 pendiente · \$\s10\.000/)).toBeInTheDocument()
    const row = within(table).getByRole('row', { name: /DEU456/ })
    expect(within(row).getByText('1 h 30 min')).toBeInTheDocument()

    await userEvent.click(within(row).getByRole('button', { name: /Cobrar/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Cobrar pago pendiente' })
    await userEvent.type(within(dialog).getByLabelText('Efectivo recibido'), '20000')
    await userEvent.click(within(dialog).getByRole('button', { name: /Cobrar \$\s10\.000/ }))

    expect(await screen.findByText(/Pago pendiente cobrado · DEU456/)).toBeInTheDocument()
    expect(screen.getByText(/Recibo N\.º 5/)).toBeInTheDocument()
    expect(screen.getByText(/Cambio a entregar: \$\s10\.000/)).toBeInTheDocument()
    // El listado se vuelve a consultar y el bloque desaparece al quedar sin pendientes.
    await waitFor(() => {
      expect(screen.queryByRole('table', { name: /salieron sin pagar/ })).not.toBeInTheDocument()
    })
  })

  it('no dibuja el bloque de pagos pendientes cuando no hay ninguno', async () => {
    render(<ActiveSessionsPage />)
    await screen.findByRole('table')

    expect(screen.queryByText('Pagos pendientes')).not.toBeInTheDocument()
  })

  it('reimprime desde la fila del pendiente correcto sin cobrarlo', async () => {
    const second = { ...pendingPayment, id: 'pending-2', sessionId: 'session-2', amountCop: 15_000 }
    vi.mocked(window.parkingAPI.listPendingPayments).mockResolvedValueOnce({
      ok: true,
      data: [pendingPayment, second],
    })
    const print = vi.mocked(window.parkingAPI.reprintPendingPaymentTicket).mockClear()
    const collect = vi.mocked(window.parkingAPI.settlePendingPayment).mockClear()
    render(<ActiveSessionsPage />)
    const table = await screen.findByRole('table', { name: /salieron sin pagar/ })
    const rows = within(table).getAllByRole('row', { name: /DEU456/ })
    await userEvent.click(within(rows[1]!).getByRole('button', { name: /Reimprimir tiquete/ }))
    expect(print).toHaveBeenCalledWith({ pendingPaymentId: 'pending-2' })
    expect(await screen.findByText('DEU456: No hay impresoras.')).toBeInTheDocument()
    expect(collect).not.toHaveBeenCalled()
    expect(within(table).getAllByRole('row', { name: /DEU456/ })).toHaveLength(2)
  })

  it('bloquea reimpresiones repetidas mientras se envía el tiquete', async () => {
    let finish!: (result: { ok: true; data: { printed: boolean; message: string } }) => void
    vi.mocked(window.parkingAPI.listPendingPayments).mockResolvedValueOnce({
      ok: true,
      data: [pendingPayment],
    })
    const print = vi
      .mocked(window.parkingAPI.reprintPendingPaymentTicket)
      .mockClear()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
    render(<ActiveSessionsPage />)
    const table = await screen.findByRole('table', { name: /salieron sin pagar/ })
    const button = within(table).getByRole('button', { name: /Reimprimir tiquete/ })
    await userEvent.dblClick(button)
    expect(button).toBeDisabled()
    expect(print).toHaveBeenCalledTimes(1)
    finish({ ok: true, data: { printed: true, message: 'Tiquete enviado.' } })
    expect(await screen.findByText('DEU456: Tiquete enviado.')).toBeInTheDocument()
    expect(button).toBeEnabled()
  })

  it('muestra el error de reimpresión y permite volver a intentarlo', async () => {
    vi.mocked(window.parkingAPI.listPendingPayments).mockResolvedValueOnce({
      ok: true,
      data: [pendingPayment],
    })
    vi.mocked(window.parkingAPI.reprintPendingPaymentTicket).mockResolvedValueOnce({
      ok: false,
      error: { code: 'PENDING_PAYMENT_NOT_FOUND', message: 'Ese pendiente ya se cobró.' },
    })
    render(<ActiveSessionsPage />)
    const table = await screen.findByRole('table', { name: /salieron sin pagar/ })
    const button = within(table).getByRole('button', { name: /Reimprimir tiquete/ })
    await userEvent.click(button)
    expect(await screen.findByText('DEU456: Ese pendiente ya se cobró.')).toBeInTheDocument()
    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(await screen.findByText('DEU456: No hay impresoras.')).toBeInTheDocument()
  })

  it('reimprime el tiquete de un vehículo que sigue en el parqueadero', async () => {
    render(<ActiveSessionsPage />)

    const table = await screen.findByRole('table')
    const row = within(table).getByRole('row', { name: /ABC123/ })
    await userEvent.click(within(row).getByRole('button', { name: /Tiquete/ }))

    await waitFor(() => {
      expect(window.parkingAPI.reprintEntryTicket).toHaveBeenCalledWith({
        sessionId: 'session-1',
      })
    })
    expect(await screen.findByText('No hay impresoras.')).toBeInTheDocument()
  })

  it('imprime el listado del parqueo activo e informa el resultado', async () => {
    vi.mocked(window.parkingAPI.printActiveSessions).mockClear()
    vi.mocked(window.parkingAPI.printActiveSessions).mockResolvedValueOnce({
      ok: true,
      data: { printed: true, message: 'El listado del parqueo activo se envió a la impresora.' },
    })
    render(<ActiveSessionsPage />)
    await screen.findByRole('table')

    await userEvent.click(screen.getByRole('button', { name: 'Imprimir parqueo activo' }))

    expect(window.parkingAPI.printActiveSessions).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText('El listado del parqueo activo se envió a la impresora.'),
    ).toBeInTheDocument()
  })

  it('no ofrece imprimir el listado cuando el parqueadero está vacío', async () => {
    vi.mocked(window.parkingAPI.listActiveSessions).mockResolvedValueOnce({ ok: true, data: [] })
    render(<ActiveSessionsPage />)

    expect(await screen.findByText('No hay vehículos activos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imprimir parqueo activo' })).toBeDisabled()
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
