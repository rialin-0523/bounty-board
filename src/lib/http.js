const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export function apiUrl(path) {
  const text = String(path || '')
  if (/^https?:\/\//i.test(text)) return text
  const normalizedPath = text.startsWith('/') ? text : `/${text}`
  return `${apiBaseUrl}${normalizedPath}`
}

export async function requestJson(path, options = {}) {
  const { headers = {}, ...rest } = options
  const finalHeaders = { ...headers }
  const hasBody = rest.body !== undefined && rest.body !== null
  const hasContentType = Object.keys(finalHeaders).some(key => key.toLowerCase() === 'content-type')
  if (hasBody && !hasContentType) {
    finalHeaders['Content-Type'] = 'application/json'
  }
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: finalHeaders,
    ...rest,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || (data && data.ok === false)) {
    throw new Error(data?.reason || `请求失败：${response.status}`)
  }
  return data
}
