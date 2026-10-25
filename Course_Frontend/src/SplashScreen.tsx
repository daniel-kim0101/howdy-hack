import { useEffect, useState } from 'react'

export default function SplashScreen() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false)
    }, 2400)

    return () => window.clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div className="splash-screen" aria-hidden="true">
      <img
        className="splash-screen__logo"
        src="/app-logo.png"
        alt=""
      />
    </div>
  )
}