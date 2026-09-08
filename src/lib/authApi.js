import { requestJson } from './http'

export function getMe() {
  return requestJson('/api/auth/me')
}

export function login(payload) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function logout() {
  return requestJson('/api/auth/logout', {
    method: 'POST',
  })
}

export function startBindSession(payload = {}) {
  return requestJson('/api/bind/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getBindSession(id) {
  return requestJson(`/api/bind/sessions/${encodeURIComponent(id)}`)
}

export function completeBindSession(id, payload) {
  return requestJson(`/api/bind/sessions/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function adminLogin(payload) {
  return requestJson('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getAdminMe() {
  return requestJson('/api/admin/me')
}

export function adminLogout() {
  return requestJson('/api/admin/logout', {
    method: 'POST',
  })
}
