import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppStatus } from '@shared/contracts'
import { useCashStore } from '@/store/cash-store'
import { useSystemStore } from '@/store/system-store'
import { DashboardPage } from './dashboard-page'

const status: AppStatus = {
  name: 'Parking Chía',
  version: '0.1.0-alpha.1',
  isPackaged: false,
  database: {
    connected: true,
    journalMode: 'WAL',
    foreignKeys: true,
    pathLabel: 'Datos locales',
  },
  activeSessions: 2,
}

describe('Dashboard', () => {
  beforeEach(() => {
    useSystemStore.setState({ status, updateState: null, loading: false, error: null })
    useCashStore.setState({
      session: null,
      movements: [],
      collectedCop: 0,
      voidedCop: 0,
      expectedCop: 0,
      movementCount: 0,
      loading: false,
      error: null,
      message: '',
      lastClose: null,
    })
    vi.mocked(window.parkingAPI.getAppStatus).mockResolvedValue({ ok: true, data: status })
  })

  it('resume la operación con vehículos activos, caja y mensualidades', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Buen turno' })).toBeInTheDocument()
    expect(await screen.findByText('Vehículos activos ahora')).toBeInTheDocument()
    expect(await screen.findByText('2')).toBeInTheDocument()
    expect(await screen.findByText('Caja cerrada')).toBeInTheDocument()
    expect(await screen.findByText('Mensualidades vigentes')).toBeInTheDocument()
    expect(await screen.findByText('1')).toBeInTheDocument()
  })

  it('muestra la caja abierta con lo esperado al cierre', async () => {
    useCashStore.setState({
      session: {
        id: 'cash-1',
        employeeId: 'employee-1',
        employeeName: 'Laura Torres',
        openedAt: '2026-08-19T08:00:00.000Z',
        closedAt: null,
        openingAmountCop: 50_000,
        closingAmountCop: null,
        expectedAmountCop: null,
        status: 'open',
        notes: null,
      },
      expectedCop: 60_000,
      loading: false,
    })

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Caja abierta')).toBeInTheDocument()
    expect(screen.getByText(/Esperado al cierre/)).toBeInTheDocument()
  })
})
