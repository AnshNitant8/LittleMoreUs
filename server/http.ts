// Node request handler for /api/rpc and /api/cron, used by Vercel and by the
// local dev server alike.

import type { IncomingMessage, ServerResponse } from 'node:http'
import * as api from '../src/services/api.local'
import { setAiClient, createGeminiClient } from '../src/services/gemini'
import type { Gateway } from './gateway'
import { handleRpc, withDb, type Caller, type RpcRequest } from './rpc'
import { buildDb, diffDb } from './scope'

export interface ServerConfig {
  gateway: Gateway
  /** Turns a bearer token into a verified caller, or null. */
  verify(token: string): Promise<Caller | null>
  adminEmails: string[]
  geminiKey?: string
  cronSecret?: string
}

const MAX_BODY = 64 * 1024

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('too_large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

export function createHandler(cfg: ServerConfig) {
  setAiClient(createGeminiClient(cfg.geminiKey))
  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://local')
    try {
      if (url.pathname === '/api/cron') return await cron(req, res, cfg)
      if (url.pathname !== '/api/rpc') return send(res, 404, { error: 'not_found' })
      if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' })
      let body: RpcRequest
      try {
        body = JSON.parse(await readBody(req)) as RpcRequest
      } catch {
        return send(res, 400, { error: 'bad_request' })
      }
      const auth = req.headers.authorization
      const caller = auth?.startsWith('Bearer ') ? await cfg.verify(auth.slice(7)) : null
      const out = await handleRpc(body, caller, { gateway: cfg.gateway, adminEmails: cfg.adminEmails })
      send(res, 200, out)
    } catch (e) {
      // Never log request bodies: they can hold answers.
      console.error('[api] failed', e instanceof Error ? e.message : 'unknown')
      send(res, 500, { result: { ok: false, error: { code: 500, message: 'Something went wrong. Please try again.' } }, client: { pending_invite: null } })
    }
  }
}

/** Daily clean-up across all couples: expiry, reminders, erasure, retention. */
async function cron(req: IncomingMessage, res: ServerResponse, cfg: ServerConfig) {
  if (!cfg.cronSecret || req.headers.authorization !== `Bearer ${cfg.cronSecret}`) return send(res, 401, { error: 'unauthorized' })
  const rows = await cfg.gateway.loadAll()
  const { db, snapshot } = buildDb(rows, null)
  const out = await withDb(db, () => api.runScheduledJobs())
  const ops = diffDb(out.db, snapshot, null)
  if (ops.length) await cfg.gateway.commit(ops)
  send(res, 200, { ok: true, saved: ops.length, summary: out.result.ok ? out.result.data : null })
}
