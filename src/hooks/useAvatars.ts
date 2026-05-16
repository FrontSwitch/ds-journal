import { useState, useEffect, useCallback } from 'react'
import { getAvatars, getAvatarGroups, getAllGroupMembers, getChannelActivityAvatarIds, getAvatarFields, getAllAvatarFieldValues, getAvatarImagesMap } from '../db/avatars'
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
  const [fieldValuesLoaded, setFieldValuesLoaded] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [allAvatars, allGroups, allMembers, allFields] = await Promise.all([
      getAvatars(), getAvatarGroups(), getAllGroupMembers(), getAvatarFields(),
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
    setFieldValuesLoaded(false)
    setLoading(false)

    // Background: load image_data for avatars that have one (single batch query)
    getAvatarImagesMap().then(imageMap => {
      if (imageMap.size === 0) return
      const merge = (a: Avatar): Avatar => imageMap.has(a.id) ? { ...a, image_data: imageMap.get(a.id) } : a
      setAvatars(prev => prev.map(merge))
      setGroups(prev => prev.map(gwm => ({ ...gwm, avatars: gwm.avatars.map(merge) })))
      setUngrouped(prev => prev.map(merge))
      setSuspects(prev => prev.map(merge))
    })
  }, [selectedChannelId])

  // Load all field values on demand (used by avatar panel field filter)
  const loadFieldValues = useCallback(async () => {
    if (fieldValuesLoaded) return
    const vals = await getAllAvatarFieldValues()
    setFieldValues(vals)
    setFieldValuesLoaded(true)
  }, [fieldValuesLoaded])

  useEffect(() => { load() }, [load])

  return { avatars, groups, ungrouped, suspects, fields, fieldValues, fieldValuesLoaded, loading, reload: load, loadFieldValues }
}
