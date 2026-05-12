export type GistVisibility = 'public' | 'secret'

export type GistFileRecord = {
  filename: string
  content: string
  type: string | null
  language: string | null
  size: number
  truncated: boolean
  createdAt: string
  updatedAt: string
}

export type ChangeStatus = {
  total: number
  additions: number
  deletions: number
}

export type GistVersionFileChange = {
  filename: string
  previousFilename?: string | null
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
}

export type GistRecord = {
  id: string
  ownerLogin: string
  description: string
  visibility: GistVisibility
  starredAt: string | null
  createdAt: string
  updatedAt: string
  files: GistFileRecord[]
}

export type GistVersionRecord = {
  id: string
  gistId: string
  sha: string
  versionIndex: number
  description: string
  committedAt: string
  changeStatus: ChangeStatus
  files: GistFileRecord[]
  changes: GistVersionFileChange[]
}

export type GistVersionRetentionRecord = Omit<GistVersionRecord, 'files'>
export type GistVersionCommitRecord = GistVersionRetentionRecord

export type CreateGistInput = {
  ownerLogin: string
  description: string
  visibility: GistVisibility
  files: Array<{
    filename: string
    content: string
    type?: string | null
    language?: string | null
  }>
  now: string
}

export type UpdateGistInput = {
  description?: string
  visibility?: GistVisibility
  files?: Array<{
    previousFilename: string
    filename: string
    content?: string
    delete?: boolean
    type?: string | null
    language?: string | null
  }>
  now: string
}

export type ListGistsOptions = {
  ownerLogin?: string
  includeSecret: boolean
  publicOnly?: boolean
  starredOnly?: boolean
  since?: string | null
  query?: string | null
  searchContent?: boolean
  visibility?: Extract<GistVisibility, 'public' | 'secret'> | null
  sort?: 'updated' | 'created' | 'starred'
  direction?: 'asc' | 'desc'
  limit: number
  offset: number
}

export type GistRepository = {
  createGist(input: CreateGistInput): Promise<GistRecord>
  getGist(id: string, includeContent?: boolean): Promise<GistRecord | null>
  listGists(options: ListGistsOptions, includeContent?: boolean): Promise<GistRecord[]>
  countGists(options: ListGistsOptions): Promise<number>
  updateGist(id: string, input: UpdateGistInput, existing?: GistRecord): Promise<GistRecord | null>
  deleteGist(id: string): Promise<boolean>
  setGistStarred(id: string, starredAt: string | null, includeContent?: boolean): Promise<GistRecord | null>
  createVersion(
    gist: GistRecord,
    changeStatus: ChangeStatus,
    changes: GistVersionFileChange[],
  ): Promise<GistVersionRecord>
  listVersions(gistId: string, includeContent?: boolean): Promise<GistVersionRecord[]>
  listVersionCommits(gistId: string): Promise<GistVersionCommitRecord[]>
  listVersionsForRetention(gistId: string): Promise<GistVersionRetentionRecord[]>
  getVersion(
    gistId: string,
    sha: string,
    includeContent?: boolean,
    includeChanges?: boolean,
  ): Promise<GistVersionRecord | null>
  pruneVersions(gistId: string, keepVersionIds: string[]): Promise<void>
}

export type CreateGistRequest = {
  description?: unknown
  public?: unknown
  visibility?: unknown
  files?: unknown
}

export type UpdateGistRequest = {
  description?: unknown
  public?: unknown
  visibility?: unknown
  files?: unknown
}
