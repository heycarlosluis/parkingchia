import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RatePlan } from '@shared/contracts'
import { DEFAULT_TARIFF_SETTINGS, type VehicleType } from '@shared/tariff'
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

function ratePlan(
  overrides: Partial<RatePlan> & { id: string; name: string; vehicleType: VehicleType },
): RatePlan {
  return {
    billingUnit: 'hour',
    amountCop: 5000,
    minimumChargeCop: 0,
    plenaCop: null,
    graceMinutes: null,
    status: 'active',
    createdAt: '2026-08-18T12:00:00.000Z',
    updatedAt: '2026-08-18T12:00:00.000Z',
    ...overrides,
  }
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

  it('selecciona el tipo de vehículo con cajas en lugar de un selector', async () => {
    vi.mocked(window.parkingAPI.getTariffConfiguration).mockResolvedValueOnce({
      ok: true,
      data: {
        settings: DEFAULT_TARIFF_SETTINGS,
        plans: [
          ratePlan({ id: 'rate-car', name: 'Automóvil por hora', vehicleType: 'car' }),
          ratePlan({ id: 'rate-moto', name: 'Motocicleta por hora', vehicleType: 'motorcycle' }),
        ],
      },
    })
    renderEntries()

    await screen.findByLabelText('Matrícula')
    const car = await screen.findByRole('radio', { name: 'Automóvil' })
    const motorcycle = screen.getByRole('radio', { name: 'Motocicleta' })
    expect(car).toBeChecked()
    expect(car.closest('label')).toHaveAttribute('data-selected', 'true')

    await userEvent.click(motorcycle)

    // La caja elegida se marca en el DOM para que se distinga sin depender del color.
    expect(motorcycle).toBeChecked()
    expect(motorcycle.closest('label')).toHaveAttribute('data-selected', 'true')
    expect(car.closest('label')).toHaveAttribute('data-selected', 'false')

    await userEvent.type(screen.getByLabelText('Matrícula'), 'xyz 99')
    await userEvent.click(screen.getByRole('button', { name: /Registrar ingreso/ }))

    await waitFor(() => {
      expect(window.parkingAPI.registerEntry).toHaveBeenCalledWith(
        expect.objectContaining({ vehicleType: 'motorcycle', ratePlanId: 'rate-moto' }),
      )
    })
  })

  it('solo ofrece los tipos de vehículo con una tarifa activa', async () => {
    vi.mocked(window.parkingAPI.getTariffConfiguration).mockResolvedValueOnce({
      ok: true,
      data: {
        settings: DEFAULT_TARIFF_SETTINGS,
        plans: [
          ratePlan({ id: 'rate-car', name: 'Automóvil por hora', vehicleType: 'car' }),
          ratePlan({
            id: 'rate-bike',
            name: 'Bicicleta por hora',
            vehicleType: 'bicycle',
            status: 'inactive',
          }),
        ],
      },
    })
    renderEntries()

    expect(await screen.findByRole('radio', { name: 'Automóvil' })).toBeInTheDocument()
    // La bicicleta está desactivada y «Otro» nunca tuvo tarifa: ninguna estorba.
    expect(screen.queryByRole('radio', { name: 'Bicicleta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Otro' })).not.toBeInTheDocument()
    expect(screen.getByText(/Solo aparecen los tipos con una tarifa activa/)).toBeInTheDocument()
  })

  it('mueve la selección al primer tipo disponible cuando su tarifa se desactiva', async () => {
    vi.mocked(window.parkingAPI.getTariffConfiguration).mockResolvedValueOnce({
      ok: true,
      data: {
        settings: DEFAULT_TARIFF_SETTINGS,
        plans: [
          ratePlan({ id: 'rate-moto', name: 'Motocicleta por hora', vehicleType: 'motorcycle' }),
        ],
      },
    })
    renderEntries()

    // El valor por defecto del formulario es «car», que aquí no tiene tarifa activa.
    const motorcycle = await screen.findByRole('radio', { name: 'Motocicleta' })
    await waitFor(() => {
      expect(motorcycle).toBeChecked()
    })
    expect(screen.queryByRole('radio', { name: 'Automóvil' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Matrícula'), 'xyz 99')
    await userEvent.click(screen.getByRole('button', { name: /Registrar ingreso/ }))

    await waitFor(() => {
      expect(window.parkingAPI.registerEntry).toHaveBeenCalledWith(
        expect.objectContaining({ vehicleType: 'motorcycle', ratePlanId: 'rate-moto' }),
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

  it('el campo de matrícula solo admite letras y números', async () => {
    renderEntries()

    const plate = await screen.findByLabelText('Matrícula')
    await userEvent.type(plate, 'a-b c@1!2ñ3')

    // Los símbolos y espacios no llegan a entrar; la eñe cae a su letra base.
    expect(plate).toHaveValue('ABC12N3')
  })

  it('no deja escribir más allá del largo máximo', async () => {
    renderEntries()

    const plate = await screen.findByLabelText('Matrícula')
    await userEvent.type(plate, 'ABCDEFGHIJKL')

    expect(plate).toHaveValue('ABCDEFGH')
  })

  it('deja la nota fuera del camino rápido hasta que se pide', async () => {
    renderEntries()

    await screen.findByLabelText('Matrícula')
    expect(screen.queryByLabelText('Nota')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Agregar nota/ }))

    expect(await screen.findByLabelText('Nota')).toHaveFocus()
  })

  it('muestra la tarifa sin desplegable cuando solo una aplica', async () => {
    renderEntries()

    await screen.findByLabelText('Matrícula')
    expect(screen.getByText('Automóvil por hora')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tarifa')).not.toBeInTheDocument()
  })

  it('deja el foco en la acción que sigue para encadenar ingresos con Enter', async () => {
    renderEntries()

    await userEvent.type(await screen.findByLabelText('Matrícula'), 'abc 123')
    await userEvent.click(screen.getByRole('button', { name: /Registrar ingreso/ }))

    const again = await screen.findByRole('button', { name: /Registrar otro ingreso/ })
    await waitFor(() => {
      expect(again).toHaveFocus()
    })
  })

  it('rechaza una matrícula inválida sin llamar al proceso principal', async () => {
    renderEntries()

    await userEvent.type(await screen.findByLabelText('Matrícula'), 'A@')
    await userEvent.click(screen.getByRole('button', { name: /Registrar ingreso/ }))

    expect(await screen.findByText(/al menos 3 caracteres/)).toBeInTheDocument()
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
