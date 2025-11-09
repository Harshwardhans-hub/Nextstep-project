import React, { useEffect, useMemo, useState } from 'react'
import { Container, Row, Col, Card, ListGroup, Badge, Button } from 'react-bootstrap'
import { getCareers } from '../lib/api'

// Predefined career roadmaps to ensure wide coverage across streams
const PRESET_CAREERS = [
  // Engineering
  { title: 'Software Engineer', domain: 'Engineering', steps: ['Learn programming fundamentals', 'Build projects', 'Internship', 'Apply for SDE roles'], resources: [
    { name: 'freeCodeCamp', url: 'https://www.freecodecamp.org' },
    { name: 'MDN Web Docs', url: 'https://developer.mozilla.org' },
    { name: 'CS50', url: 'https://cs50.harvard.edu/x/' },
    { name: 'LeetCode', url: 'https://leetcode.com' }
  ] },
  { title: 'Data Scientist', domain: 'Engineering', steps: ['Statistics & Python', 'ML basics', 'Projects on datasets', 'Apply for DS roles'], resources: [
    { name: 'Kaggle', url: 'https://www.kaggle.com' },
    { name: 'Coursera ML', url: 'https://www.coursera.org/learn/machine-learning' },
    { name: 'fast.ai', url: 'https://www.fast.ai' },
    { name: 'scikit-learn', url: 'https://scikit-learn.org' }
  ] },
  { title: 'Civil Engineer', domain: 'Engineering', steps: ['B.Tech Civil', 'Internsite', 'AutoCAD/STAAD', 'Assistant Engineer'], resources: [
    { name: 'NPTEL Civil', url: 'https://nptel.ac.in' },
    { name: 'BIS Standards (Civil)', url: 'https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_search' },
    { name: 'Autodesk Learning', url: 'https://www.autodesk.com/learning' },
    { name: 'ASCE Resources', url: 'https://www.asce.org/education-and-careers' }
  ] },
  { title: 'Mechanical Engineer', domain: 'Engineering', steps: ['B.Tech Mechanical', 'CAD/CAM', 'Plant/Manufacturing internship', 'Junior Engineer'], resources: [
    { name: 'MIT OCW Mech', url: 'https://ocw.mit.edu' },
    { name: 'Coursera Mechanical', url: 'https://www.coursera.org/browse/engineering/mechanical-engineering' },
    { name: 'SolidWorks Tutorials', url: 'https://www.solidworks.com/learn' },
    { name: 'SAE International', url: 'https://www.sae.org/learn' }
  ] },
  { title: 'Electronics Engineer', domain: 'Engineering', steps: ['B.Tech ECE', 'Digital/Analog basics', 'Embedded/FPGA projects', 'Apply for ECE roles'], resources: [
    { name: 'All About Circuits', url: 'https://www.allaboutcircuits.com' },
    { name: 'EEVblog', url: 'https://www.eevblog.com' },
    { name: 'IEEE Spectrum', url: 'https://spectrum.ieee.org' },
    { name: 'FPGA Tutorial', url: 'https://fpgatutorial.com' }
  ] },
  // Humanities
  { title: 'Psychologist', domain: 'Humanities', steps: ['BA Psychology', 'MA/Internship', 'Licensure', 'Practice/Research'], resources: [
    { name: 'APA', url: 'https://www.apa.org' },
    { name: 'SimplyPsychology', url: 'https://www.simplypsychology.org' },
    { name: 'Coursera Psychology', url: 'https://www.coursera.org/browse/health/psychology' },
    { name: 'NIMH', url: 'https://www.nimh.nih.gov/health' }
  ] },
  { title: 'Journalist', domain: 'Humanities', steps: ['BA Journalism', 'Campus media', 'Internship', 'Reporter/Editor'], resources: [
    { name: 'Reuters Training', url: 'https://www.reuters.com/training' },
    { name: 'Poynter Institute', url: 'https://www.poynter.org' },
    { name: 'AP Stylebook (Basics)', url: 'https://www.apstylebook.com' },
    { name: 'IJNet', url: 'https://ijnet.org' }
  ] },
  { title: 'Sociologist', domain: 'Humanities', steps: ['BA Sociology', 'MA/Research', 'Fieldwork', 'Research Associate'], resources: [
    { name: 'ASA', url: 'https://www.asanet.org' },
    { name: 'SAGE Journals', url: 'https://journals.sagepub.com' },
    { name: 'Coursera Sociology', url: 'https://www.coursera.org/browse/social-sciences/sociology' },
    { name: 'JSTOR (Open)', url: 'https://about.jstor.org/access/participating-publishers/open-access-content/' }
  ] },
  { title: 'Historian', domain: 'Humanities', steps: ['BA History', 'Archives/Museums', 'MA/PhD', 'Curator/Researcher'], resources: [
    { name: 'Smithsonian Learning Lab', url: 'https://learninglab.si.edu' },
    { name: 'British Library', url: 'https://www.bl.uk/learning' },
    { name: 'Coursera History', url: 'https://www.coursera.org/browse/arts-and-humanities/history' },
    { name: 'JSTOR (Open)', url: 'https://about.jstor.org/access/participating-publishers/open-access-content/' }
  ] },
  // Commerce
  { title: 'Chartered Accountant', domain: 'Commerce', steps: ['CA Foundation', 'CA Inter', 'Articleship', 'CA Final'], resources: [
    { name: 'ICAI', url: 'https://www.icai.org' },
    { name: 'CAclubIndia', url: 'https://www.caclubindia.com' },
    { name: 'TaxGuru', url: 'https://taxguru.in' },
    { name: 'Unacademy CA (Free classes)', url: 'https://unacademy.com/goal/ca-foundation' }
  ] },
  { title: 'Investment Banker', domain: 'Commerce', steps: ['B.Com/BA Econ', 'Finance courses', 'Internship', 'Analyst'], resources: [
    { name: 'CFA Institute', url: 'https://www.cfainstitute.org' },
    { name: 'Wall Street Prep (Blog)', url: 'https://www.wallstreetprep.com/blog/' },
    { name: 'Investopedia Corporate Finance', url: 'https://www.investopedia.com/corporate-finance-4689743' },
    { name: 'Coursera IB Courses', url: 'https://www.coursera.org/search?query=investment%20banking' }
  ] },
  { title: 'Marketing Manager', domain: 'Commerce', steps: ['BBA/Commerce', 'Digital marketing', 'Campaign projects', 'Executive → Manager'], resources: [
    { name: 'Google Digital Garage', url: 'https://learndigital.withgoogle.com' },
    { name: 'HubSpot Academy', url: 'https://academy.hubspot.com' },
    { name: 'Meta Blueprint', url: 'https://www.facebook.com/business/learn' },
    { name: 'Moz Beginner SEO', url: 'https://moz.com/beginners-guide-to-seo' }
  ] },
  { title: 'Company Secretary', domain: 'Commerce', steps: ['CSEET', 'CS Executive', 'CS Professional', 'Practical training'], resources: [
    { name: 'ICSI', url: 'https://www.icsi.edu' },
    { name: 'SEBI', url: 'https://www.sebi.gov.in' },
    { name: 'MCA', url: 'https://www.mca.gov.in' },
    { name: 'CAclubIndia (CS)', url: 'https://www.caclubindia.com/tag/cs.aspx' }
  ] },
  // Medical
  { title: 'Doctor (MBBS)', domain: 'Medical', steps: ['NEET', 'MBBS', 'Internship', 'Residency/PG'], resources: [
    { name: 'NMC', url: 'https://www.nmc.org.in' },
    { name: 'NHP India', url: 'https://www.nhp.gov.in' },
    { name: 'MedlinePlus', url: 'https://medlineplus.gov' },
    { name: 'AIIMS eLibrary', url: 'https://elibrary.aiims.edu' }
  ] },
  { title: 'Dentist (BDS)', domain: 'Medical', steps: ['NEET', 'BDS', 'Internship', 'Practice/MDS'], resources: [
    { name: 'IDA', url: 'https://www.ida.org.in' },
    { name: 'DCI', url: 'https://dciindia.gov.in' },
    { name: 'NIDCR (NIH)', url: 'https://www.nidcr.nih.gov' },
    { name: 'Colgate Professional', url: 'https://www.colgateprofessional.com' }
  ] },
  { title: 'Physiotherapist', domain: 'Medical', steps: ['BPT', 'Clinical internship', 'Licensure', 'Practice/Hospital'], resources: [
    { name: 'World Physiotherapy', url: 'https://world.physio' },
    { name: 'Physiopedia', url: 'https://www.physio-pedia.com' },
    { name: 'NCBI Rehab', url: 'https://www.ncbi.nlm.nih.gov/pmc/?term=rehabilitation' },
    { name: 'APTA', url: 'https://www.apta.org' }
  ] },
  { title: 'Pharmacist', domain: 'Medical', steps: ['B.Pharm', 'Industrial training', 'Licensure', 'Hospital/Industry'], resources: [
    { name: 'PCI', url: 'https://www.pci.nic.in' },
    { name: 'CDSCO', url: 'https://cdsco.gov.in' },
    { name: 'MedlinePlus Drugs', url: 'https://medlineplus.gov/druginformation.html' },
    { name: 'DrugBank (Open)', url: 'https://go.drugbank.com/' }
  ] },
  // Science
  { title: 'Biotechnologist', domain: 'Science', steps: ['BSc/B.Tech Biotech', 'Wet lab skills', 'Research projects', 'Industry/Research'], resources: [
    { name: 'iGEM', url: 'https://igem.org' },
    { name: 'Addgene', url: 'https://www.addgene.org' },
    { name: 'Protocols.io', url: 'https://www.protocols.io' },
    { name: 'NCBI', url: 'https://www.ncbi.nlm.nih.gov' }
  ] },
  { title: 'Research Scientist', domain: 'Science', steps: ['BSc', 'MSc/PhD', 'Publications', 'Postdoc/Industry R&D'], resources: [
    { name: 'arXiv', url: 'https://arxiv.org' },
    { name: 'Elsevier Researcher Academy', url: 'https://researcheracademy.elsevier.com' },
    { name: 'Google Scholar', url: 'https://scholar.google.com' },
    { name: 'OSF (Open Science Framework)', url: 'https://osf.io' }
  ] },
  { title: 'Statistician', domain: 'Science', steps: ['BSc Stats', 'R/Python', 'Applied projects', 'Data/Research roles'], resources: [
    { name: 'StatQuest', url: 'https://statquest.org' },
    { name: 'OpenIntro Statistics', url: 'https://www.openintro.org/book/os/' },
    { name: 'R for Data Science', url: 'https://r4ds.hadley.nz' },
    { name: 'Tidyverse', url: 'https://www.tidyverse.org' }
  ] },
  // Law
  { title: 'Lawyer', domain: 'Law', steps: ['CLAT/LLB', 'Internships', 'Bar exam', 'Litigation/In-house'], resources: [
    { name: 'Bar Council of India', url: 'https://www.barcouncilofindia.org' },
    { name: 'Indian Kanoon', url: 'https://indiankanoon.org' },
    { name: 'Lawctopus', url: 'https://www.lawctopus.com' },
    { name: 'eCourts India', url: 'https://ecourts.gov.in' }
  ] },
  { title: 'Corporate Lawyer', domain: 'Law', steps: ['BA LLB', 'Moots/Internships', 'Bar exam', 'Law firm/Corporate'], resources: [
    { name: 'MCCA', url: 'https://www.mcca.com' },
    { name: 'Harvard Law Corporate Governance', url: 'https://corpgov.law.harvard.edu' },
    { name: 'Mondaq', url: 'https://www.mondaq.com' },
    { name: 'SEBI', url: 'https://www.sebi.gov.in' }
  ] },
  // Design
  { title: 'UX Designer', domain: 'Design', steps: ['Design fundamentals', 'Portfolio', 'Internship', 'Product Designer'], resources: [
    { name: 'NN/g', url: 'https://www.nngroup.com' },
    { name: 'Coursera UX', url: 'https://www.coursera.org/browse/arts-and-humanities/design-and-product' },
    { name: 'Figma Community', url: 'https://www.figma.com/community' },
    { name: 'Material Design', url: 'https://m3.material.io' }
  ] },
  { title: 'Graphic Designer', domain: 'Design', steps: ['Visual design basics', 'Tools (Figma/Adobe)', 'Portfolio', 'Agency/Freelance'], resources: [
    { name: 'Figma Learn', url: 'https://help.figma.com/hc/en-us' },
    { name: 'Adobe HelpX', url: 'https://helpx.adobe.com' },
    { name: 'Canva Design School', url: 'https://www.canva.com/learn' },
    { name: 'The Futur (YouTube)', url: 'https://www.youtube.com/c/thefutur' }
  ] },
  // Management
  { title: 'Product Manager', domain: 'Management', steps: ['Domain knowledge', 'Roadmaps & PRDs', 'Launch projects', 'Associate PM → PM'], resources: [
    { name: 'PM Exercises', url: 'https://www.productmanagementexercises.com' },
    { name: 'Atlassian Product Guides', url: 'https://www.atlassian.com/agile/product-management' },
    { name: 'SVPG Blog', url: 'https://www.svpg.com/articles/' },
    { name: 'Mind the Product', url: 'https://www.mindtheproduct.com' }
  ] },
  { title: 'Operations Manager', domain: 'Management', steps: ['BBA/Industrial Engg', 'Process mapping', 'Internship', 'Ops Analyst → Manager'], resources: [
    { name: 'Coursera Ops', url: 'https://www.coursera.org' },
    { name: 'MITx Supply Chain', url: 'https://micromasters.mit.edu/scm/' },
    { name: 'Lucidchart Process Mapping', url: 'https://www.lucidchart.com/pages/process-mapping' },
    { name: 'ASQ', url: 'https://asq.org/quality-resources' }
  ] }
]

