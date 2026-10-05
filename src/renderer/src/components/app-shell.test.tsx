import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/contracts'
import { useAccessStore } from '@/store/access-store'
import { useCashStore } from '@/store/cash-store'
import { useSystemStore } from '@/store/system-store'
import { AppShell } from './app-shell'

function ScanTarget(): React.JSX.Element {
  const location = useLocation()
  const state = location.state as { entryTicketCode?: string } | null
  return <p>Escaneado: {state?.entryTicketCode ?? 'ninguno'}</p>
}

const updateState = (status: UpdateState['status']): UpdateState => ({
  status,
  currentVersion: '0.1.0-alpha.1',
  availableVersion: status === 'idle' ? null : '0.1.0-alpha.2',
  progress: null,
  message: '',
  canCheck: true,
})

describe('AppShell', () => {
  beforeEach(() => {
    useAccessStore.setState({
      state: {
        onboardingCompleted: true,
        profile: { name: 'Parking Chía', address: '', phone: '' },
        pinConfigured: false,
        locked: false,
      },
      loading: false,
      error: null,
    })
    useSystemStore.setState({
      updateState: updateState('idle'),
      initialize: vi.fn(async () => undefined),
    })
    useCashStore.setState({
      session: null,
      loading: false,
      initialize: vi.fn(async () => undefined),
    })
  })

  it('enlaza el aviso de actualización con la configuración del sistema', () => {
    useSystemStore.setState({ updateState: updateState('available') })

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<p>Inicio</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Actualización disponible' })).toHaveAttribute(
      'href',
      '/configuracion?tab=sistema',
    )
  })

  it('abre el flujo de salida al recibir un tiquete desde un lector tipo teclado', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<p>Inicio</p>} />
            <Route path="salidas" element={<ScanTarget />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.keyboard('PC1S.123E4567E89B12D3A456426614174000{Enter}')

    expect(
      await screen.findByText(/Escaneado: PC1S\.123E4567E89B12D3A456426614174000/),
    ).toBeVisible()
  })

  const renderWithField = (attributes = ''): void => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route
              index
              element={
                <form aria-label="Formulario" onSubmit={(event) => event.preventDefault()}>
                  <input
                    aria-label="Matrícula"
                    {...(attributes === 'scanner' ? { 'data-scanner-field': '' } : {})}
                  />
                </form>
              }
            />
            <Route path="salidas" element={<ScanTarget />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  }

  // Código real de 16 dígitos con verificación Luhn válida.
  const reference = '0200586617099797'

  it('abre la salida si se escanea un tiquete con el foco en otro campo', async () => {
    renderWithField()

    await userEvent.click(screen.getByLabelText('Matrícula'))
    await userEvent.keyboard(`${reference}{Enter}`)

    expect(await screen.findByText(`Escaneado: ${reference}`)).toBeVisible()
  })

  it('no interrumpe lo que se escribe en un campo si no es un tiquete válido', async () => {
    renderWithField()

    await userEvent.click(screen.getByLabelText('Matrícula'))
    // Mismo largo que un tiquete, pero con el dígito de verificación equivocado.
    await userEvent.keyboard('0200586617099790{Enter}')

    expect(screen.getByLabelText('Matrícula')).toHaveValue('0200586617099790')
    expect(screen.queryByText(/Escaneado/)).not.toBeInTheDocument()
  })

  it('deja que el campo de Registrar salida procese su propia lectura', async () => {
    renderWithField('scanner')

    await userEvent.click(screen.getByLabelText('Matrícula'))
    await userEvent.keyboard(`${reference}{Enter}`)

    expect(screen.queryByText(/Escaneado/)).not.toBeInTheDocument()
  })

  it('ignora el lector mientras hay una confirmación abierta', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div role="alertdialog" aria-label="Confirmación" />} />
            <Route path="salidas" element={<ScanTarget />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.keyboard(`${reference}{Enter}`)

    expect(screen.queryByText(/Escaneado/)).not.toBeInTheDocument()
  })
})
