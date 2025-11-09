import React, { createContext, useContext, useEffect, useState } from 'react'
import { auth, googleProvider } from '../lib/firebase'
import { onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, signOut as fbSignOut, createUserWithEmailAndPassword } from 'firebase/auth'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const token = await u.getIdToken()
        localStorage.setItem('id_token', token)
        // In development backend mode, set demo headers per-user to avoid data mixing
        try {
          const email = u.email || `${u.uid}@example.com`
          localStorage.setItem('demo_uid', email)
          localStorage.setItem('demo_email', email)
        } catch {}
      } else {
        localStorage.removeItem('id_token')
        try { localStorage.removeItem('demo_uid'); localStorage.removeItem('demo_email') } catch {}
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const signInGoogle = async () => {
    await signInWithPopup(auth, googleProvider)
  }

  const signInEmail = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const registerEmail = async (email, password) => {
    await createUserWithEmailAndPassword(auth, email, password)
  }

  const signOut = async () => {
    await fbSignOut(auth)
  }

  const getIdToken = async () => {
    if (!auth.currentUser) return null
    return auth.currentUser.getIdToken()
  }

  return (
    <AuthCtx.Provider value={{ user, loading, signInGoogle, signInEmail, registerEmail, signOut, getIdToken }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}
