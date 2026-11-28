import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ConflictError, type Gateway } from './gateway'

export function supabaseAdmin(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function supabaseGateway(sb: SupabaseClient): Gateway {
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await sb.rpc(fn, args)
    if (error) {
      if (error.code === '40001') throw new ConflictError('conflict')
      throw new Error(`${fn} failed: ${error.message}`)
    }
    return data as T
  }
  return {
    loadScope: (authId, token) => call('app_load_scope', { p_auth_id: authId, p_token: token }),
    loadAll: () => call('app_load_all', {}),
    accountExists: (identifier) => call('app_account_exists', { p_identifier: identifier }),
    cleanupSelftest: () => call('app_selftest_cleanup', {}),
    linkAuth: (identifier, authId) => call('app_link_auth', { p_identifier: identifier, p_auth_id: authId }),
    async commit(ops) {
      const res = await call<{ erased_auth_ids: string[] }>('app_commit', { p_ops: ops })
      // Erased accounts also lose their sign-in.
      for (const id of res.erased_auth_ids ?? []) await sb.auth.admin.deleteUser(id).catch(() => undefined)
      return res
    },
  }
}
