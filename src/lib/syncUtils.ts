/**
 * Pure helper functions for sync conflict detection.
 * Kept separate so they can be unit tested without a DB.
 */

/**
 * Extract user-visible field names from a remote update payload.
 * Strips internal _*_eid fields and entity_id.
 */
export function extractConflictFields(remotePayload: Record<string, unknown>): string[] {
  return Object.keys(remotePayload).filter(
    k => !k.startsWith('_') && k !== 'entity_id' && k !== 'created_at'
  )
}

/**
 * Return true if the remote payload contains fields with values that differ
 * from the local payload. Fields absent in localPayload are not considered
 * conflicts (they represent additions, not overwrites).
 */
export function payloadsConflict(
  remotePayload: Record<string, unknown>,
  localPayload: Record<string, unknown>
): boolean {
  for (const key of extractConflictFields(remotePayload)) {
    if (key in localPayload && String(localPayload[key]) !== String(remotePayload[key])) {
      return true
    }
  }
  return false
}

/**
 * Given the timestamps of the local and remote events, return which wins
 * under Last-Write-Wins: 'local' if localTs > remoteTs, 'remote' otherwise.
 */
export function lwwWinner(localTs: number, remoteTs: number): 'local' | 'remote' {
  return localTs > remoteTs ? 'local' : 'remote'
}
