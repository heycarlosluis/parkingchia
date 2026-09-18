import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('permite guardar un logo local para los documentos impresos', async () => {
    renderSettings()
    const logo = new File(['logo-local'], 'logo.png', { type: 'image/png' })

    await userEvent.upload(await screen.findByLabelText('Logo del parqueadero'), logo)
    expect(await screen.findByAltText('Vista previa del logo del parqueadero')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }))

    expect(vi.mocked(window.parkingAPI.updateParkingProfile)).toHaveBeenCalledWith(
      expect.objectContaining({ logoDataUrl: expect.stringMatching(/^data:image\/png;base64,/) }),
    )
  })

  it('guarda el NIT y avisa cuando el dígito de verificación no corresponde', async () => {
    vi.mocked(window.parkingAPI.updateParkingProfile).mockClear()
    renderSettings()
    const nit = await screen.findByLabelText('NIT (opcional)')

    await userEvent.type(nit, '800.197.268-5')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }))
    expect(
      await screen.findByText(
        'El dígito de verificación no corresponde a este número. Revísalo en el RUT',
      ),
    ).toBeInTheDocument()
    expect(vi.mocked(window.parkingAPI.updateParkingProfile)).not.toHaveBeenCalled()

    await userEvent.clear(nit)
    await userEvent.type(nit, '800.197.268-4')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }))
    expect(vi.mocked(window.parkingAPI.updateParkingProfile)).toHaveBeenCalledWith(
      expect.objectContaining({ nit: '800197268-4' }),
    )
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

  it('ofrece el ajuste del papel y la guía para calibrarlo', async () => {
    vi.mocked(window.parkingAPI.listPrinters).mockResolvedValue({
      ok: true,
      data: [{ name: 'POS-80', displayName: 'POS-80', isDefault: true, status: 0 }],
    })
    renderSettings('/configuracion?tab=impresion')

    expect(await screen.findByLabelText('Ancho de impresión')).toHaveTextContent(
      'Automático (72 mm)',
    )
    expect(screen.getByLabelText('Ajuste horizontal')).toHaveTextContent('Centrado')

    await userEvent.click(await screen.findByRole('button', { name: 'Imprimir guía de ajuste' }))
    expect(vi.mocked(window.parkingAPI.printCalibrationGuide)).toHaveBeenCalled()
  })

  it('restablece de fábrica el ajuste del papel tras confirmar', async () => {
    vi.mocked(window.parkingAPI.getSettings).mockResolvedValueOnce({
      ok: true,
      data: {
        printerName: null,
        paperWidth: '58mm',
        showPrintDialog: true,
        printWidthMm: 44,
        printOffsetMm: 1.5,
      },
    })
    vi.mocked(window.parkingAPI.updateSettings).mockClear()
    renderSettings('/configuracion?tab=impresion')

    const reset = await screen.findByRole('button', { name: 'Restablecer de fábrica' })
    await waitFor(() => {
      expect(reset).toBeEnabled()
    })
    await userEvent.click(reset)
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByText(/automático \(48 mm\)/)).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Restablecer' }))

    expect(vi.mocked(window.parkingAPI.updateSettings)).toHaveBeenCalledWith({
      printWidthMm: null,
      printOffsetMm: 0,
    })
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
