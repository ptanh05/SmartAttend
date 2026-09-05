import { MicrosoftEntraId } from 'arctic'

export function getMicrosoftAuth() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim()
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim()
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim()
  const redirectURI = process.env.MICROSOFT_REDIRECT_URI?.trim()

  if (!clientId || !clientSecret || !tenantId || !redirectURI) {
    throw new Error('Microsoft OAuth configuration is missing in environment variables.')
  }

  return new MicrosoftEntraId(tenantId, clientId, clientSecret, redirectURI)
}
