'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Users } from 'lucide-react'
import type { Trip, Profile } from '@/types'

interface CollaboratorPresenceProps {
  trip: Trip
  profiles: Profile[]
  currentUserId: string
}

export function CollaboratorPresence({ trip, profiles, currentUserId }: CollaboratorPresenceProps) {
  const owner = profiles.find((p) => p.id === trip.owner_id)
  const collaborator = trip.collaborator_id
    ? profiles.find((p) => p.id === trip.collaborator_id)
    : null

  const getInitials = (name?: string | null) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {owner && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar
                className={`h-8 w-8 border-2 ${
                  owner.id === currentUserId ? 'border-primary' : 'border-border'
                }`}
              >
                <AvatarFallback className="bg-card text-xs">
                  {getInitials(owner.display_name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {owner.display_name || 'Owner'}
                {owner.id === currentUserId && ' (you)'}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {collaborator && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar
                className={`-ml-2 h-8 w-8 border-2 ${
                  collaborator.id === currentUserId ? 'border-primary' : 'border-border'
                }`}
              >
                <AvatarFallback className="bg-card text-xs">
                  {getInitials(collaborator.display_name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {collaborator.display_name || 'Collaborator'}
                {collaborator.id === currentUserId && ' (you)'}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {!collaborator && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 bg-card">
                <Users className="h-3.5 w-3.5 text-muted-foreground/50" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share invite code to add a collaborator</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}
