import { redirect } from 'next/navigation'

/**
 * Legacy `/staff` portal.
 *
 * The staff portal used to cover both lecturers and admins. It has been
 * split into two explicit portals (`/teacher` and `/admin`), so this route
 * now permanently redirects to the lecturer portal. Users still holding a
 * bookmarked `/staff/login` or `/staff/register` link land on a working
 * screen, where they can switch to the portal that matches their account.
 */
export default function LegacyStaffRoute() {
  redirect('/teacher/login')
}
