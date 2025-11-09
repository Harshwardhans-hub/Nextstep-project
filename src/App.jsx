import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom'
import './index.css'
import Login from './pages/Login'
import Register from './pages/Register'
import StudentDashboard from './pages/StudentDashboard'
import Portfolio from './pages/Portfolio'
import AptitudeTest from './pages/AptitudeTest'
import SkillGap from './pages/SkillGap'
import CareerRoadmap from './pages/CareerRoadmap'
import AdminDashboard from './pages/AdminDashboard'
import { useAuth } from './context/AuthContext'
import Simulations from './pages/Simulations'
import AdminTests from './pages/AdminTests'
import TopNav from './components/TopNav'
import Library from './pages/Library'
import Reports from './pages/Reports'
import { getProfile } from './lib/api'

const StudentDashboardPage = () => <StudentDashboard />
const CareerRoadmapPage = () => <CareerRoadmap />
const SkillGapPage = () => <SkillGap />
const PortfolioPage = () => <Portfolio />
const AdminDashboardPage = () => <AdminDashboard />

/* Protected route logic */
const StudentGroup = () => {
  const { user, loading } = useAuth()
  const [profileChecked, setProfileChecked] = useState(false)
  const [requiresReg, setRequiresReg] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!user) return
      try {
        const p = await getProfile()
        const sc = String(p?.student_class || '').trim()
        if (active) {
          setRequiresReg(!sc)
          setProfileChecked(true)
        }
      } catch (_) {
        if (active) { setRequiresReg(true); setProfileChecked(true) }
      }
    })()
    return () => { active = false }
  }, [user])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (!profileChecked) return null
  if (requiresReg && window.location.pathname !== '/register') return <Navigate to="/register" replace />

  return (
    <>
      {!requiresReg && <TopNav />}
      <Outlet />
    </>
  )
}

const AdminGroup = () => {
  const { user, loading } = useAuth()
  if (loading) return null
  // Simple placeholder: allow access if logged in; backend still enforces role
  return user ? (
    <>
      <TopNav />
      <Outlet />
    </>
  ) : (<Navigate to="/login" replace />)
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Student protected group at root "/" */}
        <Route path="/" element={<StudentGroup />}>
          {/* Optionally redirect index of "/" to /dashboard */}
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<StudentDashboardPage />} />
          <Route path="roadmap" element={<CareerRoadmapPage />} />
          <Route path="library" element={<Library />} />
          <Route path="aptitude" element={<AptitudeTest />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="skill-gap" element={<SkillGapPage />} />
          <Route path="simulations" element={<Simulations />} />
          <Route path="reports" element={<Reports />} />
        </Route>

        {/* Admin protected group */}
        <Route path="/admin" element={<AdminGroup />}>
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="tests" element={<AdminTests />} />
        </Route>

        {/* Catch-all: optional - redirect unknown routes to /login or / */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
