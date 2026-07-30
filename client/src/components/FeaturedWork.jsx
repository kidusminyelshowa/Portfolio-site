import React from 'react'

export default function FeaturedWork({ onOpenProject }) {
  return (
    <section id="featured-work" className="section featured-work">
      <div className="section-header">
        <h2 className="section-label">FEATURED WORK</h2>
        <div className="header-line"></div>
        <span className="header-subtitle">Selection of recent projects</span>
      </div>
      <div className="project-grid-wrapper">
        <div className="project-grid">
          <div className="project-item" data-project="project-1" onClick={() => onOpenProject('project-1')}>
            <div className="project-card orange-border">
              <div className="project-image-container">
                <img src="/assets/projects/EEC/EEC-Field Jacket.webp" alt="EEC" className="project-image" loading="eager" decoding="async" width="580" height="435" />
              </div>
            </div>
            <div className="project-title-pill"><span className="play-icon"></span><h3 className="project-title">EEC</h3></div>
          </div>

          <div className="project-item" data-project="project-2" onClick={() => onOpenProject('project-2')}>
            <div className="project-card teal-border">
              <div className="project-image-container">
                <img src="/assets/projects/Palace Museum/Palace Museum Cataloge.webp" alt="Palace Museum" className="project-image" loading="lazy" decoding="async" width="580" height="435" />
              </div>
            </div>
            <div className="project-title-pill"><span className="play-icon"></span><h3 className="project-title">Palace Museum</h3></div>
          </div>

          <div className="project-item" data-project="project-3" onClick={() => onOpenProject('project-3')}>
            <div className="project-card brown-border">
              <div className="project-image-container">
                <img src="/assets/projects/Heineken EVP/EVP Tote Bag.webp" alt="Heineken EVP" className="project-image" loading="lazy" decoding="async" width="580" height="435" />
              </div>
            </div>
            <div className="project-title-pill"><span className="play-icon"></span><h3 className="project-title">Heineken EVP</h3></div>
          </div>
        </div>
      </div>
    </section>
  )
}
