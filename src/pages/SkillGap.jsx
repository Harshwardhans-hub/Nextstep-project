import React, { useEffect, useState } from 'react'
import { Container, Row, Col, Card, ListGroup, Badge, ProgressBar } from 'react-bootstrap'
import { Radar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { getSkillGap } from '../lib/api'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

function toChart(skills, user, target, targetLabel = 'Required Target') {
  return {
    labels: skills,
    datasets: [
      {
        label: 'My Skills',
        data: user,
        backgroundColor: 'rgba(20, 184, 166, 0.2)',
        borderColor: 'rgb(20, 184, 166)',
        borderWidth: 1,
      },
      {
        label: targetLabel,
        data: target,
        backgroundColor: 'rgba(107, 114, 128, 0.2)',
        borderColor: 'rgb(107, 114, 128)',
        borderWidth: 1,
      },
    ],
  }
}

const options = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    r: {
      suggestedMin: 0,
      suggestedMax: 10,
      ticks: { stepSize: 1 },
    },
  },
}

export default function SkillGap() {
  const [chart, setChart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gaps, setGaps] = useState([])
  const [recs, setRecs] = useState([])
  const [requiresTest, setRequiresTest] = useState(false)

  async function load() {
    try {
      setLoading(true)
      const res = await getSkillGap()
      if (res.requires_test) {
        setRequiresTest(true)
        setChart(null)
        setGaps([])
        setRecs([])
      } else {
        setRequiresTest(false)
        setChart(toChart(res.skills, res.user, res.target, res.target_label || 'Required Target'))
        setGaps(res.gaps || [])
        setRecs(res.recommendations || [])
      }
    } catch (e) {
      setError('Failed to load skill gap')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Live refresh after test submission
  useEffect(() => {
    function onUpdated() { load() }
    window.addEventListener('app:data:updated', onUpdated)
    return () => window.removeEventListener('app:data:updated', onUpdated)
  }, [])


  return (
    <Container className="py-4">
      <Row>
        <Col md={6}>
          <Card>
            <Card.Body style={{ height: 420 }}>
              <h5>Skill Gap Radar</h5>
              <div style={{ height: '360px' }}>
                {loading && <div className="text-muted">Loading...</div>}
                {error && <div className="text-danger">{error}</div>}
                {requiresTest && !loading && (
                  <div className="text-muted">Take the aptitude test to unlock your personalized skill gaps.</div>
                )}
                {!requiresTest && chart && <Radar data={chart} options={options} />}
                {!requiresTest && !chart && !loading && (
                  <div className="text-muted">No data available. Try taking the aptitude test first.</div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span>Top Skill Gaps</span>
              {!loading && gaps.length > 0 && (
                <Badge bg="light" text="dark">{gaps.length} skills</Badge>
              )}
            </Card.Header>
            <Card.Body>
              {loading && <div className="text-muted">Loading...</div>}
              {error && <div className="text-danger">{error}</div>}
              {requiresTest && !loading && (
                <div>
                  <div className="text-muted mb-3">Please take the aptitude test to see your top gaps and learning resources.</div>
                  <a className="btn btn-success" href="/aptitude">Take Aptitude Test</a>
                </div>
              )}
              {!requiresTest && !loading && gaps.length === 0 && <div className="text-muted">No gaps detected — great job!</div>}

              {!requiresTest && gaps.slice(0,5).map((g, idx) => (
                <div key={idx} className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <div className="fw-semibold">{g.skill}</div>
                    <div className="text-muted small">Gap {g.gap}%</div>
                  </div>
                  <ProgressBar now={g.gap} />
                </div>
              ))}
              <hr />
              <h6 className="mb-2">Suggested Learning Resources</h6>
              <ListGroup variant="flush">
                {!requiresTest && recs.map((r, i) => (
                  <ListGroup.Item key={i}>
                    <div className="fw-semibold mb-1">{r.skill}</div>
                    {(r.resources||[]).map((res, j) => (
                      <div key={j}><a href={res.url} target="_blank" rel="noreferrer">{res.name}</a></div>
                    ))}
                  </ListGroup.Item>
                ))}
                {requiresTest && <ListGroup.Item className="text-muted">Resources will appear after your first test.</ListGroup.Item>}
              </ListGroup>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}

