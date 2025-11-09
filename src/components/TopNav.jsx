import React, { useEffect, useState } from 'react'
import { Container, Navbar, Nav, Form, Button, Toast, ToastContainer } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { getDashboard } from '../lib/api'

export default function TopNav() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    function onToast(e) {
      const detail = e.detail || {}
      const id = Date.now() + Math.random()
      setToasts(prev => [...prev, { id, title: detail.title || 'Notice', body: detail.body || '', bg: detail.bg || 'dark' }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, detail.timeout || 3000)
    }
    window.addEventListener('app:toast', onToast)
    return () => window.removeEventListener('app:toast', onToast)
  }, [])

  const [requiresTest, setRequiresTest] = useState(false)
  useEffect(() => {
    let active = true
    ;(async()=>{
      try{
        const d = await getDashboard()
        if (active && d?.requires_test) setRequiresTest(true)
      } catch(_) {}
    })()
    return ()=>{ active = false }
  }, [])

  return (
    <>
      <Navbar bg="light" className="mb-3" expand="md">
        <Container>
          <Navbar.Brand as={Link} to="/dashboard">NextStep</Navbar.Brand>
          <Navbar.Toggle aria-controls="topnav" />
          <Navbar.Collapse id="topnav">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/dashboard">Dashboard</Nav.Link>
              <Nav.Link as={Link} to="/roadmap">Roadmap</Nav.Link>
              <Nav.Link as={Link} to="/aptitude">Aptitude</Nav.Link>
              <Nav.Link as={Link} to="/portfolio">Portfolio</Nav.Link>
              <Nav.Link as={Link} to="/skill-gap">Start Learning</Nav.Link>
              <Nav.Link as={Link} to="/simulations">Simulations</Nav.Link>
              <Nav.Link as={Link} to="/reports">Reports</Nav.Link>
            </Nav>
            <Form className="d-flex">
              <Form.Control type="search" placeholder="Search careers..." className="me-2" />
              <Button variant="outline-success">Search</Button>
            </Form>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      {requiresTest && (
        <div className="w-100" style={{background:'#fff3cd', borderTop:'1px solid #ffe69c', borderBottom:'1px solid #ffe69c'}}>
          <Container className="py-2 d-flex justify-content-between align-items-center">
            <div className="small text-dark">Take the Aptitude Test to unlock personalized careers, skill gaps, and trends.</div>
            <Button size="sm" as={Link} to="/aptitude" variant="warning">Take Test</Button>
          </Container>
        </div>
      )}

      <ToastContainer position="top-end" className="p-3">
        {toasts.map(t => (
          <Toast key={t.id} bg={t.bg} onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
            <Toast.Header closeButton={true}>
              <strong className="me-auto">{t.title}</strong>
            </Toast.Header>
            <Toast.Body className="text-white">{t.body}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </>
  )
}
