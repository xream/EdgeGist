import type { D1DatabaseLike } from '../env'
import { filenameHasPathSeparator } from '../filenames'
import { badRequest } from '../http/errors'
import { D1GistRepository } from '../gists/repository'
import type {
  GistFileRecord,
  GistRecord,
  GistVersionFileChange,
  GistVersionRecord,
  GistVisibility,
} from '../gists/types'

export type EdgeGistExportFile = {
  filename: string
  content: string
  type: string | null
  language: string | null
  size: number
  truncated: boolean
  createdAt: string
  updatedAt: string
}

export type EdgeGistExportVersion = {
  id: string
  sha: string
  versionIndex: number
  description: string
  committedAt: string
  changeStatus: {
    total: number
    additions: number
    deletions: number
  }
  files: EdgeGistExportFile[]
  changes: GistVersionFileChange[]
}

export type EdgeGistExportGist = {
  id: string
  ownerLogin: string
  description: string
  visibility: GistVisibility
  starredAt: string | null
  createdAt: string
  updatedAt: string
  files: EdgeGistExportFile[]
  versions?: EdgeGistExportVersion[]
}

export type EdgeGistExportSetting = {
  key: string
  value: string
  updatedAt: string
}

export type EdgeGistExportPayload = {
  format: 'edgegist.export.v1'
  exportedAt: string
  includeHistory: boolean
  settings?: EdgeGistExportSetting[]
  gists: EdgeGistExportGist[]
}

type SettingRow = {
  key: string
  value: string
  updated_at: string
}

const exportGistsPageSize = 1000

export async function exportEdgeGistData(
  db: D1DatabaseLike,
  ownerUsername: string,
  includeHistory: boolean,
): Promise<EdgeGistExportPayload> {
  const repository = new D1GistRepository(db)
  const gists = await listAllOwnerGists(repository, ownerUsername)

  return {
    format: 'edgegist.export.v1',
    exportedAt: new Date().toISOString(),
    includeHistory,
    settings: await exportSettings(db),
    gists: await Promise.all(
      gists.map(async (gist) => ({
        id: gist.id,
        ownerLogin: gist.ownerLogin,
        description: gist.description,
        visibility: gist.visibility,
        starredAt: gist.starredAt,
        createdAt: gist.createdAt,
        updatedAt: gist.updatedAt,
        files: gist.files.map(exportFile),
        versions: includeHistory
          ? (await repository.listVersions(gist.id)).map(exportVersion)
          : undefined,
      })),
    ),
  }
}

async function listAllOwnerGists(
  repository: D1GistRepository,
  ownerUsername: string,
): Promise<GistRecord[]> {
  const gists: GistRecord[] = []

  for (let offset = 0; ; offset += exportGistsPageSize) {
    const page = await repository.listGists({
      ownerLogin: ownerUsername,
      includeSecret: true,
      limit: exportGistsPageSize,
      offset,
    })
    gists.push(...page)
    if (page.length < exportGistsPageSize) return gists
  }
}

