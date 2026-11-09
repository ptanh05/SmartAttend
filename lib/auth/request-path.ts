/**
 * Header used by the Proxy layer (`proxy.ts`) to propagate the matched API path
 * down to the route handlers.
 *
 * It lives in its own module so that both the Proxy entrypoint and the auth
 * guard can import it without creating a circular dependency.
 */
export const REQUEST_PATH_HEADER = 'x-smartattend-path'
