import type { Role } from '@/lib/types/domain'

export function canAccessRole(role: Role, pathname: string) {
  const area = pathname.split('/')[1]
  return !['student', 'teacher', 'admin'].includes(area) || area === role
}
