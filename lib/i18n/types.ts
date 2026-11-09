export type Locale = 'en' | 'vi'

/**
 * A message tree node: either a leaf string or a nested group of messages.
 * Nested groups are addressed with dot notation, e.g. `landing.portalTitle.admin`.
 */
export type MessageTree = {
  [key: string]: string | Record<string, string> | MessageTree
}

export type Messages = {
  common: Record<string, string>
  roles: Record<string, string>
  nav: {
    student: Record<string, string>
    teacher: Record<string, string>
    admin: Record<string, string>
  }
  landing: MessageTree
  auth: Record<string, string>
  login: Record<string, string>
  header: Record<string, string>
  status: Record<string, string>
  student: Record<string, string>
  teacher: Record<string, string>
  admin: Record<string, string>
  routeStates: Record<string, string>
}
