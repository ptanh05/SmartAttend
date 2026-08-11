import type { AttendanceRecord, ClassSession, Course, User } from '@/lib/types/domain'

export type OrganizationScope = { organizationId: string }

export interface CourseRepository {
  list(scope: OrganizationScope): Promise<Course[]>
  get(scope: OrganizationScope, id: string): Promise<Course | null>
  create(scope: OrganizationScope, input: Omit<Course, 'id' | 'organizationId'>): Promise<Course>
  update(scope: OrganizationScope, id: string, input: Partial<Course>): Promise<Course>
  archive(scope: OrganizationScope, id: string): Promise<void>
}

export interface AttendanceRepository {
  listRecords(scope: OrganizationScope, studentId?: string): Promise<AttendanceRecord[]>
  listSessions(scope: OrganizationScope): Promise<ClassSession[]>
  record(scope: OrganizationScope, record: AttendanceRecord): Promise<AttendanceRecord>
}

export interface UserRepository {
  list(scope: OrganizationScope, role?: User['role']): Promise<User[]>
  get(scope: OrganizationScope, id: string): Promise<User | null>
}

export type RepositorySet = {
  courses: CourseRepository
  attendance: AttendanceRepository
  users: UserRepository
}

export function assertOrganizationScope(entityOrganizationId: string, scope: OrganizationScope) {
  if (entityOrganizationId !== scope.organizationId) throw new Error('Organization access denied')
}
