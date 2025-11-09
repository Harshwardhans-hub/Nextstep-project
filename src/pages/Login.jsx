import React, { useState } from 'react'
import { Container, Row, Col, Form, Button, Image } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import '../styles/login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signInEmail, signInGoogle } = useAuth()
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    // basic client-side validation
    if (!email || !password) {
      alert('Please provide email and password')
      return
    }
    setLoading(true)
    signInEmail(email, password)
      .then(() => {
        // Set per-user demo headers for backend dev mode
        try {
          localStorage.setItem('demo_uid', email)
          localStorage.setItem('demo_email', email)
          // Clear any stale token if not using Firebase tokens
          if (!localStorage.getItem('id_token')) {
            // no-op
          }
        } catch {}
        navigate('/dashboard')
      })
      .catch(err => alert(err.message))
      .finally(() => setLoading(false))
  }

  async function handleGoogle() {
    setLoading(true)
    try {
      await signInGoogle()
      // Best-effort: if Firebase token not stored by context, fall back to demo headers using entered email (if any)
      try {
        if (!localStorage.getItem('id_token') && email) {
          localStorage.setItem('demo_uid', email)
          localStorage.setItem('demo_email', email)
        }
      } catch {}
      navigate('/dashboard')
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container fluid className="p-0 login-hero">
      <Row className="g-0 min-vh-100">
        {/* Left gradient hero */}
        <Col md={6} className="d-flex flex-column align-items-center justify-content-center text-white p-4 hero-col">
          <div className="text-center" style={{maxWidth: 520}}>
            <h1 className="fw-bold mb-2">Your Future Starts Here</h1>
            <div className="opacity-75 mb-4">Join thousands of students who found their perfect career path</div>
            <div className="p-3 rounded-4 bg-white bg-opacity-10 backdrop-blur">
              <div className="rounded-4 bg-white shadow hero-illustration d-flex align-items-center justify-content-center">
                <Image src="/images/illustration.svg" alt="illustration" className="img-fluid" />
              </div>
            </div>
          </div>
        </Col>
        {/* Right auth panel */}
        <Col md={6} className="d-flex align-items-center justify-content-center p-4 auth-bg">
          <div className="auth-card p-4 bg-white rounded-4 shadow-sm" style={{maxWidth: 420, width: '100%'}}>
            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="rounded-circle brand-icon d-inline-flex align-items-center justify-content-center">
                <span className="text-white fw-bold">N</span>
              </div>
              <div>
                <div className="fw-semibold">NextStep</div>
                <div className="text-muted small">Helping Students Take the Right Step Ahead</div>
              </div>
            </div>
            <h4 className="mt-3 mb-1">Welcome Back!</h4>
            <div className="text-muted mb-3">Sign in to continue your career journey</div>
            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3">
                <Form.Label>Email Address</Form.Label>
                <div className="input-group input-group-lg">
                  <span className="input-group-text bg-white border-end-0">✉️</span>
                  <Form.Control
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="border-start-0"
                  />
                </div>
              </Form.Group>

              <Form.Group className="mb-2">
                <Form.Label>Password</Form.Label>
                <div className="input-group input-group-lg">
                  <span className="input-group-text bg-white border-end-0">🔒</span>
                  <Form.Control
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="border-start-0"
                  />
                </div>
              </Form.Group>
              <div className="text-end mb-3">
                <a href="#" className="small">Forgot password?</a>
              </div>

              <div className="d-grid mb-3">
                <Button variant="success" type="submit" disabled={loading} className="py-2 rounded-3 gradient-btn">
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </div>

              <div className="d-flex align-items-center mb-3">
                <div className="flex-grow-1 border-top" />
                <span className="px-2 text-muted small">or continue with</span>
                <div className="flex-grow-1 border-top" />
              </div>

              <div className="d-grid">
                <Button variant="light" type="button" onClick={handleGoogle} disabled={loading} className="google-btn">
                  <span className="me-2">🟢</span> Continue with Google
                </Button>
              </div>
            </Form>

            <div className="mt-3 text-center">
              <span className="text-muted">Don't have an account?</span>{' '}
              <Link to="/register" className="register-link">Register now</Link>
            </div>
          </div>
        </Col>
      </Row>
    </Container>
  )
}
