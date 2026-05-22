export const PROFILE_METADATA_APPLIED_EVENT = "tradesman-profile-metadata-applied"

export type ProfileMetadataAppliedDetail = {
  userId: string
  metadata: Record<string, unknown>
}
