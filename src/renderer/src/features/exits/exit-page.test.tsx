import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activeSession, pendingPayment } from '@/test/setup'
import { useCashStore } from '@/store/cash-store'
import { useChargeModeStore } from '@/store/charge-mode-store'
import { useParkingStore } from '@/store/parking-store'
import { ExitPage } from './exit-page'

function renderExits(): void {
  render(
    <MemoryRouter>
      <ExitPage />
    </MemoryRouter>,
  )
}

/** Cobro liquidado en cero: es lo que devuelve una mensualidad o la tolerancia. */
const zeroCharge = {
  currency: 'COP' as const,
  billingUnit: 'hour' as const,
  totalMinutes: 90,
  graceMinutes: 15,
  graceFromHour: 1,
  withinGrace: false,
  forgivenMinutes: 0,
  billedUnits: 0,
  plenaCount: 0,
  plenaUnitCop: 0,
  chargedUnits: 0,
  baseCop: 0,
  appliedMinimumCharge: false,
  roundingAdjustmentCop: 0,
  subtotalCop: 0,
  taxPercent: 0,
  taxCop: 0,
  totalCop: 0,
}

describe('Registrar salida', () => {
  beforeEach(() => {
    useParkingStore.setState({
      sessions: [],
      pendingPayments: [],
      search: '',
      loading: false,
      error: null,
    })
  })

  it('busca la matrícula y abre el cobro con los datos de ese vehículo', async () => {
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'abc 123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    const dialog = await screen.findByRole('dialog')
    // El diálogo llega resuelto: vehículo, tarifa, permanencia y total.
    expect(await within(dialog).findByText('Automóvil por hora', { exact: false })).toBeVisible()
    expect(within(dialog).getByText('ABC123')).toBeInTheDocument()
    expect(await within(dialog).findByText('Total a cobrar')).toBeInTheDocument()

    expect(window.parkingAPI.resolveExitTarget).toHaveBeenCalledWith({ code: 'ABC123' })
  })

  it('avisa cuando la matrícula no está en el parqueadero y no abre el cobro', async () => {
    vi.mocked(window.parkingAPI.resolveExitTarget).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'SESSION_NOT_FOUND',
        message: 'No hay ningún ingreso activo con la matrícula QQQ999.',
      },
    })
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'qqq999')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    expect(
      await screen.findByText('No hay ningún ingreso activo con la matrícula QQQ999.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('envía un código escaneado completo sin modificarlo', async () => {
    renderExits()

    const code = 'PC1Q.eyJ2ZXJzaW9uIjoxLCJwbGF0ZSI6IkFCQzEyMyJ9'
    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), code)
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(window.parkingAPI.resolveExitTarget).toHaveBeenCalledWith({ code })
  })

  it('filtra la matrícula igual que Registrar ingreso', async () => {
    renderExits()

    const code = await screen.findByLabelText('Tiquete o matrícula')
    await userEvent.type(code, 'ab-c 1ñ23456789')

    expect(code).toHaveValue('ABC1N234')
  })

  it('deja escribir los 16 dígitos del tiquete aunque superen el largo de una matrícula', async () => {
    renderExits()

    const code = await screen.findByLabelText('Tiquete o matrícula')
    await userEvent.type(code, '1234 5678 9012 34567')

    expect(code).toHaveValue('1234567890123456')
  })

  it('busca el tiquete cuando el lector termina con Tab', async () => {
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), '1234567890123452')
    await userEvent.tab()

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(window.parkingAPI.resolveExitTarget).toHaveBeenCalledWith({ code: '1234567890123452' })
  })

  it('el campo conserva los caracteres necesarios para códigos QR', async () => {
    renderExits()

    const code = await screen.findByLabelText('Tiquete o matrícula')
    await userEvent.type(code, 'PC1Q.a-b_c')

    expect(code).toHaveValue('PC1Q.a-b_c')
  })

  it('abre el cobro con el cursor en el efectivo y los montos rápidos suman', async () => {
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'ABC123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    const dialog = await screen.findByRole('dialog')
    const received = await within(dialog).findByLabelText('Efectivo recibido')
    await waitFor(() => {
      expect(received).toHaveFocus()
    })

    // Tocar el mismo billete varias veces lo suma, como contar el efectivo.
    await userEvent.click(within(dialog).getByRole('button', { name: /^Sumar \$\s20\.000$/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /^Sumar \$\s20\.000$/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /^Sumar \$\s5\.000$/ }))
    expect(received).toHaveValue(45_000)
    // El foco vuelve al campo para seguir con el teclado.
    expect(received).toHaveFocus()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar' }))
    expect(received).toHaveValue(null)

    await userEvent.click(within(dialog).getByRole('button', { name: /Monto exacto/ }))
    expect(within(dialog).getByText(/^Cambio a entregar: \$\s0$/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /Cobrar/ }))
    expect(await screen.findByText('Salida registrada')).toBeInTheDocument()
  })

  it('cobra y deja el foco listo para la siguiente salida', async () => {
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'ABC123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Total a cobrar')
    await userEvent.type(within(dialog).getByLabelText('Efectivo recibido'), '100000')
    await userEvent.click(within(dialog).getByRole('button', { name: /Cobrar/ }))

    expect(await screen.findByText('Salida registrada')).toBeInTheDocument()
    const again = screen.getByRole('button', { name: /Registrar otra salida/ })
    await waitFor(() => {
      expect(again).toHaveFocus()
    })

    // Encadenar con la siguiente devuelve el foco a la matrícula, ya vacía.
    await userEvent.click(again)
    const code = await screen.findByLabelText('Tiquete o matrícula')
    expect(code).toHaveValue('')
    expect(code).toHaveFocus()
  })

  it('registra la salida de un vehículo con mensualidad vigente sin cobrar', async () => {
    const coverage = {
      subscriptionId: 'sub-1',
      customerName: 'María Fernanda Ríos',
      startsAt: '2026-08-01T05:00:00.000Z',
      endsAt: '2026-09-01T05:00:00.000Z',
    }
    const covered = { ...activeSession, monthlyCoverage: coverage }
    vi.mocked(window.parkingAPI.resolveExitTarget).mockResolvedValueOnce({
      ok: true,
      data: { kind: 'session', session: covered },
    })
    vi.mocked(window.parkingAPI.quoteSessionExit).mockResolvedValueOnce({
      ok: true,
      data: {
        session: covered,
        charge: { ...zeroCharge, totalMinutes: 90 },
        quotedAt: new Date().toISOString(),
      },
    })
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'ABC123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/María Fernanda Ríos/)).toBeInTheDocument()

    // Sin nada que cobrar no hay campo de efectivo, así que el botón debe poder pulsarse.
    const confirm = within(dialog).getByRole('button', {
      name: /Registrar salida de mensualidad/,
    })
    expect(confirm).toBeEnabled()

    await userEvent.click(confirm)
    expect(await screen.findByText('Salida registrada')).toBeInTheDocument()
  })

  it('registra la salida dentro de la tolerancia sin cobrar', async () => {
    vi.mocked(window.parkingAPI.quoteSessionExit).mockResolvedValueOnce({
      ok: true,
      data: {
        session: activeSession,
        charge: { ...zeroCharge, withinGrace: true, totalMinutes: 5 },
        quotedAt: new Date().toISOString(),
      },
    })
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'ABC123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    const dialog = await screen.findByRole('dialog')
    const confirm = await within(dialog).findByRole('button', {
      name: /Registrar salida sin cobro/,
    })
    expect(confirm).toBeEnabled()
  })

  it('deja el pago pendiente sin cobrar y lo confirma en pantalla', async () => {
    vi.mocked(window.parkingAPI.closeSession).mockClear()
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'ABC123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Total a cobrar')
    // No exige efectivo: el vehículo sale debiendo el total cotizado.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pago pendiente' }))

    expect(await screen.findByText('Pago pendiente registrado')).toBeInTheDocument()
    expect(screen.getByText('Total pendiente')).toBeInTheDocument()
    expect(window.parkingAPI.markPaymentPending).toHaveBeenCalledWith({
      sessionId: 'session-1',
      expectedTotalCop: 10_000,
    })
    expect(window.parkingAPI.closeSession).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Registrar otra salida/ })).toHaveFocus()
    })
  })

  it('no ofrece el pago pendiente cuando la salida no genera cobro', async () => {
    vi.mocked(window.parkingAPI.quoteSessionExit).mockResolvedValueOnce({
      ok: true,
      data: {
        session: activeSession,
        charge: { ...zeroCharge, withinGrace: true, totalMinutes: 5 },
        quotedAt: new Date().toISOString(),
      },
    })
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'ABC123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('button', { name: /Registrar salida sin cobro/ })
    expect(within(dialog).queryByRole('button', { name: 'Pago pendiente' })).not.toBeInTheDocument()
  })

  it('avisa del pago pendiente al leer un vehículo que ya salió debiendo y lo cobra', async () => {
    vi.mocked(window.parkingAPI.resolveExitTarget).mockResolvedValueOnce({
      ok: true,
      data: { kind: 'pending', plate: 'DEU456', pendingPayments: [pendingPayment] },
    })
    vi.mocked(window.parkingAPI.listPendingPayments)
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: [pendingPayment] })
    renderExits()

    await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'deu456')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    expect(await screen.findByText('Este carro tiene un pago pendiente')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Cobrar \$\s10\.000/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Cobrar pago pendiente' })
    expect(within(dialog).getByText('DEU456')).toBeInTheDocument()
    const charge = within(dialog).getByRole('button', { name: /Cobrar \$\s10\.000/ })
    expect(charge).toBeDisabled()
    await userEvent.click(within(dialog).getByRole('button', { name: /Monto exacto/ }))
    await userEvent.click(charge)

    expect(await screen.findByText(/Pago pendiente cobrado · DEU456/)).toBeInTheDocument()
    expect(screen.getByText(/Recibo N\.º 5 · Efectivo/)).toBeInTheDocument()
    expect(window.parkingAPI.settlePendingPayment).toHaveBeenCalledWith({
      pendingPaymentId: 'pending-1',
      method: 'cash',
      receivedCop: 10_000,
    })
    // Cobrado, deja de figurar como pendiente.
    expect(screen.queryByText('Este carro tiene un pago pendiente')).not.toBeInTheDocument()
  })

  it('avisa que sin caja abierta no se puede cobrar', async () => {
    useCashStore.setState({ session: null, loading: false, error: null, message: '' })
    renderExits()

    expect(await screen.findByText('No hay una caja abierta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir caja/ })).toHaveAttribute('href', '/caja')
  })

  it('con el cobro simplificado cobra el total sin pedir efectivo recibido', async () => {
    const settings = {
      printerName: null,
      paperWidth: '80mm' as const,
      showPrintDialog: true,
      printWidthMm: null,
      printOffsetMm: 0,
    }
    vi.mocked(window.parkingAPI.getSettings).mockResolvedValue({
      ok: true,
      data: { ...settings, simpleChargeMode: true },
    })
    useChargeModeStore.setState({ simpleChargeMode: true })
    vi.mocked(window.parkingAPI.closeSession).mockClear()
    try {
      renderExits()

      await userEvent.type(await screen.findByLabelText('Tiquete o matrícula'), 'abc123')
      await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

      const dialog = await screen.findByRole('dialog')
      const charge = await within(dialog).findByRole('button', { name: /^Cobrar/ })
      expect(within(dialog).queryByLabelText('Efectivo recibido')).not.toBeInTheDocument()
      expect(
        within(dialog).queryByRole('group', { name: 'Montos rápidos' }),
      ).not.toBeInTheDocument()
      // Sin campo que llenar, el cobro queda habilitado y con el foco: Enter confirma.
      await waitFor(() => expect(charge).toHaveFocus())
      await userEvent.keyboard('{Enter}')

      await waitFor(() => {
        expect(window.parkingAPI.closeSession).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'cash', receivedCop: null }),
        )
      })
    } finally {
      vi.mocked(window.parkingAPI.getSettings).mockResolvedValue({
        ok: true,
        data: { ...settings, simpleChargeMode: false },
      })
      useChargeModeStore.setState({ simpleChargeMode: false })
    }
  })
})
