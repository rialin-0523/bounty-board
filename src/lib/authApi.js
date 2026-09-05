async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || (data && data.ok === false)) {
    throw new Error(data?.reason || `请求失败：${response.status}`)
  }
  return data
}

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
