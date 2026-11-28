// The server's only contact with the database: four calls, all Postgres
// functions defined in supabase/schema.sql. Production uses Supabase over
// HTTPS with the service role key; tests and local runs use PGlite.

import type { Op, ScopeRows } from './scope'

export class ConflictError extends Error {}

export interface Gateway {
  /** The caller's data, plus an inviter's when an invite link is open. */
  loadScope(authId: string | null, token: string | null): Promise<ScopeRows>
  /** Everything (admin screens and the daily job). */
  loadAll(): Promise<ScopeRows>
  accountExists(identifier: string): Promise<boolean>
  linkAuth(identifier: string, authId: string): Promise<boolean>
  /** Removes the live dry run's test accounts and everything they made. */
  cleanupSelftest(prefix: string): Promise<number>
  /** Saves all ops or none. Throws ConflictError if a record changed since it was read. */
  commit(ops: Op[]): Promise<{ erased_auth_ids: string[] }>
  /** Stores a sign-in code hash; returns seconds to wait if one was sent within a minute. */
  codeIssue(email: string, hash: string, is18: boolean): Promise<number>
  codeCheck(email: string, hash: string): Promise<CodeCheck>
}

export type CodeCheck = { status: 'ok'; is_18: boolean } | { status: 'wrong'; attempts_left: number } | { status: 'expired' | 'locked' }

/** Minimal SQL runner shape shared by PGlite and node-postgres style clients. */
export interface SqlRunner {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export function sqlGateway(db: SqlRunner): Gateway {
  const one = async <T>(sql: string, params: unknown[]): Promise<T> => {
    const r = await db.query<{ r: T }>(sql, params)
    return r.rows[0].r
  }
  return {
    loadScope: (authId, token) => one('select app_load_scope($1, $2) as r', [authId, token]),
    loadAll: () => one('select app_load_all() as r', []),
    accountExists: (id) => one('select app_account_exists($1) as r', [id]),
    linkAuth: (id, auth) => one('select app_link_auth($1, $2) as r', [id, auth]),
    cleanupSelftest: () => one('select app_selftest_cleanup() as r', []),
    codeIssue: (email, hash, is18) => one('select app_code_issue($1, $2, $3) as r', [email, hash, is18]),
    codeCheck: (email, hash) => one('select app_code_check($1, $2) as r', [email, hash]),
    async commit(ops) {
      try {
        return await one('select app_commit($1) as r', [JSON.stringify(ops)])
      } catch (e) {
        if ((e as { code?: string }).code === '40001') throw new ConflictError('conflict')
        throw e
      }
    },
  }
}
