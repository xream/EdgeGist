import type { Context, Hono } from 'hono'
import type { AppEnv } from '../http/auth'
import { requireOwner } from '../http/auth'
import { badRequest, notFound } from '../http/errors'
import { parsePagination } from '../http/pagination'
import { D1GistRepository } from './repository'
import { canReadGist, GistService } from './service'
import {
  emptyComments,
  emptyForks,
  mockCommentResponse,
  mockForkResponse,
} from './social'
import {
  presentCommit,
  presentGist,
  presentLiteCommit,
  presentLiteGist,
  presentLiteVersion,
  presentVersion,
} from './presenter'
import type { ListGistsOptions } from './types'

const rawFileHeaders = {
  'content-type': 'text/plain; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'x-frame-options': 'deny',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'access-control-allow-origin': '*',
  'cross-origin-resource-policy': 'cross-origin',
}

type GistRoutesOptions = {
  lite?: boolean
  prefix?: string
}

export function registerGistRoutes(app: Hono<AppEnv>, routeOptions: GistRoutesOptions = {}): void {
  const route = (path: string) => `${routeOptions.prefix ?? ''}${path}`
  const present = routeOptions.lite ? presentLiteGist : presentGist
  const apiPrefix = routeOptions.lite ? routeOptions.prefix : undefined

  app.get(route('/gists'), async (c) => {
    const repository = getRepository(c)
    const config = c.get('config')
    const isOwner = c.get('isOwner')
    const searchParams = new URL(c.req.url).searchParams
    const pagination = parsePagination(searchParams)
    const options = listOptionsFromSearchParams(searchParams, {
      ownerLogin: config.ownerUsername,
      includeSecret: isOwner,
      searchContent: !routeOptions.lite,
      limit: pagination.limit,
      offset: pagination.offset,
    })
    const [gists, total] = await Promise.all([
      repository.listGists(options, false),
      repository.countGists(options),
    ])
    return c.json(
      gists.map((gist) => present(gist, { config, apiPrefix, includeContent: false, includeHistory: false })),
      200,
      paginationHeaders(total, pagination),
    )
  })

  app.get(route('/gists/public'), async (c) => {
    const repository = getRepository(c)
    const config = c.get('config')
    const searchParams = new URL(c.req.url).searchParams
    const pagination = parsePagination(searchParams)
    const options = listOptionsFromSearchParams(searchParams, {
      includeSecret: false,
      publicOnly: true,
      searchContent: !routeOptions.lite,
      limit: pagination.limit,
      offset: pagination.offset,
    })
    const [gists, total] = await Promise.all([
      repository.listGists(options, false),
      repository.countGists(options),
    ])
    return c.json(
      gists.map((gist) => present(gist, { config, apiPrefix, includeContent: false, includeHistory: false })),
      200,
      paginationHeaders(total, pagination),
    )
  })

  app.get(route('/gists/starred'), async (c) => {
    const repository = getRepository(c)
    const config = c.get('config')
    const searchParams = new URL(c.req.url).searchParams
    const pagination = parsePagination(searchParams)
    const options = listOptionsFromSearchParams(searchParams, {
      ownerLogin: config.ownerUsername,
      includeSecret: c.get('isOwner'),
      starredOnly: true,
      searchContent: !routeOptions.lite,
      limit: pagination.limit,
      offset: pagination.offset,
    })
    const [gists, total] = await Promise.all([
      repository.listGists(options, false),
      repository.countGists(options),
    ])
    return c.json(
      gists.map((gist) => present(gist, { config, apiPrefix, includeContent: false, includeHistory: false })),
      200,
      paginationHeaders(total, pagination),
    )
  })

  app.post(route('/gists'), async (c) => {
    requireOwner(c)
    const service = new GistService(getRepository(c), c.get('config'))
    const gist = await service.createFromRequest(await readJsonObject(c.req))
    return c.json(
      present(gist, {
        config: c.get('config'),
        apiPrefix,
        ...(routeOptions.lite ? {} : { versions: await getRepository(c).listVersions(gist.id) }),
      }),
      201,
    )
  })

  app.get(route('/users/:username/gists'), async (c) => {
    const repository = getRepository(c)
    const config = c.get('config')
    const username = pathParam(c, 'username')
    if (username !== config.ownerUsername) return c.json([])

    const searchParams = new URL(c.req.url).searchParams
    const pagination = parsePagination(searchParams)
    const options = listOptionsFromSearchParams(searchParams, {
      ownerLogin: username,
      includeSecret: c.get('isOwner'),
      searchContent: !routeOptions.lite,
      limit: pagination.limit,
      offset: pagination.offset,
    })
    const [gists, total] = await Promise.all([
      repository.listGists(options, false),
      repository.countGists(options),
    ])
    return c.json(
      gists.map((gist) => present(gist, { config, apiPrefix, includeContent: false, includeHistory: false })),
      200,
      paginationHeaders(total, pagination),
    )
  })

  app.get(route('/gists/:gistId/raw/:sha/:filename'), async (c) => {
    const gist = await requireReadableGist(c)
    const version = await requireExistingVersion(c, gist.id, requiredParam(c, 'sha'))
    const filename = requiredParam(c, 'filename')
    const file = version.files.find((candidate) => candidate.filename === filename)
    if (!file) throw notFound()
    return c.body(file.content, 200, rawFileHeaders)
  })

  app.get(route('/gists/:gistId/raw/:filename'), async (c) => {
    const gist = await requireReadableGist(c)
    const filename = requiredParam(c, 'filename')
    const file = gist.files.find((candidate) => candidate.filename === filename)
    if (!file) throw notFound()
    return c.body(file.content, 200, rawFileHeaders)
  })

  app.get(route('/:owner/:gistId/raw/:filename'), async (c) => {
    requireOwnerPath(c)
    const gist = await requireReadableGist(c)
    const filename = requiredParam(c, 'filename')
    const file = gist.files.find((candidate) => candidate.filename === filename)
    if (!file) throw notFound()
    return c.body(file.content, 200, rawFileHeaders)
  })

  app.get(route('/gists/:gistId/commits'), async (c) => {
    const gist = await requireReadableGist(c, !routeOptions.lite)
    const repository = getRepository(c)
    const versions = await repository.listVersionCommits(gist.id)
    const presentCommitPayload = routeOptions.lite ? presentLiteCommit : presentCommit
    return c.json(versions.map((version) =>
      presentCommitPayload(gist.id, version, { config: c.get('config'), apiPrefix }),
    ))
  })

  app.get(route('/:owner/:gistId/raw/:sha/:filename'), async (c) => {
    requireOwnerPath(c)
    const gist = await requireReadableGist(c)
    const version = await requireExistingVersion(c, gist.id, requiredParam(c, 'sha'))
    const filename = requiredParam(c, 'filename')
    const file = version.files.find((candidate) => candidate.filename === filename)
    if (!file) throw notFound()
    return c.body(file.content, 200, rawFileHeaders)
  })

  app.get(route('/gists/:gistId/star'), async (c) => {
    requireOwner(c)
    const gist = await requireExistingGist(c, !routeOptions.lite)
    return c.body(null, gist.starredAt ? 204 : 404)
  })

  app.put(route('/gists/:gistId/star'), async (c) => {
    requireOwner(c)
    const gist = await getRepository(c).setGistStarred(
      requiredParam(c, 'gistId'),
      new Date().toISOString(),
      !routeOptions.lite,
    )
    if (!gist) throw notFound()
    return c.body(null, 204)
  })

  app.delete(route('/gists/:gistId/star'), async (c) => {
    requireOwner(c)
    const gist = await getRepository(c).setGistStarred(
      requiredParam(c, 'gistId'),
      null,
      !routeOptions.lite,
    )
    if (!gist) throw notFound()
    return c.body(null, 204)
  })

  app.get(route('/gists/:gistId/forks'), async (c) => {
    await requireReadableGist(c, !routeOptions.lite)
    return c.json(emptyForks())
  })

  app.post(route('/gists/:gistId/forks'), async (c) => {
    requireOwner(c)
    await requireReadableGist(c, !routeOptions.lite)
    return c.json(
      mockForkResponse(requiredParam(c, 'gistId'), c.get('config'), {
        apiPrefix,
        lite: routeOptions.lite,
      }),
      202,
    )
  })

  app.get(route('/gists/:gistId/comments'), async (c) => {
    await requireReadableGist(c, !routeOptions.lite)
    return c.json(emptyComments())
  })

  app.post(route('/gists/:gistId/comments'), async (c) => {
    requireOwner(c)
    await requireReadableGist(c, !routeOptions.lite)
    return c.json(mockCommentResponse(c.get('config'), {
      apiPrefix,
      lite: routeOptions.lite,
    }), 201)
  })

  app.get(route('/gists/:gistId/comments/:commentId'), async (c) => {
    await requireReadableGist(c, !routeOptions.lite)
    throw notFound('Comment not found')
  })

  app.patch(route('/gists/:gistId/comments/:commentId'), async (c) => {
    requireOwner(c)
    await requireReadableGist(c, !routeOptions.lite)
    return c.json(mockCommentResponse(c.get('config'), {
      apiPrefix,
      lite: routeOptions.lite,
    }))
  })

  app.delete(route('/gists/:gistId/comments/:commentId'), async (c) => {
    requireOwner(c)
    await requireReadableGist(c, !routeOptions.lite)
    return c.body(null, 204)
  })

  app.get(route('/gists/:gistId/:sha'), async (c) => {
    const gist = await requireReadableGist(c, !routeOptions.lite)
    const version = await requireExistingVersion(
      c,
      gist.id,
      requiredParam(c, 'sha'),
      !routeOptions.lite,
      !routeOptions.lite,
    )
    if (routeOptions.lite) {
      return c.json(presentLiteVersion(version, {
        config: c.get('config'),
        apiPrefix,
        visibility: gist.visibility,
      }))
    }
    return c.json(presentVersion(version, { config: c.get('config'), visibility: gist.visibility }))
  })

  app.get(route('/gists/:gistId'), async (c) => {
    const gist = await requireReadableGist(c, !routeOptions.lite)
    if (routeOptions.lite) return c.json(presentLiteGist(gist, { config: c.get('config'), apiPrefix }))
    const versions = await getRepository(c).listVersions(gist.id)
    return c.json(presentGist(gist, { config: c.get('config'), versions }))
  })

  app.patch(route('/gists/:gistId'), async (c) => {
    requireOwner(c)
    const service = new GistService(getRepository(c), c.get('config'))
    const gist = await service.updateFromRequest(
      requiredParam(c, 'gistId'),
      await readJsonObject(c.req),
    )
    if (!gist) return c.body(null, 204)
    return c.json(
      present(gist, {
        config: c.get('config'),
        apiPrefix,
        ...(routeOptions.lite ? {} : { versions: await getRepository(c).listVersions(gist.id) }),
      }),
    )
  })

  app.delete(route('/gists/:gistId'), async (c) => {
    requireOwner(c)
    const deleted = await getRepository(c).deleteGist(requiredParam(c, 'gistId'))
    if (!deleted) throw notFound()
    return c.body(null, 204)
  })
}

