import type { ParkingApi } from '@shared/contracts'

declare global {
  interface Window {
    parkingAPI: ParkingApi
  }
}

export {}
