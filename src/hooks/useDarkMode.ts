import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'groceries:theme'

function getInitial(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function useDarkMode() {
  const [theme, setTheme] = useState<Theme>(getInitial)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  return { theme, toggle, isDark: theme === 'dark' }
}
