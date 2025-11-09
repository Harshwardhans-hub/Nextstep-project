import React, { useEffect, useMemo, useState } from 'react'
import { Container, Row, Col, Card, ProgressBar } from 'react-bootstrap'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'
import { getReports, getPlan } from '../lib/api'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export default function Reports(){
  const [reports, setReports] = useState({ scores: [], portfolio: [] })
  const [plan, setPlan] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(()=>{
    let active = true
    ;(async()=>{
      try{
        const [r, p] = await Promise.all([getReports(), getPlan().catch(()=>({goals:[]}))])
        if (!active) return
        setReports(r)
        setPlan(p.goals || [])
      }catch(e){ setError('Failed to load reports') }
      finally{ setLoading(false) }
    })()
    return ()=>{ active = false }
  },[])

  const scoreData = useMemo(()=>({
    labels: reports.scores.map(s=> new Date(s.t).toLocaleDateString()),
    datasets: [{ label: 'Aptitude Score', data: reports.scores.map(s=> s.score), borderColor: '#0ea5a6', backgroundColor: 'rgba(14,165,166,0.2)' }]
  }), [reports])

  const portfolioData = useMemo(()=>({
    labels: reports.portfolio.map(s=> s.t),
    datasets: [{ label: 'Portfolio Items', data: reports.portfolio.map(s=> s.count), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)' }]
  }), [reports])

  const planProgress = useMemo(()=>{
    if (!plan.length) return 0
    const done = plan.filter(g=>g.done).length
    return Math.round((done/plan.length)*100)
  }, [plan])

  return (
    <Container className="py-4">
      <Row className="g-3">
        <Col md={8}>
          <Card>
            <Card.Body>
              <h5 className="mb-3">Aptitude Score History</h5>
              {loading? <div className="text-muted">Loading...</div> : (error? <div className="text-danger">{error}</div> : <Line data={scoreData} options={{ responsive: true, plugins:{ legend:{position:'top'} } }} />)}
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card>
            <Card.Body>
              <h6 className="mb-2">Learning Plan Progress</h6>
              <div className="mb-2">{planProgress}% complete</div>
              <ProgressBar now={planProgress} />
              <div className="small text-muted mt-2">Based on completed planner tasks.</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <Row className="g-3 mt-1">
        <Col>
          <Card>
            <Card.Body>
              <h5 className="mb-3">Portfolio Growth</h5>
              {loading? <div className="text-muted">Loading...</div> : (error? <div className="text-danger">{error}</div> : <Line data={portfolioData} options={{ responsive:true, plugins:{ legend:{position:'top'} } }} />)}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}
