import React, { useState } from 'react'
import { Container, Row, Col, Form, Button, Card } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { saveProfile } from '../lib/api'
import { useNavigate } from 'react-router-dom'

export default function Register() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [studentClass, setStudentClass] = useState('9')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const { registerEmail } = useAuth()
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    // basic validation
    if (!firstName || !lastName || !email || !password || !confirm) {
      alert('Please fill all required fields')
      return
    }
    if (password !== confirm) {
      alert('Passwords do not match')
      return
    }

    setLoading(true)
    registerEmail(email, password)
      .then(async () => {
        await saveProfile({
          first_name: firstName,
          last_name: lastName,
          student_class: studentClass,
          parent_phone: phone,
        })
        // Demo headers are now set automatically in AuthContext on login
        navigate('/dashboard')
      })
      .catch(err => {
        if (err.message && err.message.includes('email-already-in-use')) {
          alert('This email is already registered. Redirecting you to login page...')
          setTimeout(() => navigate('/login'), 2000)
        } else {
          alert(err.message)
        }
      })
      .finally(() => setLoading(false))
  }

  return (
    <Container className="d-flex align-items-center justify-content-center" style={{minHeight: '80vh'}}>
      <Row className="w-100 justify-content-center">
        <Col xs={12} md={6} lg={5}>
          <Card>
            <Card.Body>
              <h4 className="mb-3">Create an account</h4>
              <Form onSubmit={handleSubmit}>
                <Row className="mb-3">
                  <Col>
                    <Form.Group controlId="firstName">
                      <Form.Label>First Name</Form.Label>
                      <Form.Control value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
                    </Form.Group>
                  </Col>

                  <Col>
                    <Form.Group controlId="lastName">
                      <Form.Label>Last Name</Form.Label>
                      <Form.Control value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3" controlId="email">
                  <Form.Label>Email</Form.Label>
                  <Form.Control type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
                </Form.Group>

                <Row className="mb-3">
                  <Col>
                    <Form.Group controlId="password">
                      <Form.Label>Password</Form.Label>
                      <Form.Control type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
                    </Form.Group>
                  </Col>

                  <Col>
                    <Form.Group controlId="confirmPassword">
                      <Form.Label>Confirm Password</Form.Label>
                      <Form.Control type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm password" />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3" controlId="classSelect">
                  <Form.Label>Class</Form.Label>
                  <Form.Select value={studentClass} onChange={e => setStudentClass(e.target.value)}>
                    <option value="9">9</option>
                    <option value="10">10</option>
                    <option value="11">11</option>
                    <option value="12">12</option>
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3" controlId="phone">
                  <Form.Label>Parent Contact Details (Phone Number)</Form.Label>
                  <Form.Control value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +91 XXXXXXXXXX" />
                </Form.Group>

                <div className="d-grid gap-2">
                  <Button variant="primary" type="submit" disabled={loading}>
                    {loading ? 'Registering...' : 'Register'}
                  </Button>
                </div>
              </Form>

              <div className="mt-3 text-center">
                <Link to="/login">Already have an account? Sign In.</Link>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}
