import React, { useEffect, useState } from 'react'
import { Container, Row, Col, Card, Button, Form, ListGroup } from 'react-bootstrap'
import { supabase } from '../lib/supabase'
import { listPortfolio, addPortfolio, updatePortfolio, deletePortfolio } from '../lib/api'

const BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'portfolio'

export default function Portfolio() {
  const [items, setItems] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [editing, setEditing] = useState(null)
  const [editDesc, setEditDesc] = useState('')
  const [editTags, setEditTags] = useState('')

  async function refresh() {
    try {
      const data = await listPortfolio()
      setItems(data)
    } catch (e) {
      setError('Failed to load portfolio: ' + (e?.message || 'Unknown error'))
    }
  }

  useEffect(() => { refresh() }, [])

  async function onUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    setInfo('')
    try {
      const uid = localStorage.getItem('demo_uid') || 'demo-user'
      const path = `${uid}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600'
      })
      if (upErr) {
        throw new Error(`Supabase upload error: ${upErr.message || upErr.error || 'unknown'}`)
      }
      const { data: publicUrl, error: pubErr } = supabase.storage.from(BUCKET).getPublicUrl(path)
      if (pubErr) {
        throw new Error(`Supabase public URL error: ${pubErr.message || 'unknown'}`)
      }
      const name = file.name
      await addPortfolio({ name, url: publicUrl.publicUrl })
      await refresh()
      setInfo('Upload successful')
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { title: 'Upload', body: 'Portfolio item added', bg: 'success' } }))
    } catch (err) {
      setError(typeof err === 'string' ? err : (err?.message || 'Upload failed'))
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { title: 'Upload Failed', body: (err?.message || 'Upload failed'), bg: 'danger' } }))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <Container className="py-4">
      <Row className="g-3">
        <Col md={5}>
          <Card>
            <Card.Body>
              <h5 className="mb-3">Upload Certificate / Achievement</h5>
              <Form.Group controlId="file">
                <Form.Control type="file" accept="image/*,application/pdf" onChange={onUpload} disabled={uploading} />
              </Form.Group>
              {uploading && <div className="text-muted mt-2">Uploading...</div>}
              {info && <div className="text-success mt-2">{info}</div>}
              {error && <div className="text-danger mt-2">{error}</div>}
              <div className="small text-muted mt-2">Bucket: {BUCKET}</div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={7}>
          <Card>
            <Card.Header>My Portfolio</Card.Header>
            <ListGroup variant="flush">
              {items.map(i => (
                <ListGroup.Item key={i.id}>
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="fw-semibold">{i.name}</div>
                      <div className="small text-muted">{new Date(i.created_at).toLocaleString()}</div>
                      <div className="mt-1">
                        <a href={i.url} target="_blank" rel="noreferrer">View</a>
                      </div>
                      {editing === i.id ? (
                        <div className="mt-2">
                          <Form.Control className="mb-2" placeholder="Description" value={editDesc} onChange={(e)=>setEditDesc(e.target.value)} />
                          <Form.Control className="mb-2" placeholder="Tags (comma separated)" value={editTags} onChange={(e)=>setEditTags(e.target.value)} />
                          <div className="d-flex gap-2">
                            <Button size="sm" onClick={async()=>{ await updatePortfolio(i.id, { description: editDesc, tags: editTags }); setEditing(null); await refresh(); window.dispatchEvent(new CustomEvent('app:toast',{detail:{title:'Portfolio', body:'Updated', bg:'success'}}))}}>Save</Button>
                            <Button size="sm" variant="outline-secondary" onClick={()=>setEditing(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 small">
                          {i.description && <div><span className="text-muted">Description:</span> {i.description}</div>}
                          {i.tags && <div><span className="text-muted">Tags:</span> {i.tags}</div>}
                        </div>
                      )}
                    </div>
                    <div className="d-flex flex-column gap-2">
                      {editing === i.id ? null : <Button size="sm" variant="outline-primary" onClick={()=>{ setEditing(i.id); setEditDesc(i.description || ''); setEditTags(i.tags || '') }}>Edit</Button>}
                      <Button size="sm" variant="outline-danger" onClick={async()=>{ await deletePortfolio(i.id); await refresh(); window.dispatchEvent(new CustomEvent('app:toast',{detail:{title:'Portfolio', body:'Deleted', bg:'warning'}}))}}>Delete</Button>
                    </div>
                  </div>
                </ListGroup.Item>
              ))}
              {items.length === 0 && <ListGroup.Item className="text-muted">No items yet</ListGroup.Item>}
            </ListGroup>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}