export async function importEdgeGistData(
  db: D1DatabaseLike,
  payload: unknown,
  options: { includeHistory: boolean; fallbackOwnerLogin: string },
): Promise<{ gistCount: number; settingCount: number; versionCount: number }> {
  const data = parseExportPayload(payload)
  const now = new Date().toISOString()
  const hasSettings = Array.isArray(data.settings)
  const statements = [
    db.prepare('DELETE FROM gist_version_changes'),
    db.prepare('DELETE FROM gist_version_files'),
    db.prepare('DELETE FROM gist_versions'),
    db.prepare('DELETE FROM gist_files'),
    db.prepare('DELETE FROM gists'),
  ]
  if (hasSettings) statements.push(db.prepare('DELETE FROM settings'))

  let versionCount = 0

  for (const gist of data.gists) {
    const ownerLogin = options.fallbackOwnerLogin
    statements.push(
      db
        .prepare(
          `INSERT INTO gists (id, owner_login, description, visibility, starred_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          gist.id,
          ownerLogin,
          gist.description,
          gist.visibility,
          gist.starredAt ?? null,
          gist.createdAt || now,
          gist.updatedAt || now,
        ),
    )

    for (const file of gist.files) {
      statements.push(insertGistFile(db, gist.id, normalizeImportedFile(file, now)))
    }

    if (!options.includeHistory) continue

    for (const version of gist.versions ?? []) {
      versionCount += 1
      statements.push(
        db
          .prepare(
            `INSERT INTO gist_versions (
               id, gist_id, sha, version_index, description, committed_at,
               change_status_total, change_status_additions, change_status_deletions
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            version.id,
            gist.id,
            version.sha,
            version.versionIndex,
            version.description,
            version.committedAt,
            version.changeStatus.total,
            version.changeStatus.additions,
            version.changeStatus.deletions,
          ),
      )

      for (const file of version.files) {
        const normalized = normalizeImportedFile(file, version.committedAt)
        statements.push(
          db
            .prepare(
              `INSERT INTO gist_version_files (
                 version_id, filename, content, type, language, size, truncated
               )
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              version.id,
              normalized.filename,
              normalized.content,
              normalized.type,
              normalized.language,
              normalized.size,
              normalized.truncated ? 1 : 0,
            ),
        )
      }

      for (const change of version.changes) {
        statements.push(
          db
            .prepare(
              `INSERT INTO gist_version_changes (
                 version_id, filename, previous_filename, status, additions, deletions
               )
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              version.id,
              change.filename,
              change.previousFilename ?? null,
              change.status,
              change.additions,
              change.deletions,
            ),
        )
      }
    }
  }

  for (const setting of hasSettings ? data.settings ?? [] : []) {
    statements.push(
      db
        .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
        .bind(setting.key, setting.value, setting.updatedAt || now),
    )
  }

  await db.batch(statements)
  return { gistCount: data.gists.length, settingCount: hasSettings ? data.settings?.length ?? 0 : 0, versionCount }
}

export async function clearEdgeGistHistory(
  db: D1DatabaseLike,
): Promise<{ versionCount: number }> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM gist_versions')
    .first<{ count: number }>()

  await db.batch([
    db.prepare('DELETE FROM gist_version_changes'),
    db.prepare('DELETE FROM gist_version_files'),
    db.prepare('DELETE FROM gist_versions'),
  ])

  return { versionCount: Number(row?.count ?? 0) }
}

async function exportSettings(db: D1DatabaseLike): Promise<EdgeGistExportSetting[]> {
  const rows = await db
    .prepare('SELECT key, value, updated_at FROM settings ORDER BY key ASC')
    .all<SettingRow>()
  return (rows.results ?? []).map((row) => ({
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
  }))
}

