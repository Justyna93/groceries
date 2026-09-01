/**
 * Members that can never be removed from the household.
 *
 * Every RLS policy in the schema goes through `public.is_member()`, which
 * reads `public.members` — so deleting a row here doesn't just hide someone
 * from the roster, it locks them out of the entire app with no way back in.
 * The roster UI puts a one-tap remove button next to every member, which is a
 * little too easy to hit by accident.
 *
 * This list is the client-side half of the guard; the enforcing half is the
 * trigger in `supabase/migrations/0004_protect_owner_member.sql`.
 */
const PROTECTED_MEMBER_EMAILS = new Set(['justyna.michalik93@gmail.com'])

export function isProtectedMemberEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return PROTECTED_MEMBER_EMAILS.has(email.trim().toLowerCase())
}
