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

    await userEvent.type(await screen.findByLabelText('Matrícula'), 'abc 123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    const dialog = await screen.findByRole('dialog')
    // El diálogo llega resuelto: vehículo, tarifa, permanencia y total.
    expect(await within(dialog).findByText('Automóvil por hora', { exact: false })).toBeVisible()
    expect(within(dialog).getByText('ABC123')).toBeInTheDocument()
    expect(await within(dialog).findByText('Total a cobrar')).toBeInTheDocument()

    expect(window.parkingAPI.listActiveSessions).toHaveBeenCalledWith({ search: 'ABC123' })
  })

  it('avisa cuando la matrícula no está en el parqueadero y no abre el cobro', async () => {
    renderExits()

    await userEvent.type(await screen.findByLabelText('Matrícula'), 'qqq999')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    expect(await screen.findByText('QQQ999 no está en el parqueadero')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('no confunde una coincidencia parcial con la matrícula buscada', async () => {
    renderExits()

    // El proceso principal busca por coincidencia parcial: «ABC» trae ABC123.
    await userEvent.type(await screen.findByLabelText('Matrícula'), 'abc')
    await userEvent.click(screen.getByRole('button', { name: /Registrar salida/ }))

    expect(await screen.findByText('ABC no está en el parqueadero')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el campo de matrícula solo admite letras y números', async () => {
    renderExits()

    const plate = await screen.findByLabelText('Matrícula')
    await userEvent.type(plate, 'a-b c@1!2')

    expect(plate).toHaveValue('ABC12')
  })

  it('cobra y deja el foco listo para la siguiente salida', async () => {
    renderExits()

    await userEvent.type(await screen.findByLabelText('Matrícula'), 'ABC123')
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
    const plate = await screen.findByLabelText('Matrícula')
    expect(plate).toHaveValue('')
    expect(plate).toHaveFocus()
  })

  it('registra la salida de un vehículo con mensualidad vigente sin cobrar', async () => {
    const coverage = {
      subscriptionId: 'sub-1',
      customerName: 'María Fernanda Ríos',
      startsAt: '2026-08-01T05:00:00.000Z',
      endsAt: '2026-09-01T05:00:00.000Z',
    }
    const covered = { ...activeSession, monthlyCoverage: coverage }
    vi.mocked(window.parkingAPI.listActiveSessions).mockResolvedValueOnce({
      ok: true,
      data: [covered],
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

    await userEvent.type(await screen.findByLabelText('Matrícula'), 'ABC123')
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

    await userEvent.type(await screen.findByLabelText('Matrícula'), 'ABC123')
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
