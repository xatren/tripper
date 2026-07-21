'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { tokens } from '@/components/mobile'
import { showToast } from '@/components/ui/toast'
import { useTripPresence, useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import type { MemberRole, Trip, TripActivity, TripCapabilities, TripComment, TripCommentEntityType, TripMember } from '@/types'

function memberName(member: TripMember | undefined, currentUserId?: string) {
  if (member?.user_id === currentUserId) return 'You'
  return member?.profile?.display_name?.trim() || member?.profile?.email?.split('@')[0] || 'Trip member'
}

function initials(member: TripMember) {
  return memberName(member).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
}

function FullScreenSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose, open])
  if (!open) return null
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: 180, background: tokens.bgBase, display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'max(12px, env(safe-area-inset-top)) 16px 12px', background: tokens.glassStandardFill, borderBottom: `1px solid ${tokens.glassStandardBorder}`, backdropFilter: 'blur(var(--glass-standard-blur))' }}>
        <button type="button" onClick={onClose} aria-label={`Close ${title}`} style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: tokens.textPrimary, fontSize: 22 }}>×</button>
        <h2 style={{ margin: 0, fontSize: 17, color: tokens.textPrimary }}>{title}</h2>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px max(24px, env(safe-area-inset-bottom))' }}>{children}</div>
    </div>
  )
}

