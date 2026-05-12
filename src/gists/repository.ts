import type { D1DatabaseLike, D1PreparedStatement } from '../env'
import type {
  ChangeStatus,
  CreateGistInput,
  GistFileRecord,
  GistRecord,
  GistVersionCommitRecord,
  GistRepository,
  GistVersionRetentionRecord,
  GistVersionFileChange,
  GistVersionRecord,
  GistVisibility,
  ListGistsOptions,
  UpdateGistInput,
} from './types'

type GistRow = {
  id: string
  owner_login: string
  description: string
  visibility: GistVisibility
  starred_at: string | null
  created_at: string
  updated_at: string
}

type GistFileRow = {
  filename: string
  content: string
  type: string | null
  language: string | null
  size: number
  truncated: number
  created_at: string
  updated_at: string
}

type VersionRow = {
  id: string
  gist_id: string
  sha: string
  version_index: number
  description: string
  committed_at: string
  change_status_total: number
  change_status_additions: number
  change_status_deletions: number
}

type VersionFileRow = {
  filename: string
  content: string
  type: string | null
  language: string | null
  size: number
  truncated: number
}

type VersionFileWithVersionIdRow = VersionFileRow & {
  version_id: string
}

type VersionFileChangeRow = {
  filename: string
  previous_filename: string | null
  status: GistVersionFileChange['status']
  additions: number
  deletions: number
}

type VersionFileChangeWithVersionIdRow = VersionFileChangeRow & {
  version_id: string
}

type VersionIdRow = {
  id: string
}

const maxD1BoundParameters = 100

