import React from 'react'

export default function InfoOverlay({ active }) {
  return (
    <div id="info-overlay" className={"info-overlay" + (active ? ' active' : '')}>
      <div className="info-overlay-content">
        <p className="info-description">
          I’m Kidus Minyelshowa, a designer focused on building clear visual systems. My work centers on
          structure, using layout, hierarchy, typography, and motion to create frameworks that organize how brands
          and ideas are communicated. Rather than approaching design as a collection of isolated visuals, I focus
          on defining relationships between elements so the work remains consistent, adaptable, and easy to use
          across different contexts. The aim is always clarity: making complex information readable and design
          decisions durable.
        </p>
        <div className="info-socials">
          <a href="https://instagram.com/kidusminyel" className="info-link" target="_blank" rel="noopener noreferrer">INSTAGRAM</a>
          <a href="https://linkedin.com/in/kidusminyel" className="info-link" target="_blank" rel="noopener noreferrer">LINKEDIN</a>
        </div>
      </div>
    </div>
  )
}
