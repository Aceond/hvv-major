// PWA 接口代理（Supabase Edge Function）
// 用途：PWA「对局列表」接口要求自定义 steamid 请求头，浏览器跨域预检不放行，需服务端转发。
// 用法（GET，简单请求无预检）：
//   {SUPABASE_URL}/functions/v1/pwa-proxy?url=list&steamid={Steam64}&a=20000&r=..&s=..&t=..&access_token=..&size=30&uid=..
//   {SUPABASE_URL}/functions/v1/pwa-proxy?url=report&a=20000&r=..&s=..&t=..&access_token=..&match_id=..
// 其中 a/r/s/t 为前端 pwaCrypto.ts 生成的签名参数；本函数仅转发并补充 steamid 请求头。
// 部署：npx supabase functions deploy pwa-proxy --no-verify-jwt
// （config.toml 已设 verify_jwt = false，--no-verify-jwt 仅首次部署时需带）

const LIST_URL = 'https://pwaweblogin.wmpvp.com/user-info/recent-ladder-score-list'
const REPORT_URL = 'https://pwaweblogin.wmpvp.com/match-api/report'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const url = new URL(req.url)
  const kind = url.searchParams.get('url') ?? 'report'
  const steamid = url.searchParams.get('steamid') ?? ''

  // 透传所有业务/签名参数（剔除 url、steamid 两个控制参数）
  const params = new URLSearchParams()
  for (const [k, v] of url.searchParams.entries()) {
    if (k === 'url' || k === 'steamid') continue
    params.set(k, v)
  }

  const target = kind === 'list' ? LIST_URL : REPORT_URL
  const headers: Record<string, string> = {
    'User-Agent': 'okhttp/4.9.3',
    Referer: 'https://client.wmpvp.com',
  }
  // 列表接口必须带 steamid 请求头（实测无需 X-PWA-Signature，仅需 steamid 头即可）
  if (kind === 'list' && steamid) {
    headers['X-PWA-SteamId'] = steamid
    headers['PwaSteamId'] = steamid
    headers['x-pwa-steamid'] = steamid
    headers['pwasteamid'] = steamid
  }

  try {
    const resp = await fetch(`${target}?${params.toString()}`, { headers })
    const text = await resp.text()
    return new Response(text, {
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ code: -1, msg: `proxy error: ${String(e)}` }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
