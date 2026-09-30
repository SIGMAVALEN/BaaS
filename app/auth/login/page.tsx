'use client'

import { useState } from 'react'
import { ArrowLeft, PawPrint } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function continueWithGoogle() {
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:
          process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
          `${window.location.origin}/auth/callback`,
      },
    })

    if (oauthError) {
      setError('No pudimos iniciar sesión con Google. Intenta nuevamente.')
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <a className="back-link" href="/">
        <ArrowLeft size={16} /> Volver a nido
      </a>
      <div className="auth-card">
        <div className="auth-logo">
          <span className="brand-mark"><PawPrint size={20} /></span>
          <span>nido</span>
        </div>
        <h1>Qué bueno verte.</h1>
        <p className="muted">Entra para continuar cuidando de los tuyos.</p>
        <button className="google-button full" onClick={continueWithGoogle} disabled={loading}>
          <span className="google-mark" aria-hidden="true">G</span>
          {loading ? 'Conectando...' : 'Continuar con Google'}
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="auth-footer">Al continuar, aceptas crear o usar tu cuenta de nido.</p>
      </div>
    </main>
  )
}
