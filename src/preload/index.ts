import { contextBridge, ipcRenderer } from 'electron'
import type { ParkingApi, UpdateState } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc-channels'

const api: ParkingApi = {
  getAccessState: () => ipcRenderer.invoke(IPC_CHANNELS.ACCESS_GET_STATE),
  completeOnboarding: (input) => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_COMPLETE, input),
  updateParkingProfile: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_UPDATE, input),
  unlockWithPin: (input) => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_UNLOCK, input),
  lockApplication: () => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_LOCK),
  setPin: (input) => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_PIN_SET, input),
  removePin: (input) => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_PIN_REMOVE, input),
  getAppStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP_STATUS),
  getTariffConfiguration: () => ipcRenderer.invoke(IPC_CHANNELS.TARIFF_GET),
  updateTariffSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.TARIFF_SETTINGS_UPDATE, input),
  createRatePlan: (input) => ipcRenderer.invoke(IPC_CHANNELS.TARIFF_PLAN_CREATE, input),
  updateRatePlan: (input) => ipcRenderer.invoke(IPC_CHANNELS.TARIFF_PLAN_UPDATE, input),
  deleteRatePlan: (input) => ipcRenderer.invoke(IPC_CHANNELS.TARIFF_PLAN_DELETE, input),
  simulateCharge: (input) => ipcRenderer.invoke(IPC_CHANNELS.TARIFF_SIMULATE, input),
  registerEntry: (input) => ipcRenderer.invoke(IPC_CHANNELS.PARKING_ENTRY, input),
  resolveExitTarget: (input) => ipcRenderer.invoke(IPC_CHANNELS.PARKING_RESOLVE_EXIT, input),
  listActiveSessions: (input) => ipcRenderer.invoke(IPC_CHANNELS.PARKING_ACTIVE_LIST, input),
  quoteSessionExit: (input) => ipcRenderer.invoke(IPC_CHANNELS.PARKING_QUOTE_EXIT, input),
  closeSession: (input) => ipcRenderer.invoke(IPC_CHANNELS.PARKING_CLOSE, input),
  cancelSession: (input) => ipcRenderer.invoke(IPC_CHANNELS.PARKING_CANCEL, input),
  reprintEntryTicket: (input) => ipcRenderer.invoke(IPC_CHANNELS.PARKING_ENTRY_REPRINT, input),
  reprintReceipt: (input) => ipcRenderer.invoke(IPC_CHANNELS.PARKING_REPRINT, input),
  listExits: (input) => ipcRenderer.invoke(IPC_CHANNELS.PARKING_EXIT_HISTORY, input),
  getMonthlyOverview: (input) => ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_OVERVIEW, input),
  createMonthlyCustomer: (input) => ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_CUSTOMER_CREATE, input),
  updateMonthlyCustomer: (input) => ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_CUSTOMER_UPDATE, input),
  deleteMonthlyCustomer: (input) => ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_CUSTOMER_DELETE, input),
  createMonthlyPlan: (input) => ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_PLAN_CREATE, input),
  updateMonthlyPlan: (input) => ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_PLAN_UPDATE, input),
  deleteMonthlyPlan: (input) => ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_PLAN_DELETE, input),
  createSubscription: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_SUBSCRIPTION_CREATE, input),
  renewSubscription: (input) => ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_SUBSCRIPTION_RENEW, input),
  cancelSubscription: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_SUBSCRIPTION_CANCEL, input),
  registerSubscriptionPayment: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_PAYMENT_REGISTER, input),
  reprintSubscriptionReceipt: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_RECEIPT_REPRINT, input),
  findMonthlyCoverage: (input) => ipcRenderer.invoke(IPC_CHANNELS.MONTHLY_COVERAGE_LOOKUP, input),
  getCashState: () => ipcRenderer.invoke(IPC_CHANNELS.CASH_GET_STATE),
  openCashSession: (input) => ipcRenderer.invoke(IPC_CHANNELS.CASH_OPEN, input),
  closeCashSession: (input) => ipcRenderer.invoke(IPC_CHANNELS.CASH_CLOSE, input),
  voidCashPayment: (input) => ipcRenderer.invoke(IPC_CHANNELS.CASH_PAYMENT_VOID, input),
  listCashSessions: () => ipcRenderer.invoke(IPC_CHANNELS.CASH_SESSIONS_LIST),
  printCashCloseReceipt: (input) => ipcRenderer.invoke(IPC_CHANNELS.CASH_CLOSE_RECEIPT, input),
  listEmployees: () => ipcRenderer.invoke(IPC_CHANNELS.EMPLOYEES_LIST),
  createEmployee: (input) => ipcRenderer.invoke(IPC_CHANNELS.EMPLOYEE_CREATE, input),
  updateEmployee: (input) => ipcRenderer.invoke(IPC_CHANNELS.EMPLOYEE_UPDATE, input),
  deleteEmployee: (input) => ipcRenderer.invoke(IPC_CHANNELS.EMPLOYEE_DELETE, input),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, input),
  listPrinters: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTERS_LIST),
  printTestTicket: () => ipcRenderer.invoke(IPC_CHANNELS.PRINT_TEST),
  printCalibrationGuide: () => ipcRenderer.invoke(IPC_CHANNELS.PRINT_CALIBRATION),
  createBackup: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE),
  getUpdateState: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATE),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
  onUpdateState: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on(IPC_CHANNELS.UPDATE_STATE_CHANGED, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATE_CHANGED, wrapped)
  },
}

contextBridge.exposeInMainWorld('parkingAPI', api)