export class D1GistRepository implements GistRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async createGist(input: CreateGistInput): Promise<GistRecord> {
    const gist: GistRecord = {
      id: createId(20),
      ownerLogin: input.ownerLogin,
      description: input.description,
      visibility: input.visibility,
      starredAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      files: orderFilesByCreatedAt(
        input.files.map((file) => normalizeFile(file.filename, file.content, input.now, file)),
      ),
    }

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO gists (id, owner_login, description, visibility, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          gist.id,
          gist.ownerLogin,
          gist.description,
          gist.visibility,
          gist.createdAt,
          gist.updatedAt,
        ),
      ...this.insertFileStatements(gist.id, gist.files),
    ])

    return gist
  }

  async getGist(id: string, includeContent = true): Promise<GistRecord | null> {
    const gist = await this.db
      .prepare(
        `SELECT id, owner_login, description, visibility, starred_at, created_at, updated_at
         FROM gists
         WHERE id = ?`,
      )
      .bind(id)
      .first<GistRow>()

    if (!gist) return null
    return this.hydrateGist(gist, includeContent)
  }

  async listGists(options: ListGistsOptions, includeContent = true): Promise<GistRecord[]> {
    const filter = buildGistListFilter(options)
    const args = [...filter.args, options.limit, options.offset]

    const query = `
      SELECT id, owner_login, description, visibility, starred_at, created_at, updated_at
      FROM gists
      ${filter.whereSql}
      ${gistListOrderBy(options)}
      LIMIT ? OFFSET ?
    `

    const rows = await this.db.prepare(query).bind(...args).all<GistRow>()
    return Promise.all((rows.results ?? []).map((row) => this.hydrateGist(row, includeContent)))
  }

  async countGists(options: ListGistsOptions): Promise<number> {
    const filter = buildGistListFilter(options)
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM gists
         ${filter.whereSql}`,
      )
      .bind(...filter.args)
      .first<{ count: number }>()

    return Number(row?.count ?? 0)
  }

  async updateGist(id: string, input: UpdateGistInput, existingGist?: GistRecord): Promise<GistRecord | null> {
    if (existingGist && existingGist.id !== id) return null

    const existing = existingGist ?? await this.getGist(id)
    if (!existing) return null

    const nextFiles = applyFileUpdates(existing.files, input.files ?? [], input.now)
    const description = input.description ?? existing.description
    const visibility = input.visibility ?? existing.visibility

    await this.db.batch([
      this.db
        .prepare(
          `UPDATE gists
           SET description = ?, visibility = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(description, visibility, input.now, id),
      this.db.prepare('DELETE FROM gist_files WHERE gist_id = ?').bind(id),
      ...this.insertFileStatements(id, nextFiles),
    ])

    return {
      ...existing,
      description,
      visibility,
      updatedAt: input.now,
      files: nextFiles,
    }
  }

  async deleteGist(id: string): Promise<boolean> {
    const existing = await this.getGist(id)
    if (!existing) return false
    await this.db.prepare('DELETE FROM gists WHERE id = ?').bind(id).run()
    return true
  }

  async setGistStarred(id: string, starredAt: string | null, includeContent = true): Promise<GistRecord | null> {
    const existing = await this.getGist(id, includeContent)
    if (!existing) return null

    await this.db
      .prepare('UPDATE gists SET starred_at = ? WHERE id = ?')
      .bind(starredAt, id)
      .run()

    return {
      ...existing,
      starredAt,
    }
  }

  async createVersion(
    gist: GistRecord,
    changeStatus: ChangeStatus,
    changes: GistVersionFileChange[],
  ): Promise<GistVersionRecord> {
    const current = await this.db
      .prepare('SELECT COUNT(*) AS count FROM gist_versions WHERE gist_id = ?')
      .bind(gist.id)
      .first<{ count: number }>()

    const version: GistVersionRecord = {
      id: createId(20),
      gistId: gist.id,
      sha: createId(40),
      versionIndex: Number(current?.count ?? 0) + 1,
      description: gist.description,
      committedAt: gist.updatedAt,
      changeStatus,
      files: gist.files,
      changes,
    }

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO gist_versions (
             id, gist_id, sha, version_index, description, committed_at,
             change_status_total, change_status_additions, change_status_deletions
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          version.id,
          version.gistId,
          version.sha,
          version.versionIndex,
          version.description,
          version.committedAt,
          version.changeStatus.total,
          version.changeStatus.additions,
          version.changeStatus.deletions,
        ),
      ...this.insertVersionFileStatements(version.id, version.files),
      ...this.insertVersionChangeStatements(version.id, version.changes),
    ])

    return version
  }

  async listVersions(gistId: string, includeContent = true): Promise<GistVersionRecord[]> {
    const contentSelection = includeContent ? 'content' : "'' AS content"
    const rows = await this.db
      .prepare(
        `SELECT id, gist_id, sha, version_index, description, committed_at,
                change_status_total, change_status_additions, change_status_deletions
         FROM gist_versions
         WHERE gist_id = ?
         ORDER BY committed_at DESC, version_index DESC`,
      )
      .bind(gistId)
      .all<VersionRow>()

    const versions = rows.results ?? []
    if (versions.length === 0) return []

    const [files, changes] = await Promise.all([
      this.db
        .prepare(
          `SELECT gist_version_files.version_id, filename, ${contentSelection}, type, language, size, truncated
           FROM gist_version_files
           INNER JOIN gist_versions ON gist_versions.id = gist_version_files.version_id
           WHERE gist_versions.gist_id = ?
           ORDER BY filename ASC`,
        )
        .bind(gistId)
        .all<VersionFileWithVersionIdRow>(),
      this.listVersionChanges(gistId),
    ])

    const filesByVersionId = groupRowsByVersionId(files.results ?? [])
    const changesByVersionId = groupRowsByVersionId(changes)

    return versions.map((row) => ({
      ...versionBaseFromRow(row),
      files: (filesByVersionId.get(row.id) ?? []).map((file) => versionFileFromRow(file, row.committed_at)),
      changes: (changesByVersionId.get(row.id) ?? []).map(versionFileChangeFromRow),
    }))
  }

  async listVersionCommits(gistId: string): Promise<GistVersionCommitRecord[]> {
    return this.listVersionsWithChanges(gistId)
  }

  async listVersionsForRetention(gistId: string): Promise<GistVersionRetentionRecord[]> {
    return this.listVersionsWithChanges(gistId)
  }

  private async listVersionsWithChanges(gistId: string): Promise<GistVersionRetentionRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT id, gist_id, sha, version_index, description, committed_at,
                change_status_total, change_status_additions, change_status_deletions
         FROM gist_versions
         WHERE gist_id = ?
         ORDER BY committed_at DESC, version_index DESC`,
      )
      .bind(gistId)
      .all<VersionRow>()

    const versions = rows.results ?? []
    if (versions.length === 0) return []

    const changesByVersionId = groupRowsByVersionId(await this.listVersionChanges(gistId))
    return versions.map((row) => ({
      ...versionBaseFromRow(row),
      changes: (changesByVersionId.get(row.id) ?? []).map(versionFileChangeFromRow),
    }))
  }

  async getVersion(
    gistId: string,
    sha: string,
    includeContent = true,
    includeChanges = true,
  ): Promise<GistVersionRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, gist_id, sha, version_index, description, committed_at,
                change_status_total, change_status_additions, change_status_deletions
         FROM gist_versions
         WHERE gist_id = ? AND sha = ?`,
      )
      .bind(gistId, sha)
      .first<VersionRow>()

    if (!row) return null
    return this.hydrateVersion(row, includeContent, includeChanges)
  }

  async pruneVersions(gistId: string, keepVersionIds: string[]): Promise<void> {
    const allVersions = await this.db
      .prepare(
        `SELECT id
         FROM gist_versions
         WHERE gist_id = ?`,
      )
      .bind(gistId)
      .all<VersionIdRow>()
    const keep = new Set(keepVersionIds)
    const toDelete = (allVersions.results ?? []).filter((version) => !keep.has(version.id))
    if (toDelete.length === 0) return

    await this.db.batch(this.deleteVersionStatements(gistId, toDelete.map((version) => version.id)))
  }

  private async listVersionChanges(gistId: string): Promise<VersionFileChangeWithVersionIdRow[]> {
    const changes = await this.db
      .prepare(
        `SELECT gist_version_changes.version_id, filename, previous_filename, status, additions, deletions
         FROM gist_version_changes
         INNER JOIN gist_versions ON gist_versions.id = gist_version_changes.version_id
         WHERE gist_versions.gist_id = ?
         ORDER BY filename ASC`,
      )
      .bind(gistId)
      .all<VersionFileChangeWithVersionIdRow>()

    return changes.results ?? []
  }

  private deleteVersionStatements(gistId: string, versionIds: string[]): D1PreparedStatement[] {
    return chunkByBoundParameterLimit(versionIds, 1, 1).map((chunk) => {
      const placeholders = chunk.map(() => '?').join(', ')
      return this.db
        .prepare(`DELETE FROM gist_versions WHERE gist_id = ? AND id IN (${placeholders})`)
        .bind(gistId, ...chunk)
    })
  }

  private insertFileStatements(gistId: string, files: GistFileRecord[]): D1PreparedStatement[] {
    return chunkByBoundParameterLimit(files, 9).map((chunk) => {
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
      const values = chunk.flatMap((file) => [
        gistId,
        file.filename,
        file.content,
        file.type,
        file.language,
        file.size,
        file.truncated ? 1 : 0,
        file.createdAt,
        file.updatedAt,
      ])
      return this.db
        .prepare(
          `INSERT INTO gist_files (
             gist_id, filename, content, type, language, size, truncated, created_at, updated_at
           )
           VALUES ${placeholders}`,
        )
        .bind(...values)
    })
  }

  private insertVersionFileStatements(versionId: string, files: GistFileRecord[]): D1PreparedStatement[] {
    return chunkByBoundParameterLimit(files, 7).map((chunk) => {
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')
      const values = chunk.flatMap((file) => [
        versionId,
        file.filename,
        file.content,
        file.type,
        file.language,
        file.size,
        file.truncated ? 1 : 0,
      ])
      return this.db
        .prepare(
          `INSERT INTO gist_version_files (
             version_id, filename, content, type, language, size, truncated
           )
           VALUES ${placeholders}`,
        )
        .bind(...values)
    })
  }

  private insertVersionChangeStatements(
    versionId: string,
    changes: GistVersionFileChange[],
  ): D1PreparedStatement[] {
    return chunkByBoundParameterLimit(changes, 6).map((chunk) => {
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
      const values = chunk.flatMap((change) => [
        versionId,
        change.filename,
        change.previousFilename ?? null,
        change.status,
        change.additions,
        change.deletions,
      ])
      return this.db
        .prepare(
          `INSERT INTO gist_version_changes (
             version_id, filename, previous_filename, status, additions, deletions
           )
           VALUES ${placeholders}`,
        )
        .bind(...values)
    })
  }

  private async hydrateGist(row: GistRow, includeContent = true): Promise<GistRecord> {
    const contentSelection = includeContent ? 'content' : "'' AS content"
    const files = await this.db
      .prepare(
        `SELECT filename, ${contentSelection}, type, language, size, truncated, created_at, updated_at
         FROM gist_files
         WHERE gist_id = ?
         ORDER BY created_at DESC, filename ASC`,
      )
      .bind(row.id)
      .all<GistFileRow>()

    return {
      id: row.id,
      ownerLogin: row.owner_login,
      description: row.description,
      visibility: row.visibility,
      starredAt: row.starred_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      files: (files.results ?? []).map(fileFromRow),
    }
  }

  private async hydrateVersion(
    row: VersionRow,
    includeContent = true,
    includeChanges = true,
  ): Promise<GistVersionRecord> {
    const contentSelection = includeContent ? 'content' : "'' AS content"
    const files = await this.db
      .prepare(
        `SELECT filename, ${contentSelection}, type, language, size, truncated
         FROM gist_version_files
         WHERE version_id = ?
         ORDER BY filename ASC`,
      )
      .bind(row.id)
      .all<VersionFileRow>()

    const changes = includeChanges
      ? await this.db
        .prepare(
          `SELECT filename, previous_filename, status, additions, deletions
           FROM gist_version_changes
           WHERE version_id = ?
           ORDER BY filename ASC`,
        )
        .bind(row.id)
        .all<VersionFileChangeRow>()
      : { results: [] }

    return {
      id: row.id,
      gistId: row.gist_id,
      sha: row.sha,
      versionIndex: row.version_index,
      description: row.description,
      committedAt: row.committed_at,
      changeStatus: {
        total: row.change_status_total,
        additions: row.change_status_additions,
        deletions: row.change_status_deletions,
      },
      files: (files.results ?? []).map((file) => ({
        filename: file.filename,
        content: file.content,
        type: file.type,
        language: file.language,
        size: file.size,
        truncated: file.truncated === 1,
        createdAt: row.committed_at,
        updatedAt: row.committed_at,
      })),
      changes: (changes.results ?? []).map(versionFileChangeFromRow),
    }
  }
}

