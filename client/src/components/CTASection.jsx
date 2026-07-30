import React from 'react'

export default function CTASection() {
  return (
    <section style={{
      backgroundColor: '#d1f811',
      padding: '120px 40px',
      display: 'grid',
      gridTemplateColumns: '1fr 1.2fr',
      alignItems: 'center',
      gap: '80px',
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      {/* Left side - geometric shapes */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '500px',
        position: 'relative'
      }}>
        {/* Placeholder for geometric decoration */}
        <div style={{
          fontSize: '200px',
          color: 'rgba(2, 32, 24, 0.1)',
          transform: 'rotate(45deg)',
          margin: '0'
        }}>◆</div>
      </div>

      {/* Right side - CTA text and button */}
      <div>
        <h2 style={{
          fontSize: '120px',
          lineHeight: '1.1',
          color: '#022018',
          margin: '0 0 60px 0',
          fontWeight: '700',
          letterSpacing: '-4px',
          textTransform: 'lowercase',
          fontFamily: '"Apfel Grotezk", system-ui, sans-serif'
        }}>
          Let's work together.
        </h2>

        <button style={{
          border: '2px solid #022018',
          backgroundColor: 'transparent',
          padding: '15px 35px',
          fontSize: '35px',
          fontWeight: '600',
          cursor: 'pointer',
          color: '#022018',
          fontFamily: '"Apfel Grotezk", system-ui, sans-serif',
          letterSpacing: '-1.4px',
          transition: 'all 300ms ease'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#022018'
          e.target.style.color = '#d1f811'
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent'
          e.target.style.color = '#022018'
        }}>
          Say Hello
        </button>
      </div>
    </section>
  )
}
