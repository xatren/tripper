import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MobileEntryFlow } from '@/components/onboarding/mobile-entry-flow'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return <MobileEntryFlow />
}
