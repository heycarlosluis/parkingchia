import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TARIFF_SETTINGS } from '@shared/tariff'
import { useCashStore } from '@/store/cash-store'
import { useParkingStore } from '@/store/parking-store'
import { useTariffStore } from '@/store/tariff-store'
import { EntriesPage } from './entries-page'

function renderEntries(): void {
  render(
    <MemoryRouter>
      <EntriesPage />
    </MemoryRouter>,
  )
}

describe('Registrar ingreso', () => {
  beforeEach(() => {
    useParkingStore.setState({ sessions: [], search: '', loading: false, error: null })
    useTariffStore.setState({ settings: DEFAULT_TARIFF_SETTINGS, plans: [], loading: false })
  })

  it('registra el ingreso y confirma la matrícula, la tarifa y la gracia', async () => {
    renderEntries()

    await screen.findByLabelText('Matrícula')
    await userEvent.type(screen.getByLabelText('Matrícula'), 'abc 123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar ingreso/ }))

    expect(await screen.findByText('Ingreso registrado')).toBeInTheDocument()
    expect(screen.getByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('Automóvil por hora')).toBeInTheDocument()
    expect(screen.getByText('Costo por hora')).toBeInTheDocument()
    expect(screen.getByText('15 min')).toBeInTheDocument()

    await waitFor(() => {
      expect(window.parkingAPI.registerEntry).toHaveBeenCalledWith(
        expect.objectContaining({ plate: 'ABC123', vehicleType: 'car', notes: null }),
      )
    })
  })

  it('ofrece reimprimir el tiquete sin desplazar a la acción principal', async () => {
    renderEntries()

    await screen.findByLabelText('Matrícula')
    await userEvent.type(screen.getByLabelText('Matrícula'), 'abc 123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar ingreso/ }))

    // El aviso de la impresión automática vive en la misma región que el duplicado.
    expect(
      await screen.findByText('No hay impresoras disponibles en el sistema.'),
    ).toBeInTheDocument()

    const reprintButton = screen.getByRole('button', { name: /Reimprimir tiquete/ })
    await userEvent.click(reprintButton)

    await waitFor(() => {
      expect(window.parkingAPI.reprintEntryTicket).toHaveBeenCalledWith({
        sessionId: 'session-new',
      })
    })
    expect(await screen.findByText('No hay impresoras.')).toBeInTheDocument()

    // Registrar otro ingreso sigue siendo lo primero que encuentra el operador.
    await userEvent.click(screen.getByRole('button', { name: /Registrar otro ingreso/ }))
    expect(await screen.findByLabelText('Matrícula')).toHaveFocus()
  })

  it('rechaza una matrícula inválida sin llamar al proceso principal', async () => {
    renderEntries()

    await userEvent.type(await screen.findByLabelText('Matrícula'), 'A@')
    await userEvent.click(screen.getByRole('button', { name: /Registrar ingreso/ }))

    expect(
      await screen.findByText(/al menos 3 caracteres|únicamente letras y números/),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ingreso registrado')).not.toBeInTheDocument()
  })

  it('pide crear una tarifa cuando ninguna está activa y enlaza a Configuración', async () => {
    vi.mocked(window.parkingAPI.getTariffConfiguration).mockResolvedValueOnce({
      ok: true,
      data: { settings: DEFAULT_TARIFF_SETTINGS, plans: [] },
    })
    renderEntries()

    expect(await screen.findByText('Todavía no hay tarifas activas')).toBeInTheDocument()
    expect(screen.queryByLabelText('Matrícula')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir a Configuración/ })).toHaveAttribute(
      'href',
      '/configuracion?tab=tarifas',
    )
  })

  it('avisa cuando la matrícula es de un cliente mensual vigente', async () => {
    vi.mocked(window.parkingAPI.findMonthlyCoverage).mockResolvedValueOnce({
      ok: true,
      data: {
        subscriptionId: 'sub-1',
        customerName: 'María Fernanda Ríos',
        startsAt: '2026-08-19T05:00:00.000Z',
        endsAt: '2026-09-19T05:00:00.000Z',
      },
    })
    renderEntries()

    await userEvent.type(await screen.findByLabelText('Matrícula'), 'MEN001')

    expect(await screen.findByText(/María Fernanda Ríos/)).toBeInTheDocument()
    expect(window.parkingAPI.findMonthlyCoverage).toHaveBeenCalledWith({ plate: 'MEN001' })
  })

  it('avisa cuando no hay una caja abierta y enlaza a Caja', async () => {
    useCashStore.setState({ session: null, loading: false, error: null, message: '' })
    renderEntries()

    expect(await screen.findByText('No hay una caja abierta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir caja/ })).toHaveAttribute('href', '/caja')
  })
})
