import type {
  AdminStatus,
  CloudflareSettings,
  CloudflareSettingsInput,
  CloudflareUsage,
  ClearHistoryResult,
  EdgeGistExportPayload,
  GistDetail,
  GistSummary,
  ImportResult,
} from './types'

const defaultGistListPerPage = 10

export type ListGistsInput = {
  page?: number
  perPage?: number
  query?: string
  sortKey?: string
  starFilter?: string
  typeFilter?: string
}

export type GistListResult = {
  items: GistSummary[]
  page: number
  perPage: number
  total: number
  totalPages: number
}

export type GistFileUpdateInput = {
  filename?: string
  content?: string
} | null

export type SaveGistInput = {
  description?: string
  visibility?: 'public' | 'secret'
  public?: boolean
  files: Record<string, GistFileUpdateInput>
}

export class ApiClient {
  constructor(
    private readonly authorization = '',
    private readonly ownerLogin = '',
  ) {}

  async status(): Promise<AdminStatus> {
    return this.request(`${this.adminApiBase()}/status`)
  }

  async signIn(turnstileToken?: string, remember = false): Promise<AdminStatus> {
    return this.request(`${this.adminApiBase()}/session`, {
      method: 'POST',
      headers: {
        ...(turnstileToken ? { 'x-edgegist-turnstile-token': turnstileToken } : {}),
        'x-edgegist-remember-session': remember ? 'true' : 'false',
      },
    })
  }

  async signOut(): Promise<void> {
    await this.request(`${this.adminApiBase()}/session`, { method: 'DELETE' })
  }

  async listGists(input: ListGistsInput = {}): Promise<GistListResult> {
    const params = new URLSearchParams()
    params.set('page', String(input.page ?? 1))
    params.set('per_page', String(input.perPage ?? defaultGistListPerPage))
    const query = input.query?.trim()
    if (query) params.set('q', query)
    if (input.typeFilter && input.typeFilter !== 'all') params.set('type', input.typeFilter)
    if (input.starFilter === 'starred') params.set('starred', 'true')
    const [sort = 'updated', direction = 'desc'] = (input.sortKey ?? 'updated-desc').split('-')
    params.set('sort', sort)
    params.set('direction', direction === 'asc' ? 'asc' : 'desc')

    const response = await this.requestResponse<GistSummary[]>(
      `/users/${encodeURIComponent(this.requiredOwnerLogin())}/gists?${params.toString()}`,
    )
    const total = parseResponseInteger(response.headers.get('x-total-count'), response.payload.length)
    const page = parseResponseInteger(response.headers.get('x-page'), input.page ?? 1)
    const perPage = parseResponseInteger(response.headers.get('x-per-page'), input.perPage ?? defaultGistListPerPage)
    return {
      items: response.payload,
      page,
      perPage,
      total,
      totalPages: parseResponseInteger(
        response.headers.get('x-total-pages'),
        Math.max(1, Math.ceil(total / Math.max(1, perPage))),
      ),
    }
  }

  async getGist(id: string): Promise<GistDetail> {
    return this.request(`/gists/${encodeURIComponent(id)}`)
  }

  async getVersion(gistId: string, sha: string): Promise<GistDetail> {
    return this.request(`/gists/${encodeURIComponent(gistId)}/${encodeURIComponent(sha)}`)
  }

  async createGist(input: SaveGistInput): Promise<GistDetail> {
    return this.request('/gists', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async updateGist(id: string, input: SaveGistInput): Promise<GistDetail | null> {
    return this.request(`/gists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  async deleteGist(id: string): Promise<void> {
    await this.request(`/gists/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async setGistStarred(id: string, starred: boolean): Promise<void> {
    await this.request(`/gists/${encodeURIComponent(id)}/star`, {
      method: starred ? 'PUT' : 'DELETE',
    })
  }

  async cloudflareSettings(): Promise<CloudflareSettings> {
    return this.request(`${this.adminApiBase()}/cloudflare/settings`)
  }

  async saveCloudflareSettings(settings: CloudflareSettingsInput): Promise<CloudflareSettings> {
    return this.request(`${this.adminApiBase()}/cloudflare/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }

  async cloudflareUsage(refresh = false): Promise<CloudflareUsage | null> {
    return this.request(`${this.adminApiBase()}/cloudflare/usage?refresh=${refresh ? 'true' : 'false'}`)
  }

  async exportData(includeHistory: boolean): Promise<EdgeGistExportPayload> {
    return this.request(`${this.adminApiBase()}/export?includeHistory=${includeHistory ? 'true' : 'false'}`)
  }

  async importData(payload: EdgeGistExportPayload, includeHistory: boolean): Promise<ImportResult> {
    return this.request(`${this.adminApiBase()}/import?includeHistory=${includeHistory ? 'true' : 'false'}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async clearHistory(): Promise<ClearHistoryResult> {
    return this.request(`${this.adminApiBase()}/history`, { method: 'DELETE' })
  }

  private adminApiBase(): string {
    return `/${encodeURIComponent(this.requiredOwnerLogin())}/_edgegist/api`
  }

  private requiredOwnerLogin(): string {
    if (!this.ownerLogin) throw new Error('Owner route is required')
    return this.ownerLogin
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await this.requestResponse<T>(path, init)).payload
  }

  private async requestResponse<T>(path: string, init: RequestInit = {}): Promise<{ payload: T; headers: Headers }> {
    const headers = new Headers(init.headers)
    if (this.authorization) headers.set('authorization', this.authorization)
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')

    const response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers,
    })

    if (response.status === 204) {
      return {
        headers: response.headers,
        payload: undefined as T,
      }
    }

    const text = await response.text()
    const payload = text ? JSON.parse(text) : null

    if (!response.ok) {
      const message = payload?.message ?? `Request failed with ${response.status}`
      throw new Error(message)
    }

    return {
      headers: response.headers,
      payload: payload as T,
    }
  }
}

function parseResponseInteger(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