function insertGistFile(db: D1DatabaseLike, gistId: string, file: GistFileRecord) {
  return db
    .prepare(
      `INSERT INTO gist_files (
         gist_id, filename, content, type, language, size, truncated, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      gistId,
      file.filename,
      file.content,
      file.type,
      file.language,
      file.size,
      file.truncated ? 1 : 0,
      file.createdAt,
      file.updatedAt,
    )
}

function exportVersion(version: GistVersionRecord): EdgeGistExportVersion {
  return {
    id: version.id,
    sha: version.sha,
    versionIndex: version.versionIndex,
    description: version.description,
    committedAt: version.committedAt,
    changeStatus: version.changeStatus,
    files: version.files.map(exportFile),
    changes: version.changes,
  }
}

function exportFile(file: GistFileRecord): EdgeGistExportFile {
  return {
    filename: file.filename,
    content: file.content,
    type: file.type,
    language: file.language,
    size: file.size,
    truncated: file.truncated,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  }
}

function normalizeImportedFile(file: EdgeGistExportFile, fallbackDate: string): GistFileRecord {
  return {
    filename: file.filename,
    content: file.content,
    type: file.type,
    language: file.language,
    size: file.size,
    truncated: file.truncated,
    createdAt: file.createdAt || fallbackDate,
    updatedAt: file.updatedAt || fallbackDate,
  }
}

function parseExportPayload(payload: unknown): EdgeGistExportPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('Import payload must be an EdgeGist export object')
  }

  const data = payload as Partial<EdgeGistExportPayload>
  if (data.format !== 'edgegist.export.v1') throw badRequest('Unsupported import format')
  if (typeof data.exportedAt !== 'string') throw badRequest('Import payload is missing exportedAt')
  if (typeof data.includeHistory !== 'boolean') throw badRequest('Import payload is missing includeHistory')
  if (!Array.isArray(data.gists)) throw badRequest('Import payload is missing gists')
  if (data.settings !== undefined && !Array.isArray(data.settings)) throw badRequest('Import settings must be an array')

  validateUniqueStrings(
    data.gists.map((gist) => objectStringField(gist, 'id')).filter((id): id is string => id !== null),
    'Imported gist ids must be unique',
  )
  validateUniqueStrings(
    data.gists.flatMap((gist) => objectArrayField(gist, 'versions'))
      .map((version) => objectStringField(version, 'id'))
      .filter((id): id is string => id !== null),
    'Imported version ids must be unique',
  )
  validateUniqueStrings(
    data.gists.flatMap((gist) => objectArrayField(gist, 'versions'))
      .map((version) => objectStringField(version, 'sha'))
      .filter((sha): sha is string => sha !== null),
    'Imported version shas must be unique',
  )
  for (const gist of data.gists) {
    validateGist(gist)
  }
  validateUniqueStrings(
    (data.settings ?? []).map((setting) => objectStringField(setting, 'key')).filter((key): key is string => key !== null),
    'Imported setting keys must be unique',
  )
  for (const setting of data.settings ?? []) {
    validateSetting(setting)
  }

  return data as EdgeGistExportPayload
}

function validateGist(gist: unknown): asserts gist is EdgeGistExportGist {
  if (!gist || typeof gist !== 'object' || Array.isArray(gist)) throw badRequest('Invalid gist export item')
  const item = gist as EdgeGistExportGist
  if (!item.id || typeof item.id !== 'string') throw badRequest('Imported gist is missing id')
  if (typeof item.ownerLogin !== 'string') throw badRequest(`Imported gist ${item.id} is missing ownerLogin`)
  if (typeof item.description !== 'string') throw badRequest(`Imported gist ${item.id} is missing description`)
  if (!isVisibility(item.visibility)) throw badRequest(`Invalid visibility for gist ${item.id}`)
  if (item.starredAt !== null && typeof item.starredAt !== 'string') throw badRequest(`Invalid starredAt for gist ${item.id}`)
  if (typeof item.createdAt !== 'string') throw badRequest(`Imported gist ${item.id} is missing createdAt`)
  if (typeof item.updatedAt !== 'string') throw badRequest(`Imported gist ${item.id} is missing updatedAt`)
  if (!Array.isArray(item.files)) throw badRequest(`Imported gist ${item.id} is missing files`)
  validateUniqueStrings(
    item.files.map((file) => objectStringField(file, 'filename')).filter((filename): filename is string => filename !== null),
    `Imported gist ${item.id} has duplicate filenames`,
  )
  for (const file of item.files) validateFile(file)
  if (item.versions !== undefined && !Array.isArray(item.versions)) throw badRequest(`Imported gist ${item.id} versions must be an array`)
  validateUniqueStrings(
    (item.versions ?? []).map((version) => objectStringField(version, 'id')).filter((id): id is string => id !== null),
    `Imported gist ${item.id} version ids must be unique`,
  )
  validateUniqueStrings(
    (item.versions ?? []).map((version) => objectStringField(version, 'sha')).filter((sha): sha is string => sha !== null),
    `Imported gist ${item.id} version shas must be unique`,
  )
  for (const version of item.versions ?? []) validateVersion(version)
}

function validateVersion(version: unknown): asserts version is EdgeGistExportVersion {
  if (!version || typeof version !== 'object' || Array.isArray(version)) throw badRequest('Invalid version export item')
  const item = version as EdgeGistExportVersion
  if (!item.id || !item.sha) throw badRequest('Imported version is missing id or sha')
  if (!Number.isInteger(item.versionIndex) || item.versionIndex < 1) throw badRequest('Invalid version index')
  if (typeof item.description !== 'string') throw badRequest(`Imported version ${item.sha} is missing description`)
  if (typeof item.committedAt !== 'string') throw badRequest(`Imported version ${item.sha} is missing committedAt`)
  if (!Array.isArray(item.files)) throw badRequest(`Imported version ${item.sha} is missing files`)
  if (!item.changeStatus || typeof item.changeStatus !== 'object') throw badRequest('Imported version is missing change status')
  validateChangeStatus(item.changeStatus, `Imported version ${item.sha}`)
  if (!Array.isArray(item.changes)) throw badRequest(`Imported version ${item.sha} is missing changes`)
  validateUniqueStrings(
    item.files.map((file) => objectStringField(file, 'filename')).filter((filename): filename is string => filename !== null),
    `Imported version ${item.sha} has duplicate filenames`,
  )
  validateUniqueStrings(
    item.changes.map((change) => objectStringField(change, 'filename')).filter((filename): filename is string => filename !== null),
    `Imported version ${item.sha} has duplicate change filenames`,
  )
  for (const file of item.files) validateFile(file)
  for (const change of item.changes) validateChange(change)
}

function validateFile(file: unknown): asserts file is EdgeGistExportFile {
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw badRequest('Invalid file export item')
  const item = file as EdgeGistExportFile
  if (!item.filename || typeof item.filename !== 'string') throw badRequest('Imported file is missing filename')
  if (filenameHasPathSeparator(item.filename)) throw badRequest(`Imported file ${item.filename} has invalid filename`)
  if (typeof item.content !== 'string') throw badRequest(`Imported file ${item.filename} is missing content`)
  if (item.type !== null && typeof item.type !== 'string') throw badRequest(`Imported file ${item.filename} has invalid type`)
  if (item.language !== null && typeof item.language !== 'string') throw badRequest(`Imported file ${item.filename} has invalid language`)
  if (!Number.isInteger(item.size) || item.size < 0) throw badRequest(`Imported file ${item.filename} has invalid size`)
  if (typeof item.truncated !== 'boolean') throw badRequest(`Imported file ${item.filename} has invalid truncated flag`)
  if (typeof item.createdAt !== 'string') throw badRequest(`Imported file ${item.filename} is missing createdAt`)
  if (typeof item.updatedAt !== 'string') throw badRequest(`Imported file ${item.filename} is missing updatedAt`)
}

function validateChange(change: unknown): asserts change is GistVersionFileChange {
  if (!change || typeof change !== 'object' || Array.isArray(change)) throw badRequest('Invalid version change export item')
  const item = change as GistVersionFileChange
  if (!item.filename || typeof item.filename !== 'string') throw badRequest('Imported version change is missing filename')
  if (filenameHasPathSeparator(item.filename)) throw badRequest(`Invalid filename for ${item.filename}`)
  if (item.status !== 'added' && item.status !== 'modified' && item.status !== 'deleted') {
    throw badRequest(`Invalid change status for ${item.filename}`)
  }
  if (
    item.previousFilename !== undefined &&
    item.previousFilename !== null &&
    (
      typeof item.previousFilename !== 'string' ||
      item.previousFilename.length === 0 ||
      filenameHasPathSeparator(item.previousFilename)
    )
  ) {
    throw badRequest(`Invalid previous filename for ${item.filename}`)
  }
  if (!isNonNegativeInteger(item.additions)) throw badRequest(`Invalid additions for ${item.filename}`)
  if (!isNonNegativeInteger(item.deletions)) throw badRequest(`Invalid deletions for ${item.filename}`)
}

function validateSetting(setting: unknown): asserts setting is EdgeGistExportSetting {
  if (!setting || typeof setting !== 'object' || Array.isArray(setting)) throw badRequest('Invalid setting export item')
  const item = setting as EdgeGistExportSetting
  if (!item.key || typeof item.key !== 'string') throw badRequest('Imported setting is missing key')
  if (typeof item.value !== 'string') throw badRequest(`Imported setting ${item.key} is missing value`)
  if (typeof item.updatedAt !== 'string') throw badRequest(`Imported setting ${item.key} is missing updatedAt`)
}

function isVisibility(value: unknown): value is GistRecord['visibility'] {
  return value === 'public' || value === 'secret'
}

function validateChangeStatus(value: unknown, label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest(`${label} has invalid change status`)
  const status = value as Partial<EdgeGistExportVersion['changeStatus']>
  if (!isNonNegativeInteger(status.total)) throw badRequest(`${label} has invalid change status total`)
  if (!isNonNegativeInteger(status.additions)) throw badRequest(`${label} has invalid change status additions`)
  if (!isNonNegativeInteger(status.deletions)) throw badRequest(`${label} has invalid change status deletions`)
}

function objectStringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = (value as Record<string, unknown>)[field]
  return typeof candidate === 'string' ? candidate : null
}

function objectArrayField(value: unknown, field: string): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const candidate = (value as Record<string, unknown>)[field]
  return Array.isArray(candidate) ? candidate : []
}

function validateUniqueStrings(values: string[], message: string): void {
  if (new Set(values).size !== values.length) throw badRequest(message)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}
