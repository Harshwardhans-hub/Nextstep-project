import React from 'react'
import { Container, Table, Button, ButtonGroup } from 'react-bootstrap'
import { useEffect, useState } from 'react'
import { getAdminStudents } from '../lib/api'

export default function AdminDashboard() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const res = await getAdminStudents()
        setStudents(res)
      } catch (e) {
        setError('Failed to load students')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <Container fluid className="py-4">
      <h3>Manage Student Records</h3>

      {loading && <div className="text-muted mt-3">Loading...</div>}
      {error && <div className="text-danger mt-3">{error}</div>}
      <div className="table-responsive mt-3">
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Class</th>
              <th>Test Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.name}</td>
                <td>{s.email}</td>
                <td>{s.class}</td>
                <td>{s.status}</td>
                <td>
                  <ButtonGroup size="sm">
                    <Button variant="outline-primary">View</Button>
                    <Button variant="outline-secondary">Edit</Button>
                    <Button variant="outline-danger">Delete</Button>
                  </ButtonGroup>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Container>
  )
}

