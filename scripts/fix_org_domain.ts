import 'dotenv/config'
import { db } from '../lib/db'
import { organizations } from '../lib/db/schema'
import { eq, or, like } from 'drizzle-orm'

async function main() {
  console.log('Fixing organization email domains...')
  await db()
    .update(organizations)
    .set({ emailDomain: 'utc.edu.vn' })
    .where(or(
      eq(organizations.id, 'org_UjI_X_F2gf'),
      like(organizations.emailDomain, '%utc.edu.vn%')
    ))

  const current = await db()
    .select({ id: organizations.id, name: organizations.name, emailDomain: organizations.emailDomain })
    .from(organizations)
    .where(eq(organizations.id, 'org_UjI_X_F2gf'))

  console.log('Result for org_UjI_X_F2gf:', current)
}

main().catch(console.error).then(() => process.exit(0))