function buildGistListFilter(options: ListGistsOptions): { whereSql: string; args: unknown[] } {
  const where: string[] = []
  const args: unknown[] = []

  if (options.ownerLogin) {
    where.push('owner_login = ?')
    args.push(options.ownerLogin)
  }

  if (options.publicOnly) {
    where.push("visibility = 'public'")
  } else if (!options.includeSecret) {
    where.push("visibility = 'public'")
  }

  if (options.visibility) {
    where.push('visibility = ?')
    args.push(options.visibility)
  }

  if (options.since) {
    where.push('updated_at >= ?')
    args.push(options.since)
  }

  if (options.starredOnly) {
    where.push('starred_at IS NOT NULL')
  }

  const query = options.query?.trim()
  if (query) {
    const pattern = `%${escapeLikePattern(query)}%`
    const fileSearchConditions = [`gist_files.filename LIKE ? ESCAPE '\\'`]
    const fileSearchArgs = [pattern]
    if (options.searchContent !== false) {
      fileSearchConditions.push(`gist_files.content LIKE ? ESCAPE '\\'`)
      fileSearchArgs.push(pattern)
    }
    where.push(`(
      gists.id LIKE ? ESCAPE '\\'
      OR gists.description LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM gist_files
        WHERE gist_files.gist_id = gists.id
          AND (
            ${fileSearchConditions.join('\n            OR ')}
          )
      )
    )`)
    args.push(pattern, pattern, ...fileSearchArgs)
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    args,
  }
}

