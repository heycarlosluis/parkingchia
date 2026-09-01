import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_TARIFF_SETTINGS } from '@shared/tariff'
import { useAccessStore } from '@/store/access-store'
import { useEmployeeStore } from '@/store/employee-store'
import { useTariffStore } from '@/store/tariff-store'
import { SettingsPage } from './settings-page'

function renderSettings(initialEntry = '/configuracion'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SettingsPage />
    </MemoryRouter>,
  )
}

describe('Configuración', () => {
  beforeEach(() => {
    useAccessStore.setState({
      state: {
        onboardingCompleted: true,
        profile: {
          name: 'Parking Chía',
          address: 'Carrera 10 # 12-34',
          phone: '300 123 4567',
        },
        pinConfigured: false,
        locked: false,
      },
      loading: false,
      error: null,
    })
    useTariffStore.setState({
      settings: DEFAULT_TARIFF_SETTINGS,
      plans: [],
      loading: true,
      error: null,
      message: '',
    })
    useEmployeeStore.setState({ employees: [], loading: true, error: null, message: '' })
  })

  it('organiza la configuración en pestañas y abre General por defecto', async () => {
    renderSettings()

    const tablist = screen.getByRole('tablist', { name: 'Secciones de configuración' })
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')
    expect(within(tablist).getByRole('tab', { name: 'Tarifas' })).toHaveAttribute(
      'aria-selected',
      'false',
    )

    expect(await screen.findByLabelText('Nombre del parqueadero')).toHaveValue('Parking Chía')
    expect(screen.queryByLabelText('Unidad de cobro')).not.toBeInTheDocument()
  })

  it('carga las tarifas al abrir su pestaña', async () => {
    renderSettings()

    await userEvent.click(screen.getByRole('tab', { name: 'Tarifas' }))

    expect(screen.getByRole('tab', { name: 'Tarifas' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByLabelText('Unidad de cobro')).toHaveTextContent('Por hora')
  })

  it('respeta el enlace directo a una pestaña', async () => {
    renderSettings('/configuracion?tab=impresion')

    expect(screen.getByRole('tab', { name: 'Impresión' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByLabelText('Impresora')).toBeInTheDocument()
  })

  it('agrupa el acceso local y el sistema en sus propias pestañas', async () => {
    renderSettings('/configuracion?tab=seguridad')
    expect(await screen.findByText('Acceso local')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Sistema' }))
    expect(await screen.findByText('Actualizaciones')).toBeInTheDocument()
    expect(screen.getByText(/Las actualizaciones conservan tus datos locales/)).toBeInTheDocument()
    expect(screen.getByText('Datos y copias de seguridad')).toBeInTheDocument()
  })

  it('administra los empleados en su propia pestaña', async () => {
    renderSettings('/configuracion?tab=empleados')

    expect(screen.getByRole('tab', { name: 'Empleados' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Laura Torres')).toBeInTheDocument()
  })
})
