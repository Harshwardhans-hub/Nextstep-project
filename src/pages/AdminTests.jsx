import React, { useEffect, useState } from 'react'
import { Container, Row, Col, Card, Form, Button, Table, Alert, ListGroup } from 'react-bootstrap'
import { adminListTests, adminCreateTest, adminListQuestions, adminCreateQuestion, adminDeleteTest, adminDeleteQuestion } from '../lib/api'

export default function AdminTests() {
  const [tests, setTests] = useState([])
  const [selected, setSelected] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newTestName, setNewTestName] = useState('')
  const [qText, setQText] = useState('')
  const [qTopic, setQTopic] = useState('')
  const [qCorrect, setQCorrect] = useState('')

  async function refreshTests() {
    setLoading(true)
    setError('')
    try {
      const res = await adminListTests()
      setTests(res)
      if (res.length && !selected) {
        setSelected(res[0])
      }
    } catch (_) {
      setError('Failed to load tests')
    } finally {
      setLoading(false)
    }
  }

  async function refreshQuestions(testId) {
    try {
      const res = await adminListQuestions(testId)
      setQuestions(res)
    } catch (_) {
      setError('Failed to load questions')
    }
  }

  useEffect(() => { refreshTests() }, [])
  useEffect(() => { if (selected) refreshQuestions(selected.id) }, [selected])

  async function onCreateTest(e) {
    e.preventDefault()
    if (!newTestName.trim()) return
    try {
      const t = await adminCreateTest(newTestName.trim())
      setNewTestName('')
      await refreshTests()
      setSelected(t)
    } catch (_) {
      setError('Failed to create test')
    }
  }

  async function onCreateQuestion(e) {
    e.preventDefault()
    if (!selected || !qText.trim()) return
    try {
      await adminCreateQuestion({ test_id: selected.id, text: qText.trim(), topic: qTopic || null, correct: qCorrect || null })
      setQText(''); setQTopic(''); setQCorrect('')
      await refreshQuestions(selected.id)
    } catch (_) {
      setError('Failed to create question')
    }
  }

  return (
    <Container className="py-4">
      <Row className="g-3">
        <Col md={4}>
          <Card>
            <Card.Header>Tests</Card.Header>
            <Card.Body>
              <Form onSubmit={onCreateTest} className="mb-3">
                <Form.Label className="mb-1">New Test Name</Form.Label>
                <Form.Control value={newTestName} onChange={(e)=>setNewTestName(e.target.value)} placeholder="e.g. General Aptitude" />
                <Button type="submit" className="mt-2">Create</Button>
              </Form>
              {loading && <div className="text-muted">Loading...</div>}
              {!loading && (
                <ListGroup>
                  {tests.map(t => (
                    <ListGroup.Item key={t.id} action active={selected?.id===t.id}>
                      <div className="d-flex justify-content-between align-items-center" onClick={()=>setSelected(t)}>
                        <div>
                          <div className="fw-semibold">{t.name}</div>
                          <div className="text-muted small">#{t.id}</div>
                        </div>
                        <Button size="sm" variant="outline-danger" onClick={(e)=>{ e.stopPropagation(); onDeleteTest(t.id) }}>Delete</Button>
                      </div>
                    </ListGroup.Item>
                  ))}
                  {tests.length===0 && <ListGroup.Item className="text-muted">No tests</ListGroup.Item>}
                </ListGroup>
              )}
              {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
            </Card.Body>
          </Card>
        </Col>
        <Col md={8}>
          <Card>
            <Card.Header>Questions {selected ? `for: ${selected.name}` : ''}</Card.Header>
            <Card.Body>
              {selected ? (
                <>
                  <Form onSubmit={onCreateQuestion} className="mb-3">
                    <Row className="g-2">
                      <Col md={6}><Form.Control value={qText} onChange={(e)=>setQText(e.target.value)} placeholder="Question text" /></Col>
                      <Col md={3}><Form.Control value={qTopic} onChange={(e)=>setQTopic(e.target.value)} placeholder="Topic (opt)" /></Col>
                      <Col md={3}><Form.Control value={qCorrect} onChange={(e)=>setQCorrect(e.target.value)} placeholder="Correct (opt)" /></Col>
                    </Row>
                    <Button type="submit" className="mt-2">Add Question</Button>
                  </Form>
                  <Table striped hover size="sm">
                    <thead>
                      <tr><th>ID</th><th>Text</th><th>Topic</th><th>Correct</th><th></th></tr>
                    </thead>
                    <tbody>
                      {questions.map(q => (
                        <tr key={q.id}>
                          <td>{q.id}</td><td>{q.text}</td><td>{q.topic||'-'}</td><td>{q.correct||'-'}</td>
                          <td className="text-end"><Button size="sm" variant="outline-danger" onClick={async()=>{ try{ await adminDeleteQuestion(q.id); window.dispatchEvent(new CustomEvent('app:toast',{detail:{title:'Admin',body:'Question deleted',bg:'warning'}})); await refreshQuestions(selected.id) } catch(_){ setError('Failed to delete question') } }}>Delete</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {questions.length===0 && <div className="text-muted">No questions</div>}
                </>
              ) : (
                <div className="text-muted">Select or create a test to manage questions.</div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}