type AppContext = Context<AppEnv>

function getRepository(c: AppContext) {
  return new D1GistRepository(c.env.DB)
}

function listOptionsFromSearchParams(
  searchParams: URLSearchParams,
  base: Pick<ListGistsOptions, 'includeSecret' | 'limit' | 'offset'> &
    Partial<Pick<ListGistsOptions, 'ownerLogin' | 'publicOnly' | 'starredOnly' | 'searchContent'>>,
): ListGistsOptions {
  return {
    ...base,
    direction: parseSortDirection(searchParams.get('direction')),
    query: searchParams.get('q') ?? searchParams.get('query'),
    since: searchParams.get('since'),
    sort: parseSort(searchParams.get('sort')),
    starredOnly: base.starredOnly || parseStarredOnly(searchParams.get('starred')),
    visibility: parseVisibility(searchParams.get('type') ?? searchParams.get('visibility')),
  }
}

function paginationHeaders(total: number, pagination: ReturnType<typeof parsePagination>): Record<string, string> {
  return {
    'x-page': String(pagination.page),
    'x-per-page': String(pagination.perPage),
    'x-total-count': String(total),
    'x-total-pages': String(Math.max(1, Math.ceil(total / pagination.perPage))),
  }
}

function parseVisibility(value: string | null): ListGistsOptions['visibility'] {
  if (value === 'public' || value === 'secret') return value
  return null
}

