import type { EdgeGistConfig } from '../env'

export function emptyForks(): unknown[] {
  return []
}

export function emptyComments(): unknown[] {
  return []
}

type MockSocialOptions = {
  apiPrefix?: string
  lite?: boolean
}

export function mockForkResponse(
  gistId: string,
  config: EdgeGistConfig,
  options: MockSocialOptions = {},
): Record<string, unknown> {
  const response = {
    id: gistId,
    url: `${apiBasePath(config.baseUrl, options.apiPrefix)}/gists/${gistId}`,
    public: false,
    comments: 0,
    mocked: true,
  }
  if (options.lite) return response
  return {
    ...response,
    owner: {
      login: config.ownerUsername,
    },
    forks: [],
  }
}

export function mockCommentResponse(
  config: EdgeGistConfig,
  options: MockSocialOptions = {},
): Record<string, unknown> {
  const response = {
    id: 0,
    node_id: 'EG_COMMENT_MOCK',
    url: `${apiBasePath(config.baseUrl, options.apiPrefix)}/gists/comments/0`,
    body: '',
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    mocked: true,
  }
  if (options.lite) return response
  return {
    ...response,
    user: {
      login: config.ownerUsername,
    },
  }
}

function apiBasePath(base: string, prefix?: string): string {
  if (!prefix) return base
  return `${base}${prefix.startsWith('/') ? prefix : `/${prefix}`}`.replace(/\/+$/, '')
}
