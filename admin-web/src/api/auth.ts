import { http } from './client'
import type { LoginResponse } from '../types'

export const authApi = {
  login: (username: string, password: string) =>
    http
      .post<LoginResponse>('/admin/auth/login', { username, password })
      .then((r) => r.data as unknown as LoginResponse),

  logout: () => http.post('/admin/auth/logout'),

  changePassword: (oldPassword: string, newPassword: string) =>
    http.post('/admin/auth/change-password', { oldPassword, newPassword })
}
