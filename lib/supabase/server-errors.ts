type SupabaseFailure = {
  code?: string | null
  status?: number | null
}

interface FailureContext {
  route: string
  operation: string
}

export interface QueryResult<T> {
  data: T | null
  error: SupabaseFailure | null
}

/** Retry only transport/service failures; policy and schema errors must surface. */
export async function retryTransientQueryOnce<T>(
  query: () => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T>> {
  const firstResult = await query()
  if (!isTransientFailure(firstResult.error)) return firstResult
  return query()
}

function isTransientFailure(failure?: SupabaseFailure | null): boolean {
  if (!failure) return false
  if (typeof failure.status === 'number' && failure.status >= 500) return true

  const code = failure.code?.trim() ?? ''
  return code === '' || /^PGRST00[0-3]$/.test(code)
}

/** Empty collections are successful data; errors and unexpected nulls are not. */
export function requiredQueryData<T>(context: FailureContext, result: QueryResult<T>): T {
  if (result.error || result.data === null) throwServerDataError(context, result.error)
  return result.data
}

export function optionalQueryData<T>(context: FailureContext, result: QueryResult<T>, fallback: T): T {
  if (result.error || result.data === null) {
    logOptionalDataError(context, result.error)
    return fallback
  }
  return result.data
}

/**
 * Log only stable diagnostic metadata. Supabase messages/details can contain
 * schema or policy information and must never be forwarded to the browser.
 */
export function throwServerDataError(context: FailureContext, failure?: SupabaseFailure | null): never {
  console.error('server_data_query_failed', {
    source: 'supabase',
    route: context.route,
    operation: context.operation,
    code: failure?.code ?? 'unknown',
    status: failure?.status ?? null,
  })

  throw new Error('Required application data could not be loaded.')
}

/** Record an intentional degraded experience without exposing row identities. */
export function logOptionalDataError(context: FailureContext, failure?: SupabaseFailure | null): void {
  console.warn('optional_server_data_query_failed', {
    source: 'supabase',
    route: context.route,
    operation: context.operation,
    code: failure?.code ?? 'unknown',
    status: failure?.status ?? null,
  })
}
