/**
 * Vercel Web Analytics client with a fake fetch: the request it builds, how
 * rows are read, and errors that never leak the token.
 */
import { describe, expect, it, vi } from 'vitest'
import { WebAnalyticsClient, type WebAnalyticsConfig } from '~~/server/repositories/web-analytics'

// A team project; the token must never appear in errors.
const config: WebAnalyticsConfig = { token: 'secret-token', projectId: 'prj_1', teamId: 'team_1' }
// A grouped query with every parameter set.
const query = { by: 'country' as const, since: '2026-10-01', until: '2026-10-30', filter: 'requestPath in (\'/t/a\')', limit: 5 }

/** A fetch that answers with this status and JSON body. */
function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

describe('WebAnalyticsClient.aggregate', () => {
  it('sends the query and the token, and reads the grouped rows', async () => {
    const fetchImpl = fakeFetch(200, {
      version: 1,
      data: [
        { country: 'IT', pageviews: 12, visitors: 9 },
        { country: '', pageviews: '3', visitors: 2 },
      ],
    })
    const rows = await new WebAnalyticsClient(config, fetchImpl).aggregate(query)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const sent = new URL(url)
    expect(sent.origin + sent.pathname).toBe('https://api.vercel.com/v1/query/web-analytics/visits/aggregate')
    expect(Object.fromEntries(sent.searchParams)).toEqual({
      projectId: 'prj_1', teamId: 'team_1', since: '2026-10-01', until: '2026-10-30',
      by: 'country', limit: '5', filter: 'requestPath in (\'/t/a\')',
    })
    expect(init.headers).toEqual({ authorization: 'Bearer secret-token' })
    // An empty value means unknown; counts sent as strings are read as numbers.
    expect(rows).toEqual([
      { key: 'IT', pageviews: 12, visitors: 9 },
      { key: null, pageviews: 3, visitors: 2 },
    ])
  })

  it('reads day rows from their timestamp and omits teamId for personal projects', async () => {
    const fetchImpl = fakeFetch(200, { data: [{ timestamp: '2026-10-02T00:00:00.000Z', pageviews: 4, visitors: 3 }] })
    const rows = await new WebAnalyticsClient({ ...config, teamId: '' }, fetchImpl).aggregate({ ...query, by: 'day' })

    expect(new URL(fetchImpl.mock.calls[0]![0] as unknown as string).searchParams.has('teamId')).toBe(false)
    expect(rows).toEqual([{ key: '2026-10-02T00:00:00.000Z', pageviews: 4, visitors: 3 }])
  })

  it('turns a refused token into a 502 that names the variable, not the token', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = await new WebAnalyticsClient(config, fakeFetch(403, { error: 'forbidden' })).aggregate(query).catch(e => e)
    expect(error).toMatchObject({ statusCode: 502 })
    expect(error.message).toContain('NUXT_ANALYTICS_TOKEN')
    expect(error.message).not.toContain('secret-token')
  })

  it('explains a plan without Web Analytics (402)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(new WebAnalyticsClient(config, fakeFetch(402, {})).aggregate(query))
      .rejects.toMatchObject({ statusCode: 502, message: 'Web Analytics is not available on this Vercel plan' })
  })

  it('answers 502 when Vercel cannot be reached or answers nonsense', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(new WebAnalyticsClient(config, offline).aggregate(query)).rejects.toMatchObject({ statusCode: 502 })
    await expect(new WebAnalyticsClient(config, fakeFetch(200, { rows: [] })).aggregate(query)).rejects.toMatchObject({ statusCode: 502 })
  })
})
