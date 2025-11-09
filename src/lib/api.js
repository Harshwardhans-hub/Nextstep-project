export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

function baseHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    ...extra,
  }
}

function authHeaders(extra = {}) {
  const token = localStorage.getItem('id_token')
  if (token) {
    return baseHeaders({ Authorization: `Bearer ${token}`, ...extra })
  }
  // Dev fallback headers for backend when Firebase is not configured or not signed in
  return baseHeaders({
    'X-Demo-UID': localStorage.getItem('demo_uid') || 'demo-user',
    'X-Demo-Email': localStorage.getItem('demo_email') || 'demo@example.com',
    ...extra,
  })
}

export async function getDashboard() {
  const res = await fetch(`${API_BASE}/api/dashboard`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load dashboard')
  return res.json()
}

export async function getSkillGap() {
  const res = await fetch(`${API_BASE}/api/skill-gap`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load skill gap')
  return res.json()
}

export async function getAdminStudents() {
  const res = await fetch(`${API_BASE}/api/admin/students`, { headers: authHeaders({ 'X-Admin': 'true' }) })
  if (!res.ok) throw new Error('Failed to load students')
  return res.json()
}

export async function listPortfolio() {
  const res = await fetch(`${API_BASE}/api/portfolio`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load portfolio')
  return res.json()
}

export async function addPortfolio({ name, url, description, tags }) {
  const res = await fetch(`${API_BASE}/api/portfolio`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, url, description, tags })
  })
  if (!res.ok) throw new Error('Failed to save portfolio item')
  return res.json()
}

export async function updatePortfolio(id, payload) {
  const res = await fetch(`${API_BASE}/api/portfolio/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Failed to update portfolio item')
  return res.json()
}

export async function deletePortfolio(id) {
  const res = await fetch(`${API_BASE}/api/portfolio/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
  if (!res.ok) throw new Error('Failed to delete portfolio item')
  return res.json()
}

export async function submitAptitude(payload) {
  // payload can be { answers } or { score, breakdown }
  const res = await fetch(`${API_BASE}/api/aptitude/submit`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Failed to submit aptitude test')
  return res.json()
}

export async function saveProfile(data) {
  const res = await fetch(`${API_BASE}/api/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to save profile')
  return res.json()
}

export async function getCareers() {
  const res = await fetch(`${API_BASE}/api/careers`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load careers')
  return res.json()
}

export async function getTrends() {
  const res = await fetch(`${API_BASE}/api/trends`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load trends')
  return res.json()
}

export async function getProfile() {
  const res = await fetch(`${API_BASE}/api/profile`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load profile')
  return res.json()
}

export async function getQuestions(studentClass, stream) {
  const url = new URL(`${API_BASE}/api/questions`)
  if (studentClass) url.searchParams.set('class', String(studentClass))
  if (stream) url.searchParams.set('stream', String(stream))
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load questions')
  return res.json()
}

export async function getSimulations() {
  const res = await fetch(`${API_BASE}/api/simulations`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load simulations')
  return res.json()
}

export async function scoreSimulation(id, answers) {
  const res = await fetch(`${API_BASE}/api/simulations/score`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ id, answers })
  })
  if (!res.ok) throw new Error('Failed to score simulation')
  return res.json()
}

// Planner
export async function getPlan() {
  const res = await fetch(`${API_BASE}/api/plan`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load plan')
  return res.json()
}

export async function generatePlan() {
  const res = await fetch(`${API_BASE}/api/plan/generate`, { method: 'POST', headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to generate plan')
  return res.json()
}

export async function addGoal(payload) {
  const res = await fetch(`${API_BASE}/api/goals`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
  if (!res.ok) throw new Error('Failed to add goal')
  return res.json()
}

export async function updateGoal(id, payload) {
  const res = await fetch(`${API_BASE}/api/goals/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(payload) })
  if (!res.ok) throw new Error('Failed to update goal')
  return res.json()
}

export async function deleteGoal(id) {
  const res = await fetch(`${API_BASE}/api/goals/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to delete goal')
  return res.json()
}

// Admin helpers (protected by backend role gate; dev header X-Admin used in local)
export async function adminListTests() {
  const res = await fetch(`${API_BASE}/api/admin/tests`, { headers: authHeaders({ 'X-Admin': 'true' }) })
  if (!res.ok) throw new Error('Failed to load tests')
  return res.json()
}

export async function adminCreateTest(name) {
  const res = await fetch(`${API_BASE}/api/admin/tests`, {
    method: 'POST',
    headers: authHeaders({ 'X-Admin': 'true' }),
    body: JSON.stringify({ name })
  })
  if (!res.ok) throw new Error('Failed to create test')
  return res.json()
}

export async function adminListQuestions(test_id) {
  const url = new URL(`${API_BASE}/api/admin/questions`)
  if (test_id) url.searchParams.set('test_id', test_id)
  const res = await fetch(url, { headers: authHeaders({ 'X-Admin': 'true' }) })
  if (!res.ok) throw new Error('Failed to load questions')
  return res.json()
}

export async function adminCreateQuestion(payload) {
  const res = await fetch(`${API_BASE}/api/admin/questions`, {
    method: 'POST',
    headers: authHeaders({ 'X-Admin': 'true' }),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Failed to create question')
  return res.json()
}

export async function adminDeleteTest(id) {
  const res = await fetch(`${API_BASE}/api/admin/tests/${id}`, {
    method: 'DELETE',
    headers: authHeaders({ 'X-Admin': 'true' })
  })
  if (!res.ok) throw new Error('Failed to delete test')
  return res.json()
}

export async function adminDeleteQuestion(id) {
  const res = await fetch(`${API_BASE}/api/admin/questions/${id}`, {
    method: 'DELETE',
    headers: authHeaders({ 'X-Admin': 'true' })
  })
  if (!res.ok) throw new Error('Failed to delete question')
  return res.json()
}

// Bookmarks
export async function listBookmarks() {
  const res = await fetch(`${API_BASE}/api/bookmarks`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load bookmarks')
  return res.json()
}

export async function addBookmark(title) {
  const res = await fetch(`${API_BASE}/api/bookmarks`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title }) })
  if (!res.ok) throw new Error('Failed to add bookmark')
  return res.json()
}

export async function deleteBookmark(id) {
  const res = await fetch(`${API_BASE}/api/bookmarks/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to delete bookmark')
  return res.json()
}

// Reports
export async function getReports() {
  const res = await fetch(`${API_BASE}/api/reports`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load reports')
  return res.json()
}
