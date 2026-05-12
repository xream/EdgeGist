import { describe, expect, test } from 'bun:test'
import { presentGist, presentLiteGist } from '../../src/gists/presenter'
import type { GistRecord } from '../../src/gists/types'
import type { EdgeGistConfig } from '../../src/env'

describe('GitHub presenter', () => {
  test('renders GitHub-shaped gist fields with zero social counts', () => {
    const payload = presentGist(gist(), {
      config,
      versions: [],
    })

    expect(payload.id).toBe('gist1')
    expect(payload.public).toBe(true)
    expect(payload.comments).toBe(0)
    expect(payload.forks).toEqual([])
    expect(payload.owner).toMatchObject({ login: 'owner' })
    expect(payload.html_url).toBe('https://edgegist.test/owner/gist1')
    expect(payload.git_pull_url).toBe('https://edgegist.test/owner/gist1.git')
    expect(payload.git_push_url).toBe('https://edgegist.test/owner/gist1.git')
    expect(payload.files).toMatchObject({
      'config.json': {
        filename: 'config.json',
        raw_url: 'https://edgegist.test/owner/gist1/raw/config.json',
        content: '{"enabled":true}',
        created_at: '2026-05-08T00:00:00.000Z',
        updated_at: '2026-05-08T00:00:00.000Z',
      },
    })
  })

  test('encodes owner only for URL paths while keeping owner login raw', () => {
    const payload = presentGist(gist(), {
      config: {
        ...config,
        ownerUsername: 'owner name',
      },
      versions: [],
    })

    expect(payload.owner).toMatchObject({ login: 'owner name' })
    expect(payload.html_url).toBe('https://edgegist.test/owner%20name/gist1')
    expect(payload.git_pull_url).toBe('https://edgegist.test/owner%20name/gist1.git')
    expect(payload.git_push_url).toBe('https://edgegist.test/owner%20name/gist1.git')
    expect(payload.files).toMatchObject({
      'config.json': {
        raw_url: 'https://edgegist.test/owner%20name/gist1/raw/config.json',
      },
    })
  })

  test('renders lite gist fields needed by Sub-Store without history, owner, or file content', () => {
    const payload = presentLiteGist(gist(), {
      config,
      apiPrefix: '/lite',
      versions: [],
    })

    expect(payload.id).toBe('gist1')
    expect(payload.url).toBe('https://edgegist.test/lite/gists/gist1')
    expect(payload.html_url).toBe('https://edgegist.test/owner/gist1')
    expect(payload.description).toBe('test')
    expect(payload.owner).toBeUndefined()
    expect(payload.history).toBeUndefined()
    expect(payload.forks).toBeUndefined()
    expect(payload.files).toMatchObject({
      'config.json': {
        filename: 'config.json',
        raw_url: 'https://edgegist.test/owner/gist1/raw/config.json',
        size: 16,
      },
    })
    expect(
      (payload.files as Record<string, Record<string, unknown>>)['config.json']?.content,
    ).toBeUndefined()
  })
})

const config: EdgeGistConfig = {
  ownerUsername: 'owner',
  ownerPassword: 'password',
  ownerToken: 'token',
  baseUrl: 'https://edgegist.test',
  retention: { count: 100 },
  turnstile: null,
}

function gist(): GistRecord {
  return {
    id: 'gist1',
    ownerLogin: 'owner',
    description: 'test',
    visibility: 'public',
    starredAt: null,
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
    files: [
      {
        filename: 'config.json',
        content: '{"enabled":true}',
        type: 'application/json',
        language: 'JSON',
        size: 16,
        truncated: false,
        createdAt: '2026-05-08T00:00:00.000Z',
        updatedAt: '2026-05-08T00:00:00.000Z',
      },
    ],
  }
}
