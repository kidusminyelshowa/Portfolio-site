import React, { useEffect, useState } from 'react'

export default function Modal({ active, project, onClose, onNext }) {
  const [contentVisible, setContentVisible] = useState(true)

  useEffect(() => {
    if (active) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
  }, [active])

  useEffect(() => {
    // When project changes, ensure content visible
    setContentVisible(true)
  }, [project])

  useEffect(() => {
    if (!active) return
    // Add loaded class to images/videos when ready
    const visuals = document.querySelectorAll('#modal-visuals .bento-block')
    visuals.forEach(block => {
      const img = block.querySelector('img')
      const video = block.querySelector('video')
      if (img) {
        if (img.complete) block.classList.add('loaded')
        else img.onload = () => block.classList.add('loaded')
      }
      if (video) {
        video.onloadeddata = () => block.classList.add('loaded')
      }
    })
  }, [active, project])

  if (!active || !project) return null

  const handleNext = () => {
    setContentVisible(false)
    setTimeout(() => {
      onNext && onNext()
      setContentVisible(true)
    }, 250)
  }

  return (
    <div id="project-modal" className={`modal ${active ? 'active' : ''}`}>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-esc-hint">Press Esc to go back</div>
      <button className="close-modal" aria-label="Close modal" onClick={onClose}>
        <img src="/assets/img/Asset 5.svg" alt="Close icon" className="close-icon" />
      </button>
      <div className="modal-content">
        <div className="modal-body" style={{ opacity: contentVisible ? 1 : 0, transition: 'opacity 200ms' }}>
          <h2 id="modal-title" className="modal-project-title">{project.title}</h2>
          <p id="modal-statement" className="modal-statement">{project.context}</p>
          <div className="modal-visuals-container">
            <div className="modal-visuals" id="modal-visuals">
              {project.images && project.images.map((src, i) => (
                <div key={i} className={`bento-block block-${i + 1}`}>
                  {src.toLowerCase().endsWith('.webm') || src.toLowerCase().endsWith('.mp4') ? (
                    <video src={src} loop muted playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button id="next-project-btn" className="next-project-btn" onClick={handleNext}>NEXT PROJECT</button>
          </div>
        </div>
      </div>
    </div>
  )
}
