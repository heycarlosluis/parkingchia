import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CashCloseSummary, CashState } from '@shared/contracts'
import { useCashStore } from '@/store/cash-store'
import { useChargeModeStore } from '@/store/charge-mode-store'
import { CashPage } from './cash-page'

const ok = <T,>(data: T) => ({ ok: true as const, data })

const closedSummary: CashCloseSummary = {
  sessionId: 'cash-closed-1',
  employeeName: 'Laura Torres',
  openedAt: '2026-08-18T08:00:00.000Z',
  closedAt: '2026-08-18T18:00:00.000Z',
  openingAmountCop: 50_000,
  collectedCop: 10_000,
  voidedCop: 0,
  expectedAmountCop: 60_000,
  closingAmountCop: 60_000,
  differenceCop: 0,
  movementCount: 1,
  pendingBalance: { count: 0, totalCop: 0 },
}

const emptyState: CashState = {
  session: null,
  movements: [],
  collectedCop: 0,
  voidedCop: 0,
  expectedCop: 0,
  movementCount: 0,
  pendingBalance: { count: 0, totalCop: 0 },
}

const openState: CashState = {
  session: {
    id: 'cash-session-1',
    employeeId: 'employee-1',
    employeeName: 'Laura Torres',
    openedAt: '2026-08-19T08:00:00.000Z',
    closedAt: null,
    openingAmountCop: 50_000,
    closingAmountCop: null,
    expectedAmountCop: null,
    status: 'open',
    notes: null,
  },
  movements: [
    {
      paymentId: 'payment-1',
      receiptNumber: 1,
      paidAt: '2026-08-19T09:00:00.000Z',
      amountCop: 10_000,
      method: 'cash',
      status: 'completed',
      source: 'parking',
      plate: 'ABC123',
      customerName: null,
      reference: null,
    },
  ],
  collectedCop: 10_000,
  voidedCop: 0,
  expectedCop: 60_000,
  movementCount: 1,
  pendingBalance: { count: 0, totalCop: 0 },
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <CashPage />
    </MemoryRouter>,
  )
}

