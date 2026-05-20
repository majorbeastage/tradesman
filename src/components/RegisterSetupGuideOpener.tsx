import { useEffect } from "react"
import { useGlobalAssistant } from "../contexts/GlobalAssistantContext"

export default function RegisterSetupGuideOpener({ onOpen }: { onOpen: () => void }) {
  const ga = useGlobalAssistant()
  useEffect(() => {
    ga.registerSetupGuideOpener(onOpen)
  }, [ga, onOpen])
  return null
}
