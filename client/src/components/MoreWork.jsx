import React, { useState, useEffect } from 'react'

export default function MoreWork() {
  const [openIndex, setOpenIndex] = useState(null)
  const [noHoverIndex, setNoHoverIndex] = useState(null)

  const toggle = (i) => {
    if (openIndex === i) {
      // Closing -> set no-hover until mouse leaves
      setOpenIndex(null)
      setNoHoverIndex(i)
    } else {
      setOpenIndex(i)
      setNoHoverIndex(null)
    }
  }

  useEffect(() => {
    const videos = document.querySelectorAll('.more-work video')
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.play().catch(()=>{})
        else entry.target.pause()
      })
    }, { threshold: 0.1 })
    videos.forEach(v => observer.observe(v))
    return () => observer.disconnect()
  }, [])

  return (
    <section id="more-work" className="section more-work">
      <div className="section-header"><h2 className="section-label">MORE WORK</h2></div>
      <div className="work-list">
        <div className={`work-item ${openIndex===0 ? 'active':''} ${noHoverIndex===0 ? 'no-hover':''}`} onClick={() => toggle(0)} onMouseLeave={() => setNoHoverIndex(null)}>
          <div className="work-item-header">
            <h3 className="work-title">Lalibel</h3>
            <p className="work-desc">A visual identity for Lalibel that captures the essence of heritage through sleek, contemporary design, balancing traditional motifs with a modern aesthetic.</p>
          </div>
          <div className="work-hover-card hover-before"><img src="/assets/projects/Lalibel/Lalibel Label.webp" alt="Lalibel Label" loading="lazy" width="155" height="180"/></div>
          <div className="work-hover-card hover-after"><img src="/assets/projects/Lalibel/Lalibel Totebag.webp" alt="Lalibel Totebag" loading="lazy" width="155" height="180"/></div>
          <div className="work-item-content">
            <div className="work-visual-grid">
              <div className="work-block"><video src="/assets/projects/Lalibel/Lalibel Logo animation.webm" loop muted playsInline preload="metadata" className="lazy-video"></video></div>
              <div className="work-block"><img src="/assets/projects/Lalibel/Lalibel on Ph.webp" alt="Mobile" loading="lazy"/></div>
              <div className="work-block"><img src="/assets/projects/Lalibel/Lalibel Feature.webp" alt="Feature" loading="lazy"/></div>
              <div className="work-block"><img src="/assets/projects/Lalibel/Lalibel Posters.webp" alt="Posters" loading="lazy"/></div>
            </div>
          </div>
        </div>

        <div className={`work-item ${openIndex===1 ? 'active':''} ${noHoverIndex===1 ? 'no-hover':''}`} onClick={() => toggle(1)} onMouseLeave={() => setNoHoverIndex(null)}>
          <div className="work-item-header">
            <h3 className="work-title">Re'es</h3>
            <p className="work-desc">An identity project centered on leadership and clarity, using a strict typographic framework to establish a distinct and professional entity.</p>
          </div>
          <div className="work-hover-card hover-before"><img src="/assets/projects/Re'es/Re es event Brochur.webp" alt="Brochure" loading="lazy" width="155" height="180"/></div>
          <div className="work-hover-card hover-after"><img src="/assets/projects/Re'es/Re es on Banner.webp" alt="Banner" loading="lazy" width="155" height="180"/></div>
          <div className="work-item-content">
            <div className="work-visual-grid">
              <div className="work-block"><img src="/assets/projects/Re'es/Re'es Outdoor.webp" alt="Outdoor"/></div>
              <div className="work-block"><video src="/assets/projects/Re'es/Re'es palette animation.webm" loop muted playsInline preload="metadata" className="lazy-video"></video></div>
              <div className="work-block"><video src="/assets/projects/Re'es/Re'es text animation.webm" loop muted playsInline preload="metadata" className="lazy-video"></video></div>
              <div className="work-block"><img src="/assets/projects/Re'es/Re'es logo.webp" alt="Logo" loading="lazy"/></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
