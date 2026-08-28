import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

const token = 'scim-test-bearer-token-at-least-32-characters'

afterEach(() => {
  delete process.env.SCIM_BEARER_TOKEN
})

describe('SCIM Users lifecycle', () => {
  it('fails closed when SCIM is not configured', async () => {
    const response = await request(createApp()).get('/api/scim/v2/Users')
    expect(response.status).toBe(404)
  })

  it('provisions, lists, and disables an enterprise user', async () => {
    process.env.SCIM_BEARER_TOKEN = token
    const app = createApp()
    const created = await request(app)
      .post('/api/scim/v2/Users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        externalId: `scim-${Date.now()}`,
        userName: `scim-${Date.now()}@example.com`,
        displayName: 'SCIM User',
        active: true,
        roles: [{ value: 'cost_controller' }],
      })
    expect(created.status).toBe(201)
    expect(created.body.active).toBe(true)
    expect(created.body.roles[0].value).toBe('cost_controller')

    const listed = await request(app)
      .get('/api/scim/v2/Users')
      .set('Authorization', `Bearer ${token}`)
    expect(listed.status).toBe(200)
    expect(listed.body.Resources.some((user: { id: string }) => user.id === created.body.id)).toBe(true)

    const disabled = await request(app)
      .patch(`/api/scim/v2/Users/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      })
    expect(disabled.status).toBe(200)
    expect(disabled.body.active).toBe(false)
  })
})
