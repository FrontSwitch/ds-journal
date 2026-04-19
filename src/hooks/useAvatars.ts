import { useState, useEffect, useCallback } from 'react'
import { getAvatars, getAvatarGroups, getAllGroupMembers, getChannelActivityAvatarIds, getAvatarFields, getAllAvatarFieldValues } from '../db/avatars'
import type { Avatar, AvatarField, AvatarFieldValue, AvatarGroup } from '../types'

export interface GroupWithMembers {
  group: AvatarGroup
  avatars: Avatar[]
}

export function useAvatars(selectedChannelId: number | null) {
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [groups, setGroups] = useState<GroupWithMembers[]>([])
  const [ungrouped, setUngrouped] = useState<Avatar[]>([])
  const [suspects, setSuspects] = useState<Avatar[]>([])
  const [fields, setFields] = useState<AvatarField[]>([])
  const [fieldValues, setFieldValues] = useState<AvatarFieldValue[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [allAvatars, allGroups, allMembers, allFields, allValues] = await Promise.all([
      getAvatars(), getAvatarGroups(), getAllGroupMembers(), getAvatarFields(), getAllAvatarFieldValues(),
    ])

    // build groups with members
    const membersByGroup = new Map<number, number[]>()
    for (const { avatar_id, group_id } of allMembers) {
      if (!membersByGroup.has(group_id)) membersByGroup.set(group_id, [])
      membersByGroup.get(group_id)!.push(avatar_id)
    }
    const groupsWithMembers: GroupWithMembers[] = allGroups.map(g => {
      const memberIds = membersByGroup.get(g.id) ?? []
      return { group: g, avatars: allAvatars.filter(a => memberIds.includes(a.id)) }
    })

    // ungrouped: avatars not in any group
    const allMemberIds = new Set(groupsWithMembers.flatMap(g => g.avatars.map(a => a.id)))
    const ungroupedAvatars = allAvatars.filter(a => !allMemberIds.has(a.id))

    // ordinary suspects: avatars that have posted in selected channel
    let suspectAvatars: Avatar[] = []
    if (selectedChannelId !== null && selectedChannelId > 0) {
      const activityIds = await getChannelActivityAvatarIds(selectedChannelId)
      suspectAvatars = allAvatars.filter(a => activityIds.includes(a.id))
    }

    setAvatars(allAvatars)
    setGroups(groupsWithMembers)
    setUngrouped(ungroupedAvatars)
    setSuspects(suspectAvatars)
    setFields(allFields)
    setFieldValues(allValues)
    setLoading(false)
  }, [selectedChannelId])

  useEffect(() => { load() }, [load])

  return { avatars, groups, ungrouped, suspects, fields, fieldValues, loading, reload: load }
}
