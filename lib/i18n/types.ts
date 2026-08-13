export type Locale = 'en' | 'vi'

export type Messages = {
  common: Record<string, string>
  roles: Record<string, string>
  nav: {
    student: Record<string, string>
    teacher: Record<string, string>
    admin: Record<string, string>
  }
  landing: Record<string, string>
  auth: Record<string, string>
  login: Record<string, string>
  header: Record<string, string>
  status: Record<string, string>
  student: Record<string, string>
  teacher: Record<string, string>
  admin: Record<string, string>
  routeStates: Record<string, string>
}