function mergeCareers(apiCareers = []) {
  const byTitle = new Map()
  for (const c of [...PRESET_CAREERS, ...apiCareers]) {
    const key = String(c.title || '').trim().toLowerCase()
    if (!byTitle.has(key)) byTitle.set(key, c)
  }
  return Array.from(byTitle.values())
}

export default function CareerRoadmap() {
  const [careers, setCareers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requiresTest, setRequiresTest] = useState(false)
  const [stream, setStream] = useState('all')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await getCareers()
        if (data?.requires_test) {
          setRequiresTest(true)
          if (active) setCareers([])
        } else if (active) {
          setCareers(mergeCareers(data.careers || []))
        }
      } catch (e) {
        setError('Failed to load careers')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

  const streams = useMemo(() => {
    const set = new Set()
    for (const c of careers) {
      const d = norm(c.domain)
      if (d.includes('engineer') || d.includes('it') || d.includes('tech')) set.add('Engineering')
      if (d.includes('humanit') || d.includes('arts')) set.add('Humanities')
      if (d.includes('commerce') || d.includes('account') || d.includes('business')) set.add('Commerce')
      if (d.includes('medical') || d.includes('mbbs') || d.includes('doctor') || d.includes('bio')) set.add('Medical')
      if (d.includes('science') || d.includes('stem')) set.add('Science')
      if (d.includes('law') || d.includes('legal')) set.add('Law')
      if (d.includes('design') || d.includes('creative')) set.add('Design')
      if (d.includes('manage') || d.includes('mba')) set.add('Management')
    }
    return ['All', ...Array.from(set)]
  }, [careers])

  const filtered = useMemo(() => {
    if (stream === 'all') return careers
    const s = norm(stream)
    return careers.filter(c => {
      const d = norm(c.domain)
      return d.includes(s)
    })
  }, [careers, stream])

  return (
    <Container className="py-4">
      <h4 className="mb-3">Career Roadmaps</h4>
      <div className="mb-3 d-flex flex-wrap gap-2">
        {streams.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={stream === s.toLowerCase() || (s === 'All' && stream === 'all') ? 'primary' : 'outline-primary'}
            onClick={() => setStream(s === 'All' ? 'all' : s)}
          >
            {s}
          </Button>
        ))}
        <Badge bg="secondary" className="ms-auto">{filtered.length} options</Badge>
      </div>
      {loading && <div className="text-muted">Loading...</div>}
      {error && <div className="text-danger">{error}</div>}
      {requiresTest && !loading && (
        <Card className="mb-3">
          <Card.Body className="d-flex justify-content-between align-items-center">
            <div className="text-muted">Take the Aptitude Test to unlock personalized roadmaps.</div>
            <a className="btn btn-warning" href="/aptitude">Take Test</a>
          </Card.Body>
        </Card>
      )}
      <Row className="g-4">
        {!requiresTest && filtered.map((c, idx) => (
          <Col md={6} key={idx}>
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Card.Title className="mb-0">{c.title}</Card.Title>
                </div>
                <Row>
                  <Col md={6}>
                    <h6>Roadmap Steps</h6>
                    <ListGroup variant="flush">
                      {(c.steps || []).map((s, i) => (
                        <ListGroup.Item key={i}>{s}</ListGroup.Item>
                      ))}
                    </ListGroup>
                  </Col>
                  <Col md={6}>
                    <h6>Resources</h6>
                    <ListGroup variant="flush">
                      {(c.resources || []).map((r, i) => (
                        <ListGroup.Item key={i}>
                          <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        ))}
        {(!requiresTest && !loading && filtered.length === 0) && (
          <Col md={12}><div className="text-muted">No career data available.</div></Col>
        )}
      </Row>
    </Container>
  )
}
