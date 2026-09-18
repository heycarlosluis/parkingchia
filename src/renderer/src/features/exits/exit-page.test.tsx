import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activeSession } from '@/test/setup'
import { useCashStore } from '@/store/cash-store'
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
    useParkingStore.setState({ sessions: [], search: '', loading: false, error: null })
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
      data: covered,
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

  it('avisa que sin caja abierta no se puede cobrar', async () => {
    useCashStore.setState({ session: null, loading: false, error: null, message: '' })
    renderExits()

    expect(await screen.findByText('No hay una caja abierta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir caja/ })).toHaveAttribute('href', '/caja')
  })
})
