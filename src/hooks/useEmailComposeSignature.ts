import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import { uploadFilesForOutbound } from "../lib/uploadCommAttachment"
import {
  buildEmailSignatureDoc,
  defaultSignatureTextForRole,
  loadEmailSignatureFromMetadata,
  loadStoredEmailSignature,
  mergeEmailSignatureMetadata,
  saveStoredEmailSignature,
  type EmailSignatureDoc,
} from "../lib/emailSignature"

export function useEmailComposeSignature(userId: string | null | undefined, role?: string | null) {
  const [signatureText, setSignatureText] = useState(() => loadStoredEmailSignature())
  const [signatureLogoUrl, setSignatureLogoUrl] = useState<string | null>(null)
  const [signatureLogoUploading, setSignatureLogoUploading] = useState(false)

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("metadata, display_name, role")
        .eq("id", userId)
        .maybeSingle()
      if (cancelled || !data) return
      const sigDoc = loadEmailSignatureFromMetadata(data.metadata)
      const profileRole = typeof data.role === "string" ? data.role : role ?? null
      const displayName = typeof data.display_name === "string" ? data.display_name : null
      if (sigDoc?.text) {
        setSignatureText(sigDoc.text)
        saveStoredEmailSignature(sigDoc.text)
      } else if (!loadStoredEmailSignature()) {
        const starter = defaultSignatureTextForRole(profileRole, displayName)
        setSignatureText(starter)
      }
      if (sigDoc?.logoUrl) setSignatureLogoUrl(sigDoc.logoUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, role])

  const persistSignature = useCallback(
    async (patch?: Partial<Pick<EmailSignatureDoc, "text" | "logoUrl">>) => {
      const text = (patch?.text ?? signatureText).trim()
      const logoUrl = patch?.logoUrl !== undefined ? patch.logoUrl : signatureLogoUrl
      saveStoredEmailSignature(text)
      if (!supabase || !userId) return
      const doc: EmailSignatureDoc = {
        v: 1,
        text,
        logoUrl: logoUrl?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      const prevMeta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? { ...(data.metadata as Record<string, unknown>) }
          : {}
      await supabase
        .from("profiles")
        .update({ metadata: mergeEmailSignatureMetadata(prevMeta, doc) })
        .eq("id", userId)
    },
    [signatureText, signatureLogoUrl, userId],
  )

  const onSignatureBlur = useCallback(() => {
    void persistSignature()
  }, [persistSignature])

  const uploadSignatureLogo = useCallback(
    async (file: File) => {
      if (!userId) return
      setSignatureLogoUploading(true)
      try {
        const urls = await uploadFilesForOutbound(userId, [file], "email-signature")
        const url = urls[0] ?? null
        if (!url) return
        setSignatureLogoUrl(url)
        await persistSignature({ logoUrl: url })
      } finally {
        setSignatureLogoUploading(false)
      }
    },
    [userId, persistSignature],
  )

  const clearSignatureLogo = useCallback(async () => {
    setSignatureLogoUrl(null)
    await persistSignature({ logoUrl: null })
  }, [persistSignature])

  const signatureDoc = useMemo(
    () => buildEmailSignatureDoc(signatureText, signatureLogoUrl),
    [signatureText, signatureLogoUrl],
  )

  return {
    signatureText,
    setSignatureText,
    signatureLogoUrl,
    signatureLogoUploading,
    uploadSignatureLogo,
    clearSignatureLogo,
    persistSignature,
    onSignatureBlur,
    signatureDoc,
  }
}