function parseStarredOnly(value: string | null): boolean {
  return value === 'true' || value === '1' || value === 'starred'
}

function parseSort(value: string | null): NonNullable<ListGistsOptions['sort']> {
  if (value === 'created' || value === 'starred') return value
  return 'updated'
}

function parseSortDirection(value: string | null): NonNullable<ListGistsOptions['direction']> {
  return value === 'asc' ? 'asc' : 'desc'
}

function requireOwnerPath(c: AppContext) {
  if (pathParam(c, 'owner') !== c.get('config').ownerUsername) throw notFound()
}

function pathParam(c: AppContext, name: string): string {
  const value = c.req.param(name) ?? ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function requireExistingGist(c: AppContext, includeContent = true) {
  const gist = await getRepository(c).getGist(requiredParam(c, 'gistId'), includeContent)
  if (!gist) throw notFound()
  return gist
}

async function requireReadableGist(c: AppContext, includeContent = true) {
  const gist = await requireExistingGist(c, includeContent)
  if (!canReadGist(gist, c.get('isOwner'))) throw notFound()
  return gist
}

async function requireExistingVersion(
  c: AppContext,
  gistId: string,
  sha: string,
  includeContent = true,
  includeChanges = true,
) {
  const version = await getRepository(c).getVersion(gistId, sha, includeContent, includeChanges)
  if (!version) throw notFound()
  return version
}

async function readJsonObject(request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {
  const payload = await request.json().catch(() => {
    throw badRequest('Invalid JSON')
  })
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('JSON body must be an object')
  }
  return payload as Record<string, unknown>
}

function requiredParam(c: AppContext, name: string): string {
  const value = c.req.param(name)
  if (!value) throw notFound()
  return value
}
