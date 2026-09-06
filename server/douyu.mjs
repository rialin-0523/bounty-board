import net from 'node:net'
import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const HEARTBEAT_TYPE = 'mrkl'
const LOGIN_HOSTS = ['danmuproxy.douyu.com', 'openbarrage.douyutv.com']

function compactText(value) {
  return String(value ?? '').trim()
}

function unescapeValue(value) {
  return String(value ?? '').replace(/@S/g, '/').replace(/@A/g, '@')
}

export function parseDouyuMessage(raw) {
  const item = {}
  for (const part of String(raw || '').trim().replace(/\0+$/g, '').replace(/^\/+|\/+$/g, '').split('/')) {
    if (!part.includes('@=')) continue
    const [key, value] = part.split('@=', 2)
    item[key] = unescapeValue(value)
  }
  return item
}

export function encodeDouyuPacket(body) {
  const payload = Buffer.from(`${body}\0`, 'utf8')
  const packetLen = 8 + payload.length
  const buf = Buffer.alloc(12)
  buf.writeInt32LE(packetLen, 0)
  buf.writeInt32LE(packetLen, 4)
  buf.writeInt16LE(689, 8)
  buf.writeInt16LE(0, 10)
  return Buffer.concat([buf, payload])
}

export function decodeDouyuPackets(buffer) {
  const messages = []
  let offset = 0
  while (buffer.length - offset >= 12) {
    const packetLen = buffer.readInt32LE(offset)
    const frameLen = packetLen + 4
    if (packetLen <= 8 || frameLen > 1024 * 1024) {
      return { messages, rest: Buffer.alloc(0) }
    }
    if (buffer.length - offset < frameLen) break
    const payloadStart = offset + 12
    const payloadEnd = offset + frameLen
    const payload = buffer.subarray(payloadStart, payloadEnd).toString('utf8').replace(/\0+$/g, '')
    if (payload) messages.push(payload)
    offset += frameLen
  }
  return { messages, rest: buffer.subarray(offset) }
}

export function normalizeBindCodeText(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function hasLetterAndDigit(code) {
  return /[A-Z]/.test(code) && /\d/.test(code)
}

export function generateBindCode(length = 6) {
  const size = Math.max(4, Number(length) || 6)
  for (;;) {
    const bytes = randomBytes(size)
    let out = ''
    for (let i = 0; i < size; i += 1) {
      out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
    }
    if (hasLetterAndDigit(out)) return out
  }
}

function parseMaybeInt(value) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) ? n : null
}

export function normalizeAvatarUrl(value) {
  const text = compactText(value).replace(/@S/g, '/').replace(/@A/g, '@')
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text.replace(/^http:\/\//i, 'https://')
  if (text.startsWith('//')) return `https:${text}`
  if (text.startsWith('/')) return `https://apic.douyucdn.cn${text}`
  if (/^[\w./-]+\.(?:jpg|jpeg|png|webp|gif)(?:\?.*)?$/i.test(text)) {
    return `https://apic.douyucdn.cn/${text.replace(/^\/+/, '')}`
  }
  return ''
}

export function extractProfileFields(message, now = Date.now()) {
  return {
    roomId: String(message.roomId || message.room_id || message.rid || ''),
    uid: String(message.uid || message.senderUid || message.sender_uid || ''),
    name: String(message.nn || message.name || message.nick || message.displayName || message.uname || '').trim(),
    level: parseMaybeInt(message.level ?? message.lv ?? message.ul),
    avatar: normalizeAvatarUrl(message.avatar || message.face || message.avatarUrl || ''),
    badgeName: String(message.badgeName || message.badge || message.bnn || '').trim(),
    badgeLevel: parseMaybeInt(message.badgeLevel ?? message.badgeLv ?? message.bl) ?? 0,
    messageTime: parseMaybeInt(message.time ?? message.ts ?? now) ?? now,
  }
}

export class DouyuDanmakuClient extends EventEmitter {
  constructor({ roomId, hosts = LOGIN_HOSTS, reconnectDelayMs = 5000 } = {}) {
    super()
    this.roomId = String(roomId || '').trim()
    this.hosts = hosts
    this.reconnectDelayMs = reconnectDelayMs
    this.socket = null
    this.stopped = false
    this.heartbeatTimer = null
    this.retryDelay = reconnectDelayMs
    this.buffer = Buffer.alloc(0)
  }

  async start() {
    if (this.stopped) this.stopped = false
    this.loop().catch(err => this.emit('error', err))
  }

  stop() {
    this.stopped = true
    this.cleanupSocket()
  }

  cleanupSocket() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.socket) {
      try {
        this.socket.destroy()
      } catch {}
    }
    this.socket = null
    this.buffer = Buffer.alloc(0)
  }

  send(body) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(encodeDouyuPacket(body))
    }
  }

  async connectOnce() {
    const errors = []
    for (const host of this.hosts) {
      try {
        const socket = net.createConnection({ host, port: 8601, timeout: 10_000 })
        await new Promise((resolve, reject) => {
          socket.once('connect', resolve)
          socket.once('error', reject)
        })
        socket.setNoDelay(true)
        socket.setKeepAlive(true, 30_000)
        return { socket, host }
      } catch (err) {
        errors.push(`${host}: ${err.message || err}`)
      }
    }
    throw new Error(errors.join('; '))
  }

  async loop() {
    while (!this.stopped) {
      try {
        if (!this.roomId) throw new Error('缺少 roomId')
        this.emit('status', `连接房间 ${this.roomId}...`)
        const { socket, host } = await this.connectOnce()
        this.socket = socket
        this.retryDelay = this.reconnectDelayMs
        this.emit('status', `已连接 ${host}，正在监听弹幕...`)
        socket.on('data', chunk => this.onData(chunk))
        socket.on('close', () => this.onDisconnect())
        socket.on('error', err => this.emit('status', `连接异常：${err.message || err}`))
        this.send(`type@=loginreq/roomid@=${this.roomId}/`)
        await new Promise(resolve => setTimeout(resolve, 200))
        this.send(`type@=joingroup/rid@=${this.roomId}/gid@=-9999/`)
        this.startHeartbeat()
        await new Promise((resolve, reject) => {
          socket.once('close', resolve)
          socket.once('error', reject)
        })
      } catch (err) {
        if (this.stopped) break
        this.emit('status', `监听异常：${err.message || err}，${Math.round(this.retryDelay / 1000)} 秒后重试`)
        await new Promise(resolve => setTimeout(resolve, this.retryDelay))
        this.retryDelay = Math.min(this.retryDelay * 2, 60_000)
      } finally {
        this.cleanupSocket()
      }
    }
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && !this.socket.destroyed) {
        this.send(`type@=${HEARTBEAT_TYPE}/`)
      }
    }, 35_000)
  }

  onDisconnect() {
    if (!this.stopped) this.emit('status', '连接断开，准备重连...')
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const decoded = decodeDouyuPackets(this.buffer)
    this.buffer = decoded.rest
    for (const raw of decoded.messages) {
      const message = parseDouyuMessage(raw)
      const type = String(message.type || '')
      if (type === 'pingreq') {
        this.send(`type@=${HEARTBEAT_TYPE}/`)
        continue
      }
      if (type === 'chatmsg') {
        const payload = {
          ...extractProfileFields({
            ...message,
            roomId: this.roomId,
          }),
          text: String(message.txt || message.content || '').trim(),
          raw: message,
        }
        this.emit('chat', payload)
      }
    }
  }
}
