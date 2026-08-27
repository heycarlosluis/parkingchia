import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_TARIFF_SETTINGS } from '@shared/tariff'
import { useTariffStore } from '@/store/tariff-store'
import { TariffsSettings } from './tariffs-settings'

describe('Tarifas en Configuración', () => {
  beforeEach(() => {
    useTariffStore.setState({
      settings: DEFAULT_TARIFF_SETTINGS,
      plans: [],
      loading: true,
      error: null,
      message: '',
    })
  })

  it('muestra la configuración de cobro con los cuatro puntos clave', async () => {
    render(<TariffsSettings />)

    expect(await screen.findByLabelText('Unidad de cobro')).toHaveTextContent('Por hora')
    expect(screen.getByLabelText('Tiempo de gracia (tolerancia)')).toHaveValue(15)
    expect(screen.getByLabelText('La tolerancia aplica desde la hora')).toHaveValue(1)
    expect(screen.getByLabelText('Moneda')).toHaveValue('Peso colombiano (COP)')

    const taxCheckbox = screen.getByRole('checkbox', { name: 'Cobrar IVA' })
    expect(taxCheckbox).not.toBeChecked()
    expect(screen.queryByLabelText('Porcentaje de IVA')).not.toBeInTheDocument()

    await userEvent.click(taxCheckbox)
    expect(await screen.findByLabelText('Porcentaje de IVA')).toHaveValue(19)
  })

  it('lista las tarifas guardadas con su precio en pesos', async () => {
    render(<TariffsSettings />)

    const table = await screen.findByRole('table')
    const row = within(table).getByRole('row', { name: /Automóvil por hora/ })
    expect(within(row).getByText('$ 5.000')).toBeInTheDocument()
    expect(within(row).getByText('General')).toBeInTheDocument()
  })

  it('simula el cobro de una permanencia con la configuración vigente', async () => {
    render(<TariffsSettings />)

    expect(await screen.findByText('Total a cobrar')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('2 horas')).toBeInTheDocument()
    })

    await userEvent.clear(screen.getByLabelText('Permanencia en minutos'))
    await userEvent.type(screen.getByLabelText('Permanencia en minutos'), '65')
    expect(await screen.findByText('1 hora · 5 min de tolerancia')).toBeInTheDocument()
  })
})
