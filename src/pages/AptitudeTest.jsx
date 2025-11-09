import React, { useEffect, useState } from 'react'
import { Container, Card, Form, Button, Row, Col, Alert, ProgressBar, ListGroup, Badge } from 'react-bootstrap'
import { submitAptitude, getProfile, getQuestions } from '../lib/api'
import { useNavigate } from 'react-router-dom'

export default function AptitudeTest() {
  const [studentClass, setStudentClass] = useState('10')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loadingBank, setLoadingBank] = useState(true)
  const [timeLeft, setTimeLeft] = useState(30*60) // 30 minutes
  const [submitted, setSubmitted] = useState(false)
  const [showUnansweredOnly, setShowUnansweredOnly] = useState(false)
  const [stream, setStream] = useState('') // for class 11/12: engineering, biology, humanities, commerce
  const [requiresReg, setRequiresReg] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const prof = await getProfile().catch(() => ({ student_class: '10' }))
        const cls = String(prof?.student_class || '10')
        if (active) setStudentClass(cls)
        // If registration incomplete (missing class), block test and show banner
        if (!prof?.student_class) {
          if (active) { setRequiresReg(true); setLoadingBank(false) }
          return
        }
        // For class 11/12, wait for stream selection before fetching
        if (cls === '11' || cls === '12') {
          setLoadingBank(false)
          return
        }
        const bank = await getQuestions(cls)
        if (active) setQuestions(bank.questions || [])
        const saved = localStorage.getItem('apt_answers')
        if (saved) setAnswers(JSON.parse(saved))
      } catch (e) {
        setError('Failed to load questions')
      } finally {
        if (active) setLoadingBank(false)
      }
    })()
    return () => { active = false }
  }, [])

  // Fetch after stream is selected for 11/12
  useEffect(() => {
    let active = true
    ;(async () => {
      if (!(studentClass === '11' || studentClass === '12')) return
      if (!stream) return
      setLoadingBank(true)
      try {
        const bank = await getQuestions(studentClass, stream)
        if (active) setQuestions(bank.questions || [])
        const saved = localStorage.getItem('apt_answers')
        if (saved) setAnswers(JSON.parse(saved))
      } catch (e) {
        setError('Failed to load questions')
      } finally {
        if (active) setLoadingBank(false)
      }
    })()
    return () => { active = false }
  }, [studentClass, stream])

  function choose(qid, idx) {
    setAnswers(prev => ({ ...prev, [qid]: idx }))
    setTimeout(() => localStorage.setItem('apt_answers', JSON.stringify({ ...answers, [qid]: idx })), 0)
  }

  function clearSelections() {
    setAnswers({})
    try { localStorage.removeItem('apt_answers') } catch {}
    setSubmitted(false)
    window.dispatchEvent(new CustomEvent('app:toast',{detail:{title:'Selections Cleared', body:'All selected answers have been reset.', bg:'dark'}}))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const total = questions.length
      const answeredCount = Object.keys(answers).filter(k => answers[k] !== undefined).length
      if (answeredCount < total) {
        const proceed = window.confirm(`You have ${total - answeredCount} unanswered questions. Submit anyway?`)
        if (!proceed) { setLoading(false); return }
      }
      // Compute subject-wise percentage correct
      const totals = {}
      const corrects = {}
      for (const q of questions) {
        const subj = String(q.domain || '').toLowerCase() || 'general'
        totals[subj] = (totals[subj] || 0) + 1
        const sel = answers[q.id]
        if (sel === q.answer) corrects[subj] = (corrects[subj] || 0) + 1
      }
      const breakdown = {}
      let sum = 0, count = 0
      Object.keys(totals).forEach(s => {
        const pct = totals[s] ? Math.round(( (corrects[s]||0) / totals[s]) * 100) : 0
        breakdown[s] = pct
        sum += pct; count += 1
      })
      const overall = count ? Math.round(sum / count) : 0
      const res = await submitAptitude({ score: overall, breakdown })
      setResult(res)
      setSubmitted(true)
      // Auto-scroll to top to show results
      window.scrollTo({ top: 0, behavior: 'smooth' })
      try { localStorage.removeItem('apt_answers') } catch {}
      window.dispatchEvent(new CustomEvent('app:toast',{detail:{title:'Aptitude Test Complete!', body:'Check your results and head to the dashboard.', bg:'success'}}))
      // Notify the app that data depending on aptitude should refresh (dashboard, skill gap, etc.)
      window.dispatchEvent(new Event('app:data:updated'))
    } catch (e) {
      setError('Failed to submit test')
    } finally {
      setLoading(false)
    }
  }

  // Countdown timer
  useEffect(() => {
    if (loadingBank || submitted) return
    if (timeLeft <= 0) {
      if (!submitted) onSubmit(new Event('submit'))
      return
    }
    const t = setTimeout(() => setTimeLeft(timeLeft-1), 1000)
    return () => clearTimeout(t)
  }, [timeLeft, loadingBank, submitted])

  const total = questions.length
  const answeredCount = Object.keys(answers).filter(k => answers[k] !== undefined).length
  const progress = total ? Math.round((answeredCount/total)*100) : 0

  // Group questions by subject/domain for rendering
  const bySubject = {}
  for (const q of questions) {
    const subj = String(q.domain || 'general')
    if (!bySubject[subj]) bySubject[subj] = []
    if (!showUnansweredOnly || answers[q.id] === undefined) bySubject[subj].push(q)
  }

  if (requiresReg) {
    return (
      <Container className="py-4">
        <Row>
          <Col md={{ span:8, offset:2 }}>
            <Card className="border-warning">
              <Card.Body>
                <h5 className="mb-2">Registration Required</h5>
                <div className="text-muted mb-3">
                  Please complete registration and select your class before attempting the aptitude test. This ensures questions and recommendations are tailored for you.
                </div>
                <div className="d-flex gap-2">
                  <Button variant="warning" onClick={()=>navigate('/register')}>Go to Registration</Button>
                  <Button variant="outline-secondary" onClick={()=>navigate('/dashboard')}>Back to Dashboard</Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    )
  }

  return (
    <Container className="py-4">
      <Row>
        <Col md={7}>
          <Card className="mb-3">
            <Card.Body>
              <h5 className="mb-3">Aptitude Test</h5>
              {!loadingBank && (
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div className="small text-muted">Class: {studentClass}</div>
                  <div>
                    <Badge bg={timeLeft<60? 'danger':'secondary'} className="me-2">{Math.floor(timeLeft/60)}:{String(timeLeft%60).padStart(2,'0')}</Badge>
                    <Badge bg="info">Progress {progress}%</Badge>
                  </div>
                </div>
              )}
              {!loadingBank && (
                <Alert variant="light" className="border">
                  <div className="fw-semibold mb-1">Instructions</div>
                  <div className="small text-muted">
                    - You have 30 minutes to complete the test.
                    <br />- Choose the best answer for each question. You can submit early.
                    <br />- Use the toggle below to focus on unanswered questions.
                  </div>
                </Alert>
              )}
              {loadingBank && <div className="text-muted">Loading questions...</div>}
              {!loadingBank && (
                <Form onSubmit={onSubmit}>
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <Form.Check
                      type="switch"
                      id="toggle-unanswered"
                      label="Show unanswered only"
                      checked={showUnansweredOnly}
                      onChange={(e)=>setShowUnansweredOnly(e.target.checked)}
                    />
                    <div className="d-flex align-items-center gap-2">
                      <Button size="sm" variant="outline-secondary" onClick={clearSelections}>Clear selections</Button>
                      <span className="small text-muted">Answered {answeredCount} / {total}</span>
                    </div>
                  </div>
                  {Object.keys(bySubject).map((subj) => (
                    <div key={subj} className="mb-3">
                      <h6 className="mt-2 text-capitalize">{subj}</h6>
                      <ListGroup>
                        {bySubject[subj].map((q, idx) => (
                          <ListGroup.Item key={q.id}>
                            <div className="fw-semibold mb-2">{idx+1}. {q.text} <span className="badge bg-light text-dark ms-2">{q.domain}</span></div>
                            <div>
                              {q.options.map((opt, i) => (
                                <Form.Check
                                  key={i}
                                  type="radio"
                                  name={`q_${q.id}`}
                                  id={`q_${q.id}_${i}`}
                                  label={opt}
                                  checked={answers[q.id] === i}
                                  onChange={() => choose(q.id, i)}
                                  className="mb-1"
                                />
                              ))}
                            </div>
                          </ListGroup.Item>
                        ))}
                      </ListGroup>
                    </div>
                  ))}
                  <Button type="submit" disabled={loading}>{loading ? 'Evaluating...' : 'Submit Test'}</Button>
                </Form>
              )}
              {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
            </Card.Body>
          </Card>
        </Col>
        <Col md={5}>
          {(studentClass === '11' || studentClass === '12') && !stream && (
            <Card className="mb-3">
              <Card.Body>
                <div className="fw-semibold mb-2">Select your stream to start the test</div>
                <div className="d-grid gap-2">
                  {['engineering','biology','humanities','commerce'].map(s => (
                    <Button key={s} variant="outline-primary" onClick={()=>setStream(s)} className="text-capitalize">{s}</Button>
                  ))}
                </div>
              </Card.Body>
            </Card>
          )}
          {result && (
            <>
              <Card className="mb-3 border-success">
                <Card.Body>
                  <div className="text-center mb-3">
                    <div className="badge bg-success mb-2" style={{fontSize:'1rem',padding:'0.5rem 1rem'}}>✓ Test Complete!</div>
                    <h5>What's Next?</h5>
                    <p className="text-muted mb-0">Your personalized career paths, skill gaps, and learning resources are now ready on your dashboard.</p>
                  </div>
                  <Button variant="primary" size="lg" className="w-100" onClick={() => navigate('/dashboard')}>
                    Go to Dashboard →
                  </Button>
                </Card.Body>
              </Card>
              <Card>
                <Card.Body>
                  <h5 className="mb-3">Your Results</h5>
                  <div className="display-6">{Math.round(result.score)}%</div>
                  <div className="text-muted">Overall Score</div>
                  {Object.keys(result.breakdown || {}).map((k)=> (
                    <div key={k} className="mt-2 text-capitalize">{k} <span className="float-end">{result.breakdown[k]}%</span>
                      <ProgressBar now={result.breakdown[k]} />
                    </div>
                  ))}
                  <div className="mt-3 small">
                    <div className="fw-semibold mb-1">Explanations</div>
                    <div className="text-muted">We show the correct answer for each question you attempted. Review and retry to improve your score.</div>
                    <ul className="mt-2">
                      {questions.filter(q=>answers[q.id]!==undefined).map(q => (
                        <li key={`exp_${q.id}`}>Q: {q.text} — Correct: <span className="text-success">{q.options[q.answer]}</span>{answers[q.id]===q.answer? ' (You got it right)':''}</li>
                      ))}
                    </ul>
                  </div>
                </Card.Body>
              </Card>
            </>
          )}
        </Col>
      </Row>
    </Container>
  )
}
