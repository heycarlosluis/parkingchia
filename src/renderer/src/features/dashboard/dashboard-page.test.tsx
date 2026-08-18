import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSystemStore } from '@/store/system-store'
import { DashboardPage } from './dashboard-page'

describe('Dashboard', () => {
  beforeEach(() => {
    useSystemStore.setState({
      status: {
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
      },
      updateState: null,
      loading: false,
      error: null,
    })
  })

  it('renderiza la pantalla principal con datos reales del estado', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Buen turno' })).toBeInTheDocument()
    expect(screen.getByText('Base de datos lista')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
