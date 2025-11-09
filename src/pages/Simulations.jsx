import React, { useEffect, useState } from 'react'
import { Container, Row, Col, Card, Button, ListGroup, Form, Alert } from 'react-bootstrap'
import { getSimulations, scoreSimulation } from '../lib/api'

export default function Simulations() {
  const [sims, setSims] = useState([])
  const [active, setActive] = useState(null)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scoring, setScoring] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await getSimulations()
        setSims(res.scenarios || [])
      } catch (e) {
        setError('Failed to load simulations')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function loadSavedAnswers(simId) {
    try {
      const raw = localStorage.getItem(`sim_answers_${simId}`)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }

  function saveAnswers(simId, obj) {
    try { localStorage.setItem(`sim_answers_${simId}`, JSON.stringify(obj)) } catch {}
  }

  function choose(id, idx) {
    setAnswers(prev => {
      const next = { ...prev, [id]: idx }
      if (active?.id) saveAnswers(active.id, next)
      return next
    })
  }

  function clearActiveAnswers() {
    if (!active) return
    setAnswers({})
    setResult(null)
    try { localStorage.removeItem(`sim_answers_${active.id}`) } catch {}
  }

  async function onSubmit() {
    if (!active) return
    setError('')
    setScoring(true)
    try {
      const scored = await scoreSimulation(active.id, answers)
      setResult(scored)
      window.dispatchEvent(new CustomEvent('app:toast',{detail:{title:'Simulation Scored', body:`You scored ${Math.round(scored.score||0)}%.`, bg:'success'}}))
      // Notify the rest of the app to refresh widgets dependent on simulations
      window.dispatchEvent(new Event('app:data:updated'))
    } catch (e) {
      setError('Failed to score simulation')
    } finally {
      setScoring(false)
    }
  }

  return (
    <Container className="py-4">
      <Row className="g-3">
        <Col md={4}>
          <Card>
            <Card.Header>Career Simulations</Card.Header>
            <ListGroup variant="flush">
              {loading && <ListGroup.Item>Loading...</ListGroup.Item>}
              {!loading && sims.map(s => (
                <ListGroup.Item key={s.id} action active={active?.id===s.id} onClick={() => { setActive(s); setAnswers(loadSavedAnswers(s.id)); setResult(null) }}>
                  <div className="fw-semibold">{s.title}</div>
                  <div className="text-muted small">{s.career}</div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>
        <Col md={8}>
          {active ? (
            <Card>
              <Card.Body>
                <h5 className="mb-3">{active.title} <span className="badge bg-light text-dark ms-2">{active.career}</span></h5>
                <ListGroup className="mb-3">
                  {active.questions.map((q, i) => (
                    <ListGroup.Item key={q.id}>
                      <div className="fw-semibold mb-2">Q{i+1}. {q.text}</div>
                      {q.options.map((opt, idx) => (
                        <Form.Check
                          key={idx}
                          type="radio"
                          name={`sim_${q.id}`}
                          id={`sim_${q.id}_${idx}`}
                          label={opt}
                          checked={answers[q.id] === idx}
                          onChange={() => choose(q.id, idx)}
                          className="mb-1"
                        />
                      ))}
                    </ListGroup.Item>
                  ))}
                </ListGroup>
                <div className="d-flex gap-2">
                  <Button onClick={onSubmit} disabled={scoring}>{scoring ? 'Scoring...' : 'Submit'}</Button>
                  <Button variant="outline-secondary" onClick={clearActiveAnswers}>Clear answers</Button>
                  <Button variant="outline-primary" onClick={() => { setActive(null); setResult(null) }}>Change scenario</Button>
                </div>
                {result && (
                  <div className="mt-3">
                    <div className="h4 mb-1">Score: {result.score}%</div>
                    {Array.isArray(result.feedback) && result.feedback.length>0 && (
                      <>
                        <div className="fw-semibold">Feedback</div>
                        <ul>
                          {result.feedback.map((f, i) => (<li key={i}>{f}</li>))}
                        </ul>
                      </>
                    )}
                    {Array.isArray(result.recommendations) && result.recommendations.length>0 && (
                      <>
                        <div className="text-muted">Recommended:</div>
                        <ul className="mb-0">
                          {result.recommendations.map((r, i) => (
                            <li key={i}>{r.title} ({Math.round(r.suitability)}%)</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
              </Card.Body>
            </Card>
          ) : (
            <Card><Card.Body>Select a simulation to begin.</Card.Body></Card>
          )}
        </Col>
      </Row>
    </Container>
  )
}
