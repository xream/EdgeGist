import { describe, expect, test } from 'bun:test'
import {
  emptyComments,
  emptyForks,
  mockCommentResponse,
  mockForkResponse,
} from '../../src/gists/social'
import type { EdgeGistConfig } from '../../src/env'

describe('mock social behavior', () => {
  test('returns empty social collections', () => {
    expect(emptyForks()).toEqual([])
    expect(emptyComments()).toEqual([])
  })

  test('renders full social mocks with GitHub-shaped owner metadata', () => {
    expect(mockForkResponse('gist1', config)).toMatchObject({
      id: 'gist1',
      url: 'https://edgegist.test/gists/gist1',
      owner: { login: 'owner' },
      forks: [],
      mocked: true,
    })
    expect(mockCommentResponse(config)).toMatchObject({
      url: 'https://edgegist.test/gists/comments/0',
      user: { login: 'owner' },
      mocked: true,
    })
  })

  test('renders lite social mocks with lite self links and no owner metadata', () => {
    const fork = mockForkResponse('gist1', config, { apiPrefix: '/lite', lite: true })
    expect(fork.url).toBe('https://edgegist.test/lite/gists/gist1')
    expect(fork.owner).toBeUndefined()
    expect(fork.forks).toBeUndefined()

    const comment = mockCommentResponse(config, { apiPrefix: '/lite', lite: true })
    expect(comment.url).toBe('https://edgegist.test/lite/gists/comments/0')
    expect(comment.user).toBeUndefined()
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
