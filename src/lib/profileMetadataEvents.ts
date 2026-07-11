export const PROFILE_METADATA_APPLIED_EVENT = "tradesman-profile-metadata-applied"

export type ProfileMetadataAppliedDetail = {
  userId: string
  metadata: Record<string, unknown>
}

export function notifyProfileMetadataApplied(userId: string, metadata: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<ProfileMetadataAppliedDetail>(PROFILE_METADATA_APPLIED_EVENT, {
      detail: { userId, metadata },
    }),
  )
}
