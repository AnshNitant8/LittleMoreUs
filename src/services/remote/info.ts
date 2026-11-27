import type { Result } from '../../domain/types'
import { rpc } from './client'

export interface ServerInfo {
  mode: 'server'
  is_admin: boolean
  email: string | null
}

/** Who is signed in on the live app, and whether they are the admin. */
export function getServerInfo(): Promise<Result<ServerInfo>> {
  return rpc<ServerInfo>('getServerInfo')
}