export function MembersSheet({ open, onClose, trip, members, currentUserId, capabilities, onChanged }: {
  open: boolean; onClose: () => void; trip: Trip; members: TripMember[]; currentUserId: string; capabilities: TripCapabilities; onChanged: () => void
}) {
  const presence = useTripPresence()
  const onlineIds = useMemo(() => new Set(presence.map((entry) => entry.userId)), [presence])
  const [busyId, setBusyId] = useState<string | null>(null)
  const ownerCount = members.filter((member) => member.role === 'owner').length

  const mutate = async (member: TripMember, action: 'set_role' | 'remove', role?: MemberRole) => {
    setBusyId(member.user_id)
    const { error } = await createClient().rpc('manage_trip_member', {
      p_trip_id: trip.id, p_target_user_id: member.user_id, p_action: action, p_role: role ?? null,
    })
    setBusyId(null)
    if (error) {
      showToast(error.message.includes('last owner') || error.message.includes('at least one owner') ? 'A trip must keep at least one owner.' : "Couldn't update this member.", 'error')
      return
    }
    onChanged()
  }

  const rotateInvite = async () => {
    const { data, error } = await createClient().rpc('rotate_trip_invite', { p_trip_id: trip.id })
    if (error || !data) return showToast("Couldn't renew the invite link.", 'error')
    const link = `${window.location.origin}/join/${data}`
    await navigator.clipboard?.writeText(link)
    showToast('New invite link copied. The old link no longer works.', 'success')
    onChanged()
  }

  return (
    <FullScreenSheet open={open} title="Members" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {members.map((member) => {
          const isOnline = onlineIds.has(member.user_id)
          const lastOwner = member.role === 'owner' && ownerCount === 1
          return (
            <div key={member.user_id} style={{ padding: 14, borderRadius: 16, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', width: 42, height: 42, borderRadius: '50%', background: 'rgba(245,166,35,.2)', display: 'grid', placeItems: 'center', fontWeight: 800, color: tokens.textPrimary }}>
                {initials(member)}
                <span aria-hidden="true" style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: isOnline ? '#38d996' : '#667085', border: `2px solid ${tokens.bgBase}` }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 750, color: tokens.textPrimary }}>{memberName(member, currentUserId)}</div>
                <div style={{ color: tokens.textMuted, fontSize: 12 }}>{isOnline ? 'Online' : 'Offline'} · {member.role}</div>
              </div>
              {capabilities.canManageTrip && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select aria-label={`Role for ${memberName(member)}`} disabled={busyId === member.user_id || lastOwner} value={member.role} onChange={(event) => void mutate(member, 'set_role', event.target.value as MemberRole)} style={{ minHeight: 38, borderRadius: 10, background: '#171725', color: tokens.textPrimary, border: '1px solid rgba(255,255,255,.12)' }}>
                    <option value="owner">Owner</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
                  </select>
                  <button type="button" aria-label={`Remove ${memberName(member)}`} disabled={busyId === member.user_id || lastOwner} onClick={() => void mutate(member, 'remove')} style={{ minHeight: 38, borderRadius: 10, border: '1px solid rgba(255,120,120,.25)', background: 'rgba(255,80,80,.08)', color: '#ffaaaa' }}>Remove</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {capabilities.canManageTrip && <button type="button" onClick={() => void rotateInvite()} style={{ width: '100%', minHeight: 46, marginTop: 18, borderRadius: 14, border: 0, background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800 }}>Renew & copy invite link</button>}
      <p style={{ color: tokens.textMuted, fontSize: 12, lineHeight: 1.5 }}>Editors can plan and comment. Viewers can only read. Only owners can manage access.</p>
    </FullScreenSheet>
  )
}

const ACTIVITY_LABEL: Record<TripActivity['event_type'], string> = {
  item_created: 'added an activity', item_moved: 'moved an activity', item_completed: 'completed an activity',
  reservation_created: 'added a reservation', reservation_status_changed: 'changed a reservation status',
  member_joined: 'joined the trip', member_role_changed: 'changed a member role', member_removed: 'removed a member',
  invite_rotated: 'renewed the invite link', comment_created: 'commented',
}

export function ActivityFeedSheet({ open, onClose, tripId, members, currentUserId }: { open: boolean; onClose: () => void; tripId: string; members: TripMember[]; currentUserId: string }) {
  const [rows, setRows] = useState<TripActivity[]>([])
  const [hasMore, setHasMore] = useState(true)
  const load = useCallback(async (append = false) => {
    let query = createClient().from('trip_activity').select('*').eq('trip_id', tripId).order('id', { ascending: false }).limit(30)
    if (append && rows.length) query = query.lt('id', rows[rows.length - 1].id)
    const { data } = await query
    if (!data) return
    setRows((current) => append ? [...current, ...(data as TripActivity[])] : data as TripActivity[])
    setHasMore(data.length === 30)
  }, [rows, tripId])
  useEffect(() => { if (open) void load(false) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useTripRealtimeTable<TripActivity & Record<string, unknown>>('trip_activity', useCallback((change) => {
    if (!open || change.eventType === 'DELETE') return
    const row = change.new as unknown as TripActivity
    setRows((current) => current.some((item) => item.id === row.id) ? current : [row, ...current])
  }, [open]), useCallback(() => { if (open) void load(false) }, [load, open]))
  const byId = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members])
  return (
    <FullScreenSheet open={open} title="Activity" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((row) => <div key={row.id} style={{ padding: '13px 4px', borderBottom: '1px solid rgba(255,255,255,.08)', color: tokens.textSecondary, fontSize: 13 }}><strong style={{ color: tokens.textPrimary }}>{memberName(row.actor_id ? byId.get(row.actor_id) : undefined, currentUserId)}</strong> {ACTIVITY_LABEL[row.event_type]}<div style={{ color: tokens.textMuted, fontSize: 11, marginTop: 3 }}>{new Date(row.created_at).toLocaleString()}</div></div>)}
        {!rows.length && <p style={{ color: tokens.textMuted }}>Meaningful trip changes will appear here.</p>}
      </div>
      {hasMore && <button type="button" onClick={() => void load(true)} style={{ width: '100%', minHeight: 44, marginTop: 14, borderRadius: 12, background: 'rgba(255,255,255,.06)', color: tokens.textPrimary, border: '1px solid rgba(255,255,255,.12)' }}>More</button>}
    </FullScreenSheet>
  )
}

export function CommentSection({ tripId, entityType, entityId, currentUserId, members, canComment }: { tripId: string; entityType: TripCommentEntityType; entityId: string; currentUserId: string; members: TripMember[]; canComment: boolean }) {
  const [comments, setComments] = useState<TripComment[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const optimisticSequence = useRef(0)
  const byId = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members])
  const refresh = useCallback(async () => {
    const { data } = await createClient().from('trip_comments').select('*').eq('trip_id', tripId).eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: true })
    if (data) setComments(data as TripComment[])
  }, [entityId, entityType, tripId])
  useEffect(() => { void refresh() }, [refresh])
  useTripRealtimeTable<TripComment & Record<string, unknown>>('trip_comments', useCallback((change) => {
    const row = (change.eventType === 'DELETE' ? change.old : change.new) as Partial<TripComment>
    if (row.entity_type && (row.entity_type !== entityType || row.entity_id !== entityId)) return
    if (change.eventType === 'DELETE') setComments((current) => current.filter((comment) => comment.id !== row.id))
    else if (row.id) setComments((current) => current.some((comment) => comment.id === row.id) ? current.map((comment) => comment.id === row.id ? { ...comment, ...row } as TripComment : comment) : [...current, row as TripComment])
  }, [entityId, entityType]), refresh)

  const mentionQuery = /(?:^|\s)@([^\s@]*)$/.exec(body)?.[1]?.toLowerCase()
  const suggestions = mentionQuery === undefined ? [] : members.filter((member) => member.user_id !== currentUserId && memberName(member).toLowerCase().includes(mentionQuery)).slice(0, 5)
  const chooseMention = (member: TripMember) => {
    setBody((current) => current.replace(/(?:^|\s)@[^\s@]*$/, (match) => `${match.startsWith(' ') ? ' ' : ''}@${memberName(member)} `))
    setMentionIds((current) => current.includes(member.user_id) ? current : [...current, member.user_id])
  }
  const send = async () => {
    const value = body.trim()
    if (!value || sending || !canComment) return
    if (!navigator.onLine) return showToast('Comments need a connection. Offline comment queue is not enabled.', 'info')
    optimisticSequence.current += 1
    const optimistic: TripComment = { id: `pending-${currentUserId}-${optimisticSequence.current}`, trip_id: tripId, entity_type: entityType, entity_id: entityId, body: value, created_by: currentUserId, parent_id: null, created_at: '', updated_at: '' }
    setComments((current) => [...current, optimistic]); setBody(''); setSending(true)
    const client = createClient()
    const { data, error } = await client.from('trip_comments').insert({ trip_id: tripId, entity_type: entityType, entity_id: entityId, body: value, created_by: currentUserId }).select().single()
    setSending(false)
    if (error || !data) {
      setComments((current) => current.filter((comment) => comment.id !== optimistic.id))
      setBody(value)
      return showToast("Comment wasn't sent.", 'error', { label: 'Retry', onClick: () => void send() })
    }
    setComments((current) => current.map((comment) => comment.id === optimistic.id ? data as TripComment : comment))
    if (mentionIds.length) await client.from('trip_comment_mentions').insert(mentionIds.map((userId) => ({ comment_id: data.id, user_id: userId })))
    setMentionIds([])
  }
  return (
    <section aria-label="Comments" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {comments.map((comment) => <div key={comment.id} style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)' }}><div style={{ color: tokens.textMuted, fontSize: 11, marginBottom: 5 }}>{memberName(byId.get(comment.created_by), currentUserId)}</div><div style={{ color: tokens.textPrimary, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{comment.body}</div></div>)}
      {!comments.length && <p style={{ color: tokens.textMuted, fontSize: 12 }}>No comments yet.</p>}
      {canComment ? <div style={{ position: 'relative' }}>
        {suggestions.length > 0 && <div role="listbox" aria-label="Mention a trip member" style={{ marginBottom: 6, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)' }}>{suggestions.map((member) => <button role="option" aria-selected="false" key={member.user_id} type="button" onClick={() => chooseMention(member)} style={{ display: 'block', width: '100%', minHeight: 40, textAlign: 'left', background: '#20202d', border: 0, color: tokens.textPrimary, padding: '8px 12px' }}>@{memberName(member)}</button>)}</div>}
        <textarea aria-label="Add a comment" value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={4000} placeholder="Add a comment… Use @ to mention" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.06)', color: tokens.textPrimary, border: '1px solid rgba(255,255,255,.12)', fontFamily: 'inherit' }} />
        <button type="button" disabled={!body.trim() || sending} onClick={() => void send()} style={{ width: '100%', minHeight: 42, marginTop: 6, borderRadius: 12, border: 0, background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800, opacity: sending ? .6 : 1 }}>{sending ? 'Sending…' : 'Comment'}</button>
      </div> : <p style={{ color: tokens.textMuted, fontSize: 12 }}>Viewers can read comments but can’t post.</p>}
    </section>
  )
}
