import React from 'react'
import Hero from './components/Hero'
import Services from './components/Services'
import ProjectsGrid from './components/ProjectsGrid'
import CTASection from './components/CTASection'
import Footer from './components/Footer'
import './styles.css'

export default function App() {
  return (
    <div style={{ backgroundColor: '#d1f811', margin: '0', padding: '0' }}>
      <Hero />
      <Services />
      <ProjectsGrid />
      <CTASection />
      <Footer />
    </div>
  )
}
