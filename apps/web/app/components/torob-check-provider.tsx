"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

export type TorobCheckMovement = "idle" | "walking"
export type TorobCheckSpeech = "silent" | "talking"

export type TorobCheckState = {
  movement: TorobCheckMovement
  speech: TorobCheckSpeech
}

type TorobCheckContextValue = {
  state: TorobCheckState
  setState: Dispatch<SetStateAction<TorobCheckState>>
  setMovement: (movement: TorobCheckMovement) => void
  setSpeech: (speech: TorobCheckSpeech) => void
}

const INITIAL_STATE: TorobCheckState = {
  movement: "walking",
  speech: "silent",
}

const TorobCheckContext = createContext<TorobCheckContextValue | null>(null)

export function TorobCheckProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TorobCheckState>(INITIAL_STATE)

  const setMovement = useCallback((movement: TorobCheckMovement) => {
    setState((current) => ({ ...current, movement }))
  }, [])

  const setSpeech = useCallback((speech: TorobCheckSpeech) => {
    setState((current) => ({ ...current, speech }))
  }, [])

  const value = useMemo(
    () => ({ state, setState, setMovement, setSpeech }),
    [state, setMovement, setSpeech]
  )

  return (
    <TorobCheckContext.Provider value={value}>
      {children}
    </TorobCheckContext.Provider>
  )
}

export function useTorobCheck() {
  const context = useContext(TorobCheckContext)

  if (!context) {
    throw new Error("useTorobCheck must be used within TorobCheckProvider")
  }

  return context
}
