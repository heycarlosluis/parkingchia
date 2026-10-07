import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMonthlyStore } from '@/store/monthly-store'
import { MonthlyPage } from './monthly-page'

const getOverviewDefault = vi.mocked(window.parkingAPI.getMonthlyOverview).getMockImplementation()!

function renderPage(initialEntry = '/mensualidades'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MonthlyPage />
    </MemoryRouter>,
  )
}

describe('Mensualidades', () => {
  beforeEach(() => {
    vi.mocked(window.parkingAPI.getMonthlyOverview).mockImplementation(getOverviewDefault)
    vi.mocked(window.parkingAPI.deleteMonthlyCustomer).mockClear()
    vi.mocked(window.parkingAPI.deleteMonthlyPlan).mockClear()
    useMonthlyStore.setState({
      subscriptions: [],
      customers: [],
      plans: [],
      summary: {
        activeCount: 0,
        expiringSoonCount: 0,
        expiredCount: 0,
        pendingCollectionCop: 0,
        collectedThisMonthCop: 0,
      },
      search: '',
      status: 'all',
      loading: true,
      mutating: false,
      error: null,
      message: '',
    })
  })

  it.each([
    {
      tab: 'clientes',
      confirm: 'Eliminar cliente',
      api: 'deleteMonthlyCustomer' as const,
      id: 'customer-1',
      list: 'customers' as const,
    },
    {
      tab: 'planes',
      confirm: 'Eliminar plan',
      api: 'deleteMonthlyPlan' as const,
      id: 'monthly-plan-car',
      list: 'plans' as const,
    },
  ])(
    'elimina desde $tab conservando el historial y exige confirmación',
    async ({ tab, confirm, api, id, list }) => {
      const initial = await window.parkingAPI.getMonthlyOverview({ search: '', status: 'all' })
      if (!initial.ok) throw new Error('Falta el escenario de mensualidades')
      vi.mocked(window.parkingAPI[api]).mockImplementationOnce(async () => {
        vi.mocked(window.parkingAPI.getMonthlyOverview).mockResolvedValue({
          ok: true,
          data: { ...initial.data, [list]: [] },
        })
        return { ok: true, data: undefined }
      })
      renderPage(`/mensualidades?tab=${tab}`)
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
      const dialog = await screen.findByRole('alertdialog')
      expect(window.parkingAPI[api]).not.toHaveBeenCalled()
      expect(within(dialog).getByText(/conservan/)).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: confirm }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(window.parkingAPI[api]).toHaveBeenCalledWith({ id })
      expect(useMonthlyStore.getState()[list]).toEqual([])
      await userEvent.click(screen.getByRole('tab', { name: 'Mensualidades' }))
      const table = await screen.findByRole('table')
      expect(within(table).getByText('MEN001')).toBeInTheDocument()
      expect(within(table).queryByRole('button', { name: 'Renovar' })).not.toBeInTheDocument()
      expect(within(table).getByRole('button', { name: 'Cobrar' })).toBeInTheDocument()
    },
  )

  it('muestra el error de eliminación dentro de la confirmación y permite volver', async () => {
    vi.mocked(window.parkingAPI.deleteMonthlyPlan).mockResolvedValueOnce({
      ok: false,
      error: { code: 'OPERATION_FAILED', message: 'No fue posible eliminar el plan.' },
    })
    renderPage('/mensualidades?tab=planes')
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar plan' }))
    expect(await within(dialog).findByText('No fue posible eliminar el plan.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Volver' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('al reabrir el formulario vuelve a proponer el costo del mismo plan', async () => {
    renderPage()
    await screen.findByRole('table')
    for (let attempt = 0; attempt < 2; attempt++) {
      await userEvent.click(screen.getByRole('button', { name: /Nueva mensualidad/ }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByLabelText('Plan mensual'))
      await userEvent.click(await screen.findByRole('option', { name: /Mensualidad automóvil/ }))
      expect(within(dialog).getByLabelText('Costo de la mensualidad')).toHaveValue(150_000)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    }
  })

  it('impide renovar con un costo vacío y mantiene el error dentro del diálogo', async () => {
    vi.mocked(window.parkingAPI.renewSubscription).mockResolvedValueOnce({
      ok: false,
      error: { code: 'SUBSCRIPTION_OVERLAPS', message: 'El periodo ya está renovado.' },
    })
    renderPage()
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Renovar' }))
    const dialog = await screen.findByRole('alertdialog')
    const amount = within(dialog).getByLabelText('Costo del nuevo periodo')
    const confirm = within(dialog).getByRole('button', { name: 'Renovar mensualidad' })
    await userEvent.clear(amount)
    expect(confirm).toBeDisabled()
    await userEvent.type(amount, '150000')
    await userEvent.click(confirm)
    expect(await within(dialog).findByText('El periodo ya está renovado.')).toBeInTheDocument()
  })

  it('resume la operación mensual y lista las mensualidades vigentes', async () => {
    renderPage()

    const table = await screen.findByRole('table')
    const row = within(table).getByRole('row', { name: /MEN001/ })
    expect(within(row).getByText('María Fernanda Ríos')).toBeInTheDocument()
    expect(within(row).getByText('Mensualidad automóvil')).toBeInTheDocument()
    expect(within(row).getByText('Vigente')).toBeInTheDocument()
    expect(within(row).getByText(/^\$\s150\.000$/)).toBeInTheDocument()
    expect(within(row).getByText('Sin pagar')).toBeInTheDocument()

    expect(screen.getByText('Mensualidades vigentes')).toBeInTheDocument()
    expect(screen.getByText('Saldo por cobrar')).toBeInTheDocument()
  })

  it('filtra por matrícula y explica cuando no hay coincidencias', async () => {
    renderPage()
    await screen.findByRole('table')

    await userEvent.type(screen.getByPlaceholderText('Buscar matrícula o cliente'), 'QQQ')

    expect(await screen.findByText('Ninguna mensualidad coincide')).toBeInTheDocument()
    expect(window.parkingAPI.getMonthlyOverview).toHaveBeenCalledWith({
      search: 'QQQ',
      status: 'all',
    })
  })

  it('cobra el saldo pendiente y ofrece reimprimir el comprobante', async () => {
    renderPage()
    const table = await screen.findByRole('table')

    await userEvent.click(within(table).getByRole('button', { name: /Cobrar/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Saldo pendiente')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Efectivo recibido'), '150000')
    await userEvent.click(within(dialog).getByRole('button', { name: /Cobrar \$/ }))

    expect(await screen.findByText(/Pago registrado · MEN001/)).toBeInTheDocument()
    expect(window.parkingAPI.registerSubscriptionPayment).toHaveBeenCalledWith({
      subscriptionId: 'subscription-1',
      amountCop: 150_000,
      method: 'cash',
      receivedCop: 150_000,
      reference: null,
    })
    expect(screen.getByRole('button', { name: /Reimprimir comprobante/ })).toBeInTheDocument()
  })

  it('exige un motivo antes de cancelar una mensualidad', async () => {
    renderPage()
    const table = await screen.findByRole('table')

    await userEvent.click(within(table).getByRole('button', { name: /Cancelar/ }))

    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: 'Cancelar mensualidad' })
    expect(confirm).toBeDisabled()

    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Cambió de vehículo')
    await userEvent.click(confirm)

    await waitFor(() => {
      expect(window.parkingAPI.cancelSubscription).toHaveBeenCalledWith({
        id: 'subscription-1',
        reason: 'Cambió de vehículo',
      })
    })
  })

  it('crea una mensualidad con la vigencia calculada desde la duración', async () => {
    renderPage()
    await screen.findByRole('table')

    await userEvent.click(screen.getByRole('button', { name: /Nueva mensualidad/ }))
    const dialog = await screen.findByRole('dialog')

    await userEvent.type(within(dialog).getByLabelText('Matrícula'), 'NUE777')
    await userEvent.click(within(dialog).getByLabelText('Cliente'))
    await userEvent.click(await screen.findByRole('option', { name: /María Fernanda Ríos/ }))
    await userEvent.click(within(dialog).getByLabelText('Plan mensual'))
    await userEvent.click(await screen.findByRole('option', { name: /Mensualidad automóvil/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: /Crear mensualidad/ }))

    await waitFor(() => {
      expect(window.parkingAPI.createSubscription).toHaveBeenCalled()
    })
    const draft = vi.mocked(window.parkingAPI.createSubscription).mock.calls[0]?.[0]
    expect(draft).toMatchObject({
      customerId: 'customer-1',
      plate: 'NUE777',
      ratePlanId: 'monthly-plan-car',
      amountCop: 150_000,
    })
    expect(draft!.endDate > draft!.startDate).toBe(true)
  })

  it('administra los clientes y los planes en sus propias pestañas', async () => {
    renderPage('/mensualidades?tab=clientes')

    expect(await screen.findByText('1 cliente')).toBeInTheDocument()
    expect(screen.getByText('1020304050')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Planes' }))
    expect(await screen.findByText('1 plan mensual')).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
  })

  it('muestra el error cuando la consulta falla', async () => {
    vi.mocked(window.parkingAPI.getMonthlyOverview).mockResolvedValueOnce({
      ok: false,
      error: { code: 'OPERATION_FAILED', message: 'No fue posible consultar.' },
    })
    renderPage()
    expect(await screen.findByText('No fue posible consultar.')).toBeInTheDocument()
  })
})
