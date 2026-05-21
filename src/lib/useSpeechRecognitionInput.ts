import { useCallback, useEffect, useRef, useState } from "react"
import {
  combineSpeechSessionDisplay,
  createThrottledSpeechDisplay,
  parseSpeechResultsList,
  speechRecognitionOptionsForPlatform,
} from "./speechRecognitionTranscript"

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((ev: { results: SpeechRecognitionResultList }) => void) | null
  onerror: ((ev?: Event) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function speechCtor(): (new () => SpeechRecognitionInstance) | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Browser speech-to-text into a string; shared by dashboard assistant and global FAB. */
export function useSpeechRecognitionInput(onDisplay: (text: string) => void) {
  const [speechSupported, setSpeechSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const voiceBaseRef = useRef("")
  const voiceKeepRef = useRef(false)
  const throttleRef = useRef<ReturnType<typeof createThrottledSpeechDisplay> | null>(null)
  const onDisplayRef = useRef(onDisplay)
  onDisplayRef.current = onDisplay

  useEffect(() => {
    setSpeechSupported(Boolean(speechCtor()))
  }, [])

  const stopListening = useCallback(() => {
    voiceKeepRef.current = false
    throttleRef.current?.cancel()
    throttleRef.current = null
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
    recognitionRef.current = null
    setListening(false)
  }, [])

  const startListening = useCallback(
    (baseText = "") => {
      const Ctor = speechCtor()
      if (!Ctor) return false
      try {
        stopListening()
        voiceKeepRef.current = true
        voiceBaseRef.current = baseText
        throttleRef.current = createThrottledSpeechDisplay((display) => onDisplayRef.current(display))
        const rec = new Ctor()
        recognitionRef.current = rec
        const opts = speechRecognitionOptionsForPlatform()
        rec.continuous = opts.continuous
        rec.interimResults = opts.interimResults
        rec.lang = "en-US"
        rec.onresult = (ev: { results: SpeechRecognitionResultList }) => {
          const parsed = parseSpeechResultsList(ev.results)
          onDisplayRef.current(combineSpeechSessionDisplay(voiceBaseRef.current, parsed))
        }
        rec.onerror = () => {
          voiceKeepRef.current = false
          stopListening()
        }
        rec.onend = () => {
          throttleRef.current?.flushNow()
          if (voiceKeepRef.current && recognitionRef.current) {
            window.setTimeout(() => {
              try {
                recognitionRef.current?.start()
              } catch {
                stopListening()
              }
            }, 280)
            return
          }
          setListening(false)
        }
        rec.start()
        setListening(true)
        return true
      } catch {
        stopListening()
        return false
      }
    },
    [stopListening],
  )

  const toggleListening = useCallback(
    (baseText = "") => {
      if (listening) {
        stopListening()
        return false
      }
      return startListening(baseText)
    },
    [listening, startListening, stopListening],
  )

  useEffect(() => () => stopListening(), [stopListening])

  return { speechSupported, listening, startListening, stopListening, toggleListening }
}
