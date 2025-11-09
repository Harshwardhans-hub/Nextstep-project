import React from 'react'
import { Container, Row, Col, Card, Button, ProgressBar } from 'react-bootstrap'
import { LinkContainer } from 'react-router-bootstrap'
import { useEffect, useMemo, useState } from 'react'
import { getDashboard } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function StudentDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const { signOut } = useAuth?.() || { signOut: null }
  const navigate = useNavigate()

  const careersForStream = useMemo(() => {
    const all = data?.careers || []
    const rec = data?.stream_guidance?.recommended_stream
    if (!rec) return all
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
    const r = norm(rec)
    return all.filter(c => {
      const d = norm(c?.domain)
      return d ? d.includes(r) || r.includes(d) : false
    })
  }, [data])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await getDashboard()
        if (active) {
          setData(res)
          if (res?.requires_test) {
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { title: 'Action Required', body: 'Take the aptitude test to unlock career paths, skill gaps, and trends.', bg: 'warning' } }))
          }
        }
      } catch (e) {
        setError('Failed to load dashboard')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  // Live refresh after test submission
  useEffect(() => {
    async function refresh() {
      try {
        setLoading(true)
        const res = await getDashboard()
        setData(res)
      } catch(_) {} finally { setLoading(false) }
    }
    window.addEventListener('app:data:updated', refresh)
    return () => window.removeEventListener('app:data:updated', refresh)
  }, [])

  return (
    <Container className="py-4 dashboard-root">
      <header className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="dashboard-title">Learning Dashboard</h4>
          <div className="text-muted">Track your progress and discover new opportunities</div>
        </div>
        <div className="dashboard-meta d-none d-md-flex align-items-center gap-2">
          <input className="form-control" style={{width:320}} placeholder="Search modules, careers..." />
          <span className="rounded-circle bg-light d-inline-flex align-items-center justify-content-center" style={{width:36,height:36}}>🔔</span>
          <Button
            variant="outline-danger"
            size="sm"
            onClick={async()=>{
              try { if (typeof signOut === 'function') await signOut() } catch(_) {}
              try { localStorage.removeItem('id_token'); localStorage.removeItem('demo_uid'); localStorage.removeItem('demo_email') } catch {}
              window.dispatchEvent(new CustomEvent('app:toast',{detail:{title:'Signed out', body:'You have been logged out.', bg:'dark'}}))
              navigate('/login')
            }}
          >Logout</Button>
        </div>
      </header>

      {loading && <div className="text-muted">Loading...</div>}
      {error && <div className="text-danger">{error}</div>}

      {data && (
      <Row className="g-4">
        <Col md={6}>
          <Card className="dashboard-card">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div className="d-flex align-items-center gap-2">
                  <span className="badge rounded-circle bg-success-subtle text-success-emphasis d-inline-flex align-items-center justify-content-center" style={{width:32,height:32}}>📁</span>
                  <div>
                    <h5 className="mb-1">Portfolio</h5>
                    <div className="text-muted">Projects completed</div>
                  </div>
                </div>
                <div className="display-number">{data.portfolio?.count ?? 0}</div>
              </div>

              {/* Progress removed per request */}

              <div>
                <LinkContainer to="/portfolio">
                  <Button variant="success" className="w-100">View Portfolio</Button>
                </LinkContainer>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {data.requires_test ? (
          <Col md={6}>
            <Card className="dashboard-card">
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-3">
                  <span className="badge rounded-circle bg-warning-subtle text-warning-emphasis d-inline-flex align-items-center justify-content-center" style={{width:32,height:32}}>🧭</span>
                  <h5 className="mb-0">Start with Aptitude Test</h5>
                </div>
                <div className="text-muted mb-3">Take the aptitude test to unlock your personalized career paths, skill gaps, and trends.</div>
                <LinkContainer to="/aptitude">
                  <Button variant="warning" className="w-100">Take Aptitude Test</Button>
                </LinkContainer>
              </Card.Body>
            </Card>
          </Col>
        ) : (
          <Col md={6}>
            <Card className="dashboard-card">
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-3">
                  <span className="badge rounded-circle bg-warning-subtle text-warning-emphasis d-inline-flex align-items-center justify-content-center" style={{width:32,height:32}}>🗺️</span>
                  <h5 className="mb-0">Career Paths</h5>
                </div>
                {/* Career titles list hidden per request; keep only CTA */}
                <LinkContainer to="/roadmap">
                  <Button variant="warning" className="w-100">Explore Careers</Button>
                </LinkContainer>
              </Card.Body>
            </Card>
          </Col>
        )}

        {!data.requires_test && data.stream_guidance && (
          <Col md={6}>
            <Card className="dashboard-card">
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span className="badge rounded-circle bg-primary-subtle text-primary-emphasis d-inline-flex align-items-center justify-content-center" style={{width:32,height:32}}>🎯</span>
                  <h5 className="mb-0">Stream Guidance (11–12)</h5>
                </div>
                <div className="mb-2"><span className="text-muted">Recommended stream:</span> <span className="fw-semibold text-capitalize">{data.stream_guidance.recommended_stream}</span></div>
                {Array.isArray(data.stream_guidance.why) && data.stream_guidance.why.length > 0 && (
                  <div className="small text-muted mb-2">{data.stream_guidance.why[0]}</div>
                )}
                <div className="mb-2">
                  <div className="text-muted small">Suggested subjects in 11–12</div>
                  <div className="fw-semibold">{(data.stream_guidance.suggested_subjects_in_11_12||[]).join(', ')}</div>
                </div>
                <div className="mb-3">
                  <div className="text-muted small">Next steps</div>
                  <ul className="mb-0 small">
                    {(data.stream_guidance.next_steps||[]).map((s,i)=> (<li key={i}>{s}</li>))}
                  </ul>
                </div>
                <div className="d-grid gap-2">
                  <LinkContainer to="/roadmap"><Button variant="primary">Explore Careers</Button></LinkContainer>
                </div>
              </Card.Body>
            </Card>
          </Col>
        )}

        <Col md={6}>
          <Card className="dashboard-card">
            <Card.Body>
              <div className="d-flex align-items-center gap-2 mb-3">
                <span className="badge rounded-circle bg-info-subtle text-info-emphasis d-inline-flex align-items-center justify-content-center" style={{width:32,height:32}}>🧠</span>
                <h5 className="mb-0">Aptitude Test</h5>
              </div>
              {data.requires_test ? (
                <div className="mb-3 text-muted">No results yet. Take the test to see your scores and unlock recommendations.</div>
              ) : (
                <>
                  <div className="text-center mb-3">
                    <div className="big-score">{data.aptitude?.overall ?? 0}%</div>
                    <div className="text-muted">Overall Score</div>
                  </div>
                  <div className="mb-2">Logical <span className="float-end">{data.aptitude?.logical ?? 0}%</span>
                    <ProgressBar now={data.aptitude?.logical ?? 0} variant="success" />
                  </div>
                  <div className="mb-3">Creative <span className="float-end">{data.aptitude?.creative ?? 0}%</span>
                    <ProgressBar now={data.aptitude?.creative ?? 0} variant="warning" />
                  </div>
                </>
              )}
              <LinkContainer to="/aptitude">
                <Button variant="success" className="w-100">{data.requires_test ? 'Take Test' : 'Retake Test'}</Button>
              </LinkContainer>
            </Card.Body>
          </Card>
        </Col>

        {!data.requires_test && (
          <Col md={6}>
            <Card className="dashboard-card">
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-3">
                  <span className="badge rounded-circle bg-success-subtle text-success-emphasis d-inline-flex align-items-center justify-content-center" style={{width:32,height:32}}>📚</span>
                  <h5 className="mb-0">Skill Gaps</h5>
                </div>
                {Object.entries(data.skills || {}).map(([label, gap], idx) => (
                  <div key={label} className={`mb-${idx === Object.keys(data.skills||{}).length-1 ? '3':'2'}`}>
                    {label.replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase())}
                    <span className="float-end">{gap}%</span>
                    <ProgressBar now={gap} />
                  </div>
                ))}
                <LinkContainer to="/skill-gap">
                  <Button variant="success" className="w-100">Start Learning</Button>
                </LinkContainer>
              </Card.Body>
            </Card>
          </Col>
        )}

        

      </Row>
      )}
    </Container>
  )
}
