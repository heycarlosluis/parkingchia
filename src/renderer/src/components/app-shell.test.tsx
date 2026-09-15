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
})
