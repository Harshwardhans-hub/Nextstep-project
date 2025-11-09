import React, { useEffect, useMemo, useState } from 'react'
import { Container, Row, Col, Card, Form, Button, Badge, ListGroup } from 'react-bootstrap'
import { getCareers, getTrends, getDashboard } from '../lib/api'
import { listBookmarks, addBookmark, deleteBookmark } from '../lib/api'

export default function Library() {
  const [careers, setCareers] = useState([])
  const [trends, setTrends] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('all')
  const [sort, setSort] = useState('fit')
  const [fitMap, setFitMap] = useState({})
  const [requiresTest, setRequiresTest] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [c, t, d, b] = await Promise.all([
          getCareers(),
          getTrends().catch(()=>({ roles: [] })),
          getDashboard(),
          listBookmarks().catch(()=>[])
        ])
        if (!active) return
        if (c?.requires_test || d?.requires_test || t?.requires_test) {
          setRequiresTest(true)
          setLoading(false)
          return
        }
        setCareers(c.careers || [])
        setTrends((t.roles || []))
        const fm = {}
        for (const rec of (d.careers || [])) fm[rec.title] = rec.suitability || 0
        for (const role of (t.roles || [])) fm[role.title] = Math.max(fm[role.title] || 0, role.demand || 0)
        setFitMap(fm)
        setBookmarks(b)
      } catch (e) {
        setError('Failed to load library')
      } finally {
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => {
    let list = careers.map(c => ({ ...c, fit: fitMap[c.title] || 50 }))
    if (query.trim()) list = list.filter(x => x.title.toLowerCase().includes(query.toLowerCase()))
    if (domain !== 'all') list = list.filter(x => (x.domain || 'general') === domain)
    if (sort === 'fit') list = list.sort((a,b)=> (b.fit||0)-(a.fit||0))
    if (sort === 'salary') list = list.sort((a,b)=> (b.median_salary||0)-(a.median_salary||0))
    return list
  }, [careers, fitMap, query, domain, sort])

  function isBookmarked(title){
    return bookmarks.some(b => b.title === title)
  }

  async function toggleBookmark(title){
    try{
      const existing = bookmarks.find(b => b.title === title)
      if (existing){
        await deleteBookmark(existing.id)
        setBookmarks(prev => prev.filter(x => x.id !== existing.id))
        window.dispatchEvent(new CustomEvent('app:toast',{detail:{title:'Library', body:'Removed bookmark', bg:'warning'}}))
      } else {
        const res = await addBookmark(title)
        setBookmarks(prev => [{ id: res.id, title, created_at: new Date().toISOString() }, ...prev])
        window.dispatchEvent(new CustomEvent('app:toast',{detail:{title:'Library', body:'Bookmarked', bg:'success'}}))
      }
    } catch(_){ /* ignore */ }
  }

  return (
    <Container className="py-4">
      <Row className="mb-3 g-2">
        <Col md={4}><Form.Control placeholder="Search careers" value={query} onChange={(e)=>setQuery(e.target.value)} /></Col>
        <Col md={3}>
          <Form.Select value={domain} onChange={(e)=>setDomain(e.target.value)}>
            <option value="all">All Domains</option>
            <option value="tech">Tech</option>
            <option value="design">Design</option>
            <option value="business">Business</option>
          </Form.Select>
        </Col>
        <Col md={3}>
          <Form.Select value={sort} onChange={(e)=>setSort(e.target.value)}>
            <option value="fit">Sort by Fit</option>
            <option value="salary">Sort by Salary</option>
          </Form.Select>
        </Col>
      </Row>

      {loading && <div className="text-muted">Loading...</div>}
      {error && <div className="text-danger">{error}</div>}
      {requiresTest && !loading && (
        <Card className="mb-3">
          <Card.Body className="d-flex justify-content-between align-items-center">
            <div className="text-muted">Take the Aptitude Test to unlock Library recommendations.</div>
            <Button href="/aptitude" variant="warning">Take Test</Button>
          </Card.Body>
        </Card>
      )}

      <Row className="g-3">
        {!requiresTest && filtered.map((c, idx) => (
          <Col md={6} key={idx}>
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <div className="h6 mb-1">{c.title} <Badge bg="light" text="dark" className="ms-2">Fit {c.fit || 0}</Badge></div>
                    {c.median_salary && <div className="small text-muted">Median salary: ${c.median_salary}k</div>}
                    <div className="small text-muted mt-1">Why it fits you: high alignment with your latest aptitude and recommendations.</div>
                  </div>
                  <Button size="sm" variant={isBookmarked(c.title)? 'warning':'outline-secondary'} onClick={()=>toggleBookmark(c.title)}>
                    {isBookmarked(c.title) ? 'Bookmarked' : 'Bookmark'}
                  </Button>
                </div>
                {c.steps && (
                  <>
                    <div className="mt-3 fw-semibold">Steps</div>
                    <ListGroup className="mb-2">
                      {c.steps.map((s,i)=>(<ListGroup.Item key={i}>{s}</ListGroup.Item>))}
                    </ListGroup>
                  </>
                )}
                {c.resources && (
                  <>
                    <div className="fw-semibold">Resources</div>
                    <div>
                      {c.resources.map((r,i)=>(<div key={i}><a href={r.url} target="_blank" rel="noreferrer">{r.name}</a></div>))}
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        ))}
        {!requiresTest && filtered.length===0 && !loading && <Col><div className="text-muted">No careers match your filters.</div></Col>}
      </Row>
    </Container>
  )
}
