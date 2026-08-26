import { createClient, type RedisArgument, type RedisClientType } from 'redis'
import { RedisStore } from 'rate-limit-redis'
import type { Store } from 'express-rate-limit'

let client: RedisClientType | null = null
let connecting: Promise<unknown> | null = null

function getClient(): RedisClientType {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not configured')
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL })
    client.on('error', () => undefined)
    connecting = client.connect()
    void connecting.catch(() => undefined)
  }
  return client
}

export function redisRateLimitStore(prefix: string): Store | undefined {
  if (!process.env.REDIS_URL) return undefined
  const redis = getClient()
  return new RedisStore({
    prefix: `pc:${prefix}:`,
    sendCommand: async (...args: string[]) => {
      await connecting
      return redis.sendCommand(args as RedisArgument[])
    },
  })
}

export async function pingRedis(): Promise<void> {
  if (!process.env.REDIS_URL) return
  const redis = getClient()
  await connecting
  await redis.ping()
}

export async function closeRedis(): Promise<void> {
  if (!client) return
  await connecting?.catch(() => undefined)
  if (client.isOpen) await client.quit()
  client = null
  connecting = null
}
