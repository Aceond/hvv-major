// 完美对战平台（PWA）web 接口签名算法（纯浏览器端实现，无第三方依赖）
// 对应 CS-Demo-Downloader 项目 downloader_pwa 的纯算法验证（scripts/pwa_pure_sign_probe.py）：
//   prefix = md5(randnum + ts + data)
//   payload = APPID + prefix + TAIL64
//   s = sha1(payload)
// 其中 data 为所有业务参数按 key 字典序排序后 `k=v` 用 `&` 连接。

/** PWA web 接口 APPID（恒定） */
export const PWA_APPID = 20000
/** PWA 签名尾部固定串（从 PWA 客户端提取的恒定值） */
const PWA_TAIL64 = '969c1bcfdc527c319157cc48f83b1d106ebdeca3e8d9763f1ae6b88dde9b3ea9'

// ============ MD5（RFC 1321，纯 JS） ============
const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]
const K = new Uint32Array(64)
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)

export function md5(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const n = bytes.length
  const bitLenLo = (n * 8) >>> 0
  const bitLenHi = Math.floor(n / 0x20000000)
  const paddedLen = (((n + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[n] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(paddedLen - 8, bitLenLo, true)
  dv.setUint32(paddedLen - 4, bitLenHi, true)

  const words = new Uint32Array(paddedLen / 4)
  for (let i = 0; i < words.length; i++) words[i] = dv.getUint32(i * 4, true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let off = 0; off < words.length; off += 16) {
    const M = words.subarray(off, off + 16)
    let A = a0
    let B = b0
    let C = c0
    let D = d0
    for (let i = 0; i < 64; i++) {
      let F: number
      let g: number
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + K[i] + M[g]) >>> 0
      A = D
      D = C
      C = B
      B = (B + rotl(F, S[i])) >>> 0
    }
    a0 = (a0 + A) >>> 0
    b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0
    d0 = (d0 + D) >>> 0
  }

  let hex = ''
  for (const w of [a0, b0, c0, d0]) {
    hex +=
      (w & 0xff).toString(16).padStart(2, '0') +
      ((w >>> 8) & 0xff).toString(16).padStart(2, '0') +
      ((w >>> 16) & 0xff).toString(16).padStart(2, '0') +
      ((w >>> 24) & 0xff).toString(16).padStart(2, '0')
  }
  return hex
}

function rotl(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0
}

// ============ SHA-1（FIPS 180-4，纯 JS） ============
export function sha1(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const n = bytes.length
  const bitLen = n * 8
  const paddedLen = (((n + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[n] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(paddedLen - 8, bitLen / 0x100000000, false)
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false)

  const words = new Uint32Array(paddedLen / 4)
  for (let i = 0; i < words.length; i++) words[i] = dv.getUint32(i * 4, false)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Uint32Array(80)
  for (let off = 0; off < words.length; off += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[off + i]
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const tmp = (rotl(a, 5) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = tmp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  let hex = ''
  for (const h of [h0, h1, h2, h3, h4]) {
    hex += h.toString(16).padStart(8, '0')
  }
  return hex
}

/** 生成 PWA web 接口的 a/r/s/t 签名参数（追加到业务参数之上），返回可直接拼到 URL 的对象 */
export function buildSignedPwaParams(params: Record<string, string | number>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) normalized[k] = String(v)
  const data = Object.keys(normalized)
    .sort()
    .map((k) => `${k}=${normalized[k]}`)
    .join('&')
  const randnum = String(Math.floor(100000 + Math.random() * 900000))
  const ts = String(Math.floor(Date.now() / 1000))
  const prefix = md5(randnum + ts + data)
  const signature = sha1(`${PWA_APPID}${prefix}${PWA_TAIL64}`)
  return { a: String(PWA_APPID), r: randnum, s: signature, t: ts, ...normalized }
}
