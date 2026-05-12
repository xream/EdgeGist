import { Hono, type Context } from 'hono'
import { renderAppPage } from './app-page'
import {
  getCloudflareUsage,
  readCachedCloudflareUsage,
  readCloudflareSettings,
  saveCloudflareSettings,
} from './app/cloudflare'
import { clearEdgeGistHistory, exportEdgeGistData, importEdgeGistData } from './app/data'
import {
  clearOwnerSession,
  configMiddleware,
  issueOwnerSession,
  requireOwner,
  requireOwnerPassword,
  type AppEnv,
} from './http/auth'
import { badRequest, notFound, renderApiError } from './http/errors'
import { requireTurnstile } from './http/turnstile'
import { registerGistRoutes } from './gists/routes'
import { renderPwaManifest, renderServiceWorker } from './pwa'

const noIndexHeader = 'noindex, nofollow, noarchive'

const adminPageHeaders = {
  'cache-control': 'no-store, no-cache, must-revalidate',
  pragma: 'no-cache',
  expires: '0',
  'x-robots-tag': noIndexHeader,
}

export function createApp() {
  const app = new Hono<AppEnv>()

  app.onError((error, c) => renderApiError(c, error))

  app.use('*', async (c, next) => {
    c.header('x-robots-tag', noIndexHeader)
    await next()
  })

  app.use('*', configMiddleware)

  app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n', 200, {
    'content-type': 'text/plain; charset=utf-8',
    'x-robots-tag': noIndexHeader,
  }))

  app.get('/', (c) => c.text('Not Found', 404, adminPageHeaders))

  app.get('/:owner/manifest.webmanifest', (c) => {
    requireOwnerPath(c)
    return c.json(renderPwaManifest(c), 200, {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      pragma: 'no-cache',
      expires: '0',
      'x-robots-tag': noIndexHeader,
    })
  })

  app.get('/:owner/edgegist-sw', (c) => {
    requireOwnerPath(c)
    return c.text(renderServiceWorker(), 200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': `/${encodeURIComponent(c.get('config').ownerUsername)}/`,
      'x-robots-tag': noIndexHeader,
    })
  })

  app.get('/:owner/edgegist-sw.js', (c) => {
    requireOwnerPath(c)
    return c.redirect(`/${encodeURIComponent(c.get('config').ownerUsername)}/edgegist-sw`, 308)
  })

  app.get('/:owner/_edgegist/api/status', (c) => {
    requireOwnerPath(c)
    requireOwner(c)
    const config = c.get('config')
    return c.json(statusPayload(config))
  })

  app.post('/:owner/_edgegist/api/session', async (c) => {
    requireOwnerPath(c)
    await requireTurnstile(c)
    requireOwnerPassword(c)
    await issueOwnerSession(c, c.req.header('x-edgegist-remember-session') === 'true')
    return c.json(statusPayload(c.get('config')))
  })

  app.delete('/:owner/_edgegist/api/session', (c) => {
    requireOwnerPath(c)
    clearOwnerSession(c)
    return c.body(null, 204)
  })

  app.get('/:owner/_edgegist/api/cloudflare/settings', async (c) => {
    requireOwnerPath(c)
    requireOwner(c)
    const settings = await readCloudflareSettings(c.env.DB)
    return c.json(settings
      ? {
          accountId: settings.accountId,
          hasApiToken: Boolean(settings.apiToken),
          workerScriptName: settings.workerScriptName,
          d1DatabaseId: settings.d1DatabaseId,
          workersPlan: settings.workersPlan,
          d1Plan: settings.d1Plan,
        }
      : {
          accountId: '',
          hasApiToken: false,
          workerScriptName: '',
          d1DatabaseId: '',
          workersPlan: 'free',
          d1Plan: 'free',
        })
  })

  app.put('/:owner/_edgegist/api/cloudflare/settings', async (c) => {
    requireOwnerPath(c)
    requireOwner(c)
    return c.json(await saveCloudflareSettings(c.env.DB, await readJsonObject(c.req)))
  })

  app.get('/:owner/_edgegist/api/cloudflare/usage', async (c) => {
    requireOwnerPath(c)
    requireOwner(c)
    const refresh = new URL(c.req.url).searchParams.get('refresh') === 'true'
    return c.json(refresh ? await getCloudflareUsage(c.env.DB) : await readCachedCloudflareUsage(c.env.DB))
  })

  app.get('/:owner/_edgegist/api/export', async (c) => {
    requireOwnerPath(c)
    requireOwner(c)
    const includeHistory = new URL(c.req.url).searchParams.get('includeHistory') === 'true'
    const config = c.get('config')
    const payload = await exportEdgeGistData(c.env.DB, config.ownerUsername, includeHistory)
    return c.json(payload, 200, {
      'content-disposition': `attachment; filename="edgegist-export-${new Date().toISOString().slice(0, 10)}.json"`,
    })
  })

  app.post('/:owner/_edgegist/api/import', async (c) => {
    requireOwnerPath(c)
    requireOwner(c)
    const includeHistory = new URL(c.req.url).searchParams.get('includeHistory') === 'true'
    const result = await importEdgeGistData(c.env.DB, await readJsonObject(c.req), {
      includeHistory,
      fallbackOwnerLogin: c.get('config').ownerUsername,
    })
    return c.json(result)
  })

  app.delete('/:owner/_edgegist/api/history', async (c) => {
    requireOwnerPath(c)
    requireOwner(c)
    return c.json(await clearEdgeGistHistory(c.env.DB))
  })

  registerGistRoutes(app, { prefix: '/lite', lite: true })
  registerGistRoutes(app)

  app.get('/:owner', (c) => {
    requireOwnerPath(c)
    return c.html(renderAppPage(pathWithSearch(c.req.url), publicPageConfig(c)), 200, adminPageHeaders)
  })

  app.get('/:owner/:gistId', (c) => {
    requireOwnerPath(c)
    if (pathParam(c, 'gistId').startsWith('_')) throw notFound()
    return c.html(renderAppPage(pathWithSearch(c.req.url), publicPageConfig(c)), 200, adminPageHeaders)
  })

  app.get('/:owner/:gistId/:sha', (c) => {
    requireOwnerPath(c)
    if (pathParam(c, 'gistId').startsWith('_')) throw notFound()
    if (pathParam(c, 'sha').startsWith('_')) throw notFound()
    return c.html(renderAppPage(pathWithSearch(c.req.url), publicPageConfig(c)), 200, adminPageHeaders)
  })

  return app
}

function statusPayload(config: AppEnv['Variables']['config']) {
  return {
    name: 'EdgeGist',
    ok: true,
    ownerUsername: config.ownerUsername,
    baseUrl: config.baseUrl,
    retention: config.retention,
  }
}

function publicPageConfig(c: Context<AppEnv>) {
  return {
    turnstileSiteKey: c.get('config').turnstile?.siteKey ?? null,
  }
}

export default createApp()

async function readJsonObject(request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {
  const payload = await request.json().catch(() => {
    throw badRequest('Invalid JSON')
  })
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('JSON body must be an object')
  }
  return payload as Record<string, unknown>
}

function pathWithSearch(requestUrl: string) {
  const url = new URL(requestUrl)
  return `${url.pathname}${url.search}`
}

function requireOwnerPath(c: Context<AppEnv>) {
  if (pathParam(c, 'owner') !== c.get('config').ownerUsername) {
    throw notFound()
  }
}

function pathParam(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name) ?? ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
