import { useState } from 'react'
import { isHidden } from '../types'

interface NamedEntity {
  name: string
  description?: string | null
  color?: string | null
  hidden?: number | null
}

export function useEntityForm() {
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editHidden, setEditHidden] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function setEntityFields(entity: NamedEntity) {
    setEditName(entity.name)
    setEditDescription(entity.description ?? '')
    setEditColor(entity.color ?? '')
    setEditHidden(isHidden(entity.hidden ?? null))
    setConfirmDelete(false)
  }

  function resetEntityFields() {
    setEditName('')
    setEditDescription('')
    setEditColor('')
    setEditHidden(false)
    setConfirmDelete(false)
  }

  return {
    editName, setEditName,
    editDescription, setEditDescription,
    editColor, setEditColor,
    editHidden, setEditHidden,
    confirmDelete, setConfirmDelete,
    setEntityFields,
    resetEntityFields,
  }
}
