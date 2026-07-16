import type { MemberRole, TripCapabilities } from '@/types'

export function tripCapabilitiesForRole(role: MemberRole): TripCapabilities {
  return {
    role,
    canEdit: role === 'owner' || role === 'editor',
    canManageTrip: role === 'owner',
  }
}
