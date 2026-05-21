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

export type SpeechRecognitionInputOptions = {
  /** Fired once when a listen session ends (user stop, send, or single-phrase completion on mobile). */
  onSessionEnd?: (finalText: string) => void
}

/** Browser speech-to-text into a string; shared by dashboard assistant and global FAB. */
export function useSpeechRecognitionInput(
  onDisplay: (text: string) => void,
  options?: SpeechRecognitionInputOptions,
) {
  const [speechSupported, setSpeechSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const voiceBaseRef = useRef("")
  const voiceKeepRef = useRef(false)
  const throttleRef = useRef<ReturnType<typeof createThrottledSpeechDisplay> | null>(null)
  const lastDisplayRef = useRef("")
  const onDisplayRef = useRef(onDisplay)
  const onSessionEndRef = useRef(options?.onSessionEnd)
  onDisplayRef.current = onDisplay
  onSessionEndRef.current = options?.onSessionEnd

  const setDisplay = useCallback((text: string) => {
    lastDisplayRef.current = text
    onDisplayRef.current(text)
  }, [])

  useEffect(() => {
    setSpeechSupported(Boolean(speechCtor()))
  }, [])

  const endSession = useCallback((notify: boolean) => {
    voiceKeepRef.current = false
    throttleRef.current?.flushNow()
    throttleRef.current?.cancel()
    throttleRef.current = null
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
    recognitionRef.current = null
    setListening(false)
    if (notify) onSessionEndRef.current?.(lastDisplayRef.current)
  }, [])

  const stopListening = useCallback(() => {
    const notify = voiceKeepRef.current
    endSession(notify)
  }, [endSession])

  const startListening = useCallback(
    (baseText = "") => {
      const Ctor = speechCtor()
      if (!Ctor) return false
      try {
        endSession(false)
        voiceKeepRef.current = true
        voiceBaseRef.current = baseText
        lastDisplayRef.current = baseText
        throttleRef.current = createThrottledSpeechDisplay((display) => setDisplay(display))
        const rec = new Ctor()
        recognitionRef.current = rec
        const opts = speechRecognitionOptionsForPlatform()
        rec.continuous = opts.continuous
        rec.interimResults = opts.interimResults
        rec.lang = "en-US"
        rec.onresult = (ev: { results: SpeechRecognitionResultList }) => {
          const parsed = parseSpeechResultsList(ev.results)
          setDisplay(combineSpeechSessionDisplay(voiceBaseRef.current, parsed))
        }
        rec.onerror = () => {
          endSession(true)
        }
        rec.onend = () => {
          throttleRef.current?.flushNow()
          if (voiceKeepRef.current && recognitionRef.current) {
            if (!opts.continuous) {
              endSession(true)
              return
            }
            window.setTimeout(() => {
              try {
                recognitionRef.current?.start()
              } catch {
                endSession(true)
              }
            }, 280)
            return
          }
          endSession(false)
        }
        rec.start()
        setListening(true)
        return true
      } catch {
        endSession(false)
        return false
      }
    },
    [endSession, setDisplay],
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

  useEffect(() => () => endSession(false), [endSession])

  return { speechSupported, listening, startListening, stopListening, toggleListening }
}