function gistListOrderBy(options: ListGistsOptions): string {
  const direction = options.direction === 'asc' ? 'ASC' : 'DESC'
  const stableDirection = direction

  if (options.sort === 'created') {
    return `ORDER BY created_at ${direction}, id ${stableDirection}`
  }

  if (options.sort === 'starred') {
    return `ORDER BY starred_at IS NULL ASC, starred_at ${direction}, updated_at DESC, id DESC`
  }

  return `ORDER BY updated_at ${direction}, id ${stableDirection}`
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function normalizeFile(
  filename: string,
  content: string,
  now: string,
  metadata: { type?: string | null; language?: string | null },
): GistFileRecord {
  return {
    filename,
    content,
    type: metadata.type ?? inferMimeType(filename),
    language: metadata.language ?? inferLanguage(filename),
    size: new TextEncoder().encode(content).length,
    truncated: false,
    createdAt: now,
    updatedAt: now,
  }
}

function fileFromRow(row: GistFileRow): GistFileRecord {
  return {
    filename: row.filename,
    content: row.content,
    type: row.type,
    language: row.language,
    size: row.size,
    truncated: row.truncated === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function versionBaseFromRow(row: VersionRow): Omit<GistVersionRecord, 'files' | 'changes'> {
  return {
    id: row.id,
    gistId: row.gist_id,
    sha: row.sha,
    versionIndex: row.version_index,
    description: row.description,
    committedAt: row.committed_at,
    changeStatus: {
      total: row.change_status_total,
      additions: row.change_status_additions,
      deletions: row.change_status_deletions,
    },
  }
}

function versionFileFromRow(row: VersionFileRow, committedAt: string): GistFileRecord {
  return {
    filename: row.filename,
    content: row.content,
    type: row.type,
    language: row.language,
    size: row.size,
    truncated: row.truncated === 1,
    createdAt: committedAt,
    updatedAt: committedAt,
  }
}

function versionFileChangeFromRow(row: VersionFileChangeRow): GistVersionFileChange {
  return {
    filename: row.filename,
    previousFilename: row.previous_filename,
    status: row.status,
    additions: row.additions,
    deletions: row.deletions,
  }
}

function groupRowsByVersionId<T extends { version_id: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(row.version_id)
    if (group) {
      group.push(row)
    } else {
      groups.set(row.version_id, [row])
    }
  }
  return groups
}

function applyFileUpdates(
  currentFiles: GistFileRecord[],
  updates: UpdateGistInput['files'],
  now: string,
): GistFileRecord[] {
  const currentFileByName = new Map(currentFiles.map((file) => [file.filename, file]))
  const deletedOriginalFilenames = new Set<string>()
  const replacementsByOriginalFilename = new Map<string, GistFileRecord>()
  const newFiles: GistFileRecord[] = []

  for (const update of updates ?? []) {
    const existing = currentFileByName.get(update.previousFilename)
    if (update.delete) {
      deletedOriginalFilenames.add(update.previousFilename)
      continue
    }

    if (!existing && update.content === undefined) continue
    const filename = update.filename
    const content = update.content ?? existing?.content ?? ''
    const next = normalizeFile(filename, content, now, {
      type: update.type ?? existing?.type ?? undefined,
      language: update.language ?? existing?.language ?? undefined,
    })

    const file = {
      ...next,
      createdAt: existing?.createdAt ?? now,
    }

    if (existing) {
      replacementsByOriginalFilename.set(update.previousFilename, file)
    } else {
      newFiles.push(file)
    }
  }

  const existingFiles = currentFiles.flatMap((file) => {
    if (deletedOriginalFilenames.has(file.filename)) return []
    return [replacementsByOriginalFilename.get(file.filename) ?? file]
  })

  return orderFilesByCreatedAt([...newFiles, ...existingFiles])
}

function orderFilesByCreatedAt(files: GistFileRecord[]): GistFileRecord[] {
  return [...files].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || left.filename.localeCompare(right.filename),
  )
}

function chunkByBoundParameterLimit<T>(items: T[], parametersPerItem: number, reservedParameters = 0): T[][] {
  const chunkSize = Math.max(1, Math.floor((maxD1BoundParameters - reservedParameters) / parametersPerItem))
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

function inferMimeType(filename: string): string {
  if (filename.endsWith('.json')) return 'application/json'
  if (filename.endsWith('.md')) return 'text/markdown'
  if (filename.endsWith('.html')) return 'text/html'
  if (filename.endsWith('.js') || filename.endsWith('.ts')) return 'application/javascript'
  return 'text/plain'
}

function inferLanguage(filename: string): string | null {
  const extension = filename.split('.').pop()?.toLowerCase()
  const languages: Record<string, string> = {
    js: 'JavaScript',
    ts: 'TypeScript',
    json: 'JSON',
    md: 'Markdown',
    yaml: 'YAML',
    yml: 'YAML',
    html: 'HTML',
    css: 'CSS',
    txt: 'Text',
  }
  return extension ? languages[extension] ?? null : null
}

function createId(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}
