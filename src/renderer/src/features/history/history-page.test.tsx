import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { exitRecords } from '@/test/setup'
import { HistoryPage } from './history-page'

describe('Historial de salidas', () => {
  it('lista las salidas con su cobro y el recibo emitido', async () => {
    render(<HistoryPage />)

    const table = await screen.findByRole('table')
    const cobrada = within(table).getByRole('row', { name: /ABC123/ })
    expect(within(cobrada).getByText('1 h 30 min')).toBeInTheDocument()
    expect(within(cobrada).getByText(/^\$\s10\.000$/)).toBeInTheDocument()
    // El recibo se parte en dos líneas: el número y, debajo, el medio de pago.
    expect(within(cobrada).getByText('N.º 1')).toBeInTheDocument()
    expect(within(cobrada).getByText('Efectivo')).toBeInTheDocument()

    const anulada = within(table).getByRole('row', { name: /ZZZ999/ })
    expect(within(anulada).queryByRole('button', { name: /Reimprimir/ })).not.toBeInTheDocument()
  })

  it('resuelve el estado de cada salida en una insignia propia', async () => {
    render(<HistoryPage />)

    const table = await screen.findByRole('table')
    expect(
      within(within(table).getByRole('row', { name: /ABC123/ })).getByText('Cobrada'),
    ).toBeInTheDocument()
    expect(
      within(within(table).getByRole('row', { name: /ZZZ999/ })).getByText('Anulada'),
    ).toBeInTheDocument()
  })

  it('muestra la tarifa aplicada y la hora de ingreso de cada salida', async () => {
    render(<HistoryPage />)

    const table = await screen.findByRole('table')
    const cobrada = within(table).getByRole('row', { name: /ABC123/ })
    // La tarifa venía en el contrato pero no se mostraba en ninguna columna.
    expect(within(cobrada).getByText('Automóvil por hora')).toBeInTheDocument()
    expect(within(cobrada).getByText(/^Desde /)).toBeInTheDocument()
  })

  it('avisa cuando la consulta se recortó y no muestra todas las salidas', async () => {
    vi.mocked(window.parkingAPI.listExits).mockResolvedValueOnce({
      ok: true,
      data: { records: exitRecords, totalCount: 312, totalCollectedCop: 10_000 },
    })
    render(<HistoryPage />)

    expect(await screen.findByText('Se muestran las 2 salidas más recientes')).toBeInTheDocument()
    expect(screen.getByText(/312 salidas en total/)).toBeInTheDocument()
  })

  it('limpia los filtros de una sola vez', async () => {
    render(<HistoryPage />)
    await screen.findByRole('table')

    await userEvent.type(screen.getByPlaceholderText('Buscar matrícula'), 'QQQ')
    await userEvent.click(await screen.findByRole('button', { name: /Limpiar filtros/ }))

    expect(screen.getByPlaceholderText('Buscar matrícula')).toHaveValue('')
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('resume cuántas salidas hay y cuánto se cobró', async () => {
    render(<HistoryPage />)
    expect(await screen.findByText(/^2 salidas$/)).toBeInTheDocument()
    expect(screen.getByText(/\$\s10\.000 cobrados/)).toBeInTheDocument()
  })

  it('filtra por matrícula y explica cuando no hay coincidencias', async () => {
    render(<HistoryPage />)
    await screen.findByRole('table')

    await userEvent.type(screen.getByPlaceholderText('Buscar matrícula'), 'QQQ')

    expect(await screen.findByText('Ninguna salida coincide')).toBeInTheDocument()
    expect(screen.getByText(/^0 salidas$/)).toBeInTheDocument()
    expect(screen.getByText(/Ajusta la matrícula o el rango de fechas/)).toBeInTheDocument()
  })

  it('reimprime el recibo de una salida antigua e informa el resultado', async () => {
    render(<HistoryPage />)
    const table = await screen.findByRole('table')
    const cobrada = within(table).getByRole('row', { name: /ABC123/ })

    await userEvent.click(within(cobrada).getByRole('button', { name: /Reimprimir/ }))

    expect(await screen.findByText('No hay impresoras.')).toBeInTheDocument()
    expect(window.parkingAPI.reprintReceipt).toHaveBeenCalledWith({
      sessionId: 'session-closed',
    })
  })

  it('muestra el error cuando la consulta falla', async () => {
    vi.mocked(window.parkingAPI.listExits).mockResolvedValueOnce({
      ok: false,
      error: { code: 'OPERATION_FAILED', message: 'No fue posible consultar.' },
    })
    render(<HistoryPage />)
    expect(await screen.findByText('No fue posible consultar.')).toBeInTheDocument()
  })
})
