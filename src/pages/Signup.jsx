import React, { useState } from 'react'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function validate() {
    if (!name) return 'Name is required'
    if (!email) return 'Email is required'
    if (!password) return 'Password is required'
    if (password.length < 6) return 'Password must be at least 6 characters'
    if (password !== confirm) return 'Passwords do not match'
    return ''
  }

  function handleSubmit(e) {
    e.preventDefault()
    const v = validate()
    setError(v)
    if (v) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      alert(`Account created for ${name} (simulated)`)
      setName('')
      setEmail('')
      setPassword('')
      setConfirm('')
    }, 900)
  }

  return (
    <div className="card">
      <h2>Sign up</h2>
      <form className="auth-container" onSubmit={handleSubmit}>
        <div className="form-row">
          <label htmlFor="name">Full name</label>
          <input id="name" className="input" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} />
        </div>

        <div className="form-row">
          <label htmlFor="confirm">Confirm password</label>
          <input id="confirm" type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>

        {error && <div className="error">{error}</div>}

        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
          <button type="button" className="btn secondary" onClick={() => { setName(''); setEmail(''); setPassword(''); setConfirm(''); setError('') }}>Clear</button>
        </div>
      </form>
      <p className="muted" style={{marginTop:12}}>This demo only simulates account creation in the browser.</p>
    </div>
  )
}