describe('Caja', () => {
  beforeEach(() => {
    useCashStore.setState({
      session: null,
      movements: [],
      collectedCop: 0,
      voidedCop: 0,
      expectedCop: 0,
      movementCount: 0,
      pendingBalance: { count: 0, totalCop: 0 },
      closedSessions: [],
      loading: false,
      error: null,
      message: '',
      lastClose: null,
    })
    vi.mocked(window.parkingAPI.getCashState).mockResolvedValue(ok(emptyState))
    vi.mocked(window.parkingAPI.listCashSessions).mockResolvedValue(ok([]))
  })

  it('muestra el estado vacío e invita a abrir la caja', async () => {
    renderPage()
    expect(await screen.findByText('No hay una caja abierta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abrir caja/ })).toBeInTheDocument()
  })

  it('abre la caja con el empleado y el fondo inicial indicados', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Abrir caja/ }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByLabelText('Empleado'))
    await userEvent.click(await screen.findByRole('option', { name: /Laura Torres/ }))
    await userEvent.type(within(dialog).getByLabelText('Fondo inicial'), '50000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir caja' }))

    await waitFor(() => {
      expect(window.parkingAPI.openCashSession).toHaveBeenCalledWith({
        employeeId: 'employee-1',
        openingAmountCop: 50_000,
        notes: null,
      })
    })
  })

  it('resume la caja abierta y lista sus movimientos', async () => {
    vi.mocked(window.parkingAPI.getCashState).mockResolvedValue(ok(openState))
    renderPage()

    expect(await screen.findByText('Fondo inicial')).toBeInTheDocument()
    expect(screen.getByText('Recaudado')).toBeInTheDocument()
    expect(screen.getByText('Esperado al cierre')).toBeInTheDocument()

    const table = await screen.findByRole('table')
    const row = within(table).getByRole('row', { name: /ABC123/ })
    expect(within(row).getByText('Parqueo')).toBeInTheDocument()
    expect(within(row).getByText('Registrado')).toBeInTheDocument()
    expect(within(row).getByText('Efectivo')).toBeInTheDocument()
  })

  it('anula un cobro exigiendo un motivo', async () => {
    vi.mocked(window.parkingAPI.getCashState).mockResolvedValue(ok(openState))
    renderPage()
    const table = await screen.findByRole('table')

    await userEvent.click(within(table).getByRole('button', { name: /Anular/ }))

    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: 'Anular cobro' })
    expect(confirm).toBeDisabled()

    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Se cobró la tarifa equivocada')
    await userEvent.click(confirm)

    await waitFor(() => {
      expect(window.parkingAPI.voidCashPayment).toHaveBeenCalledWith({
        paymentId: 'payment-1',
        reason: 'Se cobró la tarifa equivocada',
      })
    })
  })

  it('cierra la caja con lo contado y muestra la diferencia', async () => {
    vi.mocked(window.parkingAPI.getCashState).mockResolvedValue(ok(openState))
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Cerrar caja/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Esperado')).toBeInTheDocument()
    const counted = within(dialog).getByLabelText('Efectivo contado')
    await userEvent.clear(counted)
    await userEvent.type(counted, '55000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar caja' }))

    await waitFor(() => {
      expect(window.parkingAPI.closeCashSession).toHaveBeenCalledWith({
        closingAmountCop: 55_000,
        notes: null,
      })
    })
  })

  it('al cerrar informa los pagos pendientes sin tocar el esperado ni la diferencia', async () => {
    vi.mocked(window.parkingAPI.getCashState).mockResolvedValue(
      ok({ ...openState, pendingBalance: { count: 2, totalCop: 25_000 } }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Cerrar caja/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Quedan 2 pagos pendientes')).toBeInTheDocument()
    expect(within(dialog).getByText(/^\$\s25\.000$/)).toBeInTheDocument()
    expect(within(dialog).getByText(/no se suman ni se restan del total/)).toBeInTheDocument()
    // El arqueo sigue siendo el de los cobros del turno: 60.000 esperados y cuadra.
    expect(within(dialog).getByText(/^\$\s60\.000$/)).toBeInTheDocument()
    expect(within(dialog).getByText('Cuadra')).toBeInTheDocument()
  })

  it('no menciona pagos pendientes en el cierre cuando no queda ninguno', async () => {
    vi.mocked(window.parkingAPI.getCashState).mockResolvedValue(ok(openState))
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Cerrar caja/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/pagos? pendientes?/)).not.toBeInTheDocument()
  })

  it('el aviso del cierre y los cierres anteriores muestran lo que quedó pendiente', async () => {
    const withPending = { ...closedSummary, pendingBalance: { count: 1, totalCop: 12_000 } }
    vi.mocked(window.parkingAPI.listCashSessions).mockResolvedValue(ok([withPending]))
    useCashStore.setState({ lastClose: withPending, session: null, loading: false })
    renderPage()

    expect(
      await screen.findByText(/Quedan 1 pago pendiente por \$\s12\.000, que no se suman/),
    ).toBeInTheDocument()

    const table = await screen.findByRole('table', { name: /Cierres de caja anteriores/ })
    const row = within(table).getAllByRole('row')[1]!
    expect(within(row).getByText(/^\$\s12\.000$/)).toBeInTheDocument()
    expect(within(row).getByText('1 pago pendiente')).toBeInTheDocument()
    // Lo recaudado y lo esperado del turno no cambian por la deuda.
    expect(within(row).getByText(/^\$\s10\.000$/)).toBeInTheDocument()
    expect(within(row).getAllByText(/^\$\s60\.000$/)).toHaveLength(2)
  })

  it('muestra el error cuando la consulta falla', async () => {
    vi.mocked(window.parkingAPI.getCashState).mockResolvedValueOnce({
      ok: false,
      error: { code: 'OPERATION_FAILED', message: 'No fue posible consultar la caja.' },
    })
    renderPage()
    expect(await screen.findByText('No fue posible consultar la caja.')).toBeInTheDocument()
  })

  it('lista los cierres anteriores con su recibo reimprimible', async () => {
    vi.mocked(window.parkingAPI.listCashSessions).mockResolvedValue(ok([closedSummary]))
    renderPage()

    expect(await screen.findByText('Cierres anteriores')).toBeInTheDocument()
    expect(screen.getByText('Laura Torres')).toBeInTheDocument()

    const print = screen.getByRole('button', { name: /Recibo/ })
    await userEvent.click(print)
    await waitFor(() => {
      expect(window.parkingAPI.printCashCloseReceipt).toHaveBeenCalledWith({
        sessionId: 'cash-closed-1',
      })
    })
  })

  it('ofrece imprimir el recibo del cierre recién hecho y deja descartarlo', async () => {
    useCashStore.setState({ lastClose: closedSummary, session: null, loading: false })
    renderPage()

    expect(await screen.findByText(/Caja cerrada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Imprimir recibo de cierre/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByText(/Caja cerrada/)).not.toBeInTheDocument()
  })

  describe('con el cobro simplificado', () => {
    const simpleSettings = {
      printerName: null,
      paperWidth: '80mm' as const,
      showPrintDialog: true,
      printWidthMm: null,
      printOffsetMm: 0,
      simpleChargeMode: true,
    }
    const simpleState: CashState = {
      ...openState,
      session: { ...openState.session!, openingAmountCop: 0 },
      expectedCop: 10_000,
    }

    beforeEach(() => {
      vi.mocked(window.parkingAPI.getSettings).mockResolvedValue(ok(simpleSettings))
      useChargeModeStore.setState({ simpleChargeMode: true })
    })

    afterEach(() => {
      vi.mocked(window.parkingAPI.getSettings).mockResolvedValue(
        ok({ ...simpleSettings, simpleChargeMode: false }),
      )
      useChargeModeStore.setState({ simpleChargeMode: false })
    })

    it('abre la caja sin pedir fondo inicial', async () => {
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: /Abrir caja/ }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByLabelText('Fondo inicial')).not.toBeInTheDocument()

      await userEvent.click(within(dialog).getByLabelText('Empleado'))
      await userEvent.click(await screen.findByRole('option', { name: 'Laura Torres' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir caja' }))

      await waitFor(() => {
        expect(window.parkingAPI.openCashSession).toHaveBeenCalledWith(
          expect.objectContaining({ openingAmountCop: 0 }),
        )
      })
    })

    it('muestra el total del turno y cierra sin contar el efectivo', async () => {
      vi.mocked(window.parkingAPI.getCashState).mockResolvedValue(ok(simpleState))
      renderPage()

      expect(await screen.findByText('Total del turno')).toBeInTheDocument()
      expect(screen.queryByText('Fondo inicial')).not.toBeInTheDocument()
      expect(screen.queryByText('Esperado al cierre')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /Cerrar caja/ }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByLabelText('Efectivo contado')).not.toBeInTheDocument()
      expect(within(dialog).queryByText('Diferencia')).not.toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar caja' }))

      await waitFor(() => {
        expect(window.parkingAPI.closeCashSession).toHaveBeenCalledWith({
          closingAmountCop: null,
          notes: null,
        })
      })
    })

    it('lista un cierre sin conteo sin inventar una diferencia', async () => {
      vi.mocked(window.parkingAPI.listCashSessions).mockResolvedValue(
        ok([{ ...closedSummary, closingAmountCop: null, differenceCop: null }]),
      )
      renderPage()

      expect(await screen.findByText('Sin conteo')).toBeInTheDocument()
      expect(screen.queryByText('Cuadra')).not.toBeInTheDocument()
    })
  })
})
