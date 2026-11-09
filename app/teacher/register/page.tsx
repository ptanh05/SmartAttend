import { redirect } from 'next/navigation'

/**
 * Legacy `/teacher/register` route.
 *
 * Lecturers can no longer self-register — they are created by an administrator
 * through the roster import. This route now redirects to the administrator
 * registration screen.
 */
export default function LegacyTeacherRegisterRoute() {
  redirect('/admin/register')
}
