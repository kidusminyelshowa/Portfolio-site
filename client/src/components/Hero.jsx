import React from 'react'

export default function Hero() {
  return (
    <section className="hero" style={{ 
      backgroundColor: '#d1f811', 
      minHeight: '100vh', 
      padding: '60px 40px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Top Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '80px'
      }}>
        <div style={{ fontSize: '20px', color: 'rgba(2, 32, 24, 0.7)', fontWeight: '500' }}>TK</div>
        <div style={{ fontSize: '20px', color: 'rgba(2, 32, 24, 0.7)', fontWeight: '500' }}>Menu</div>
      </div>

      {/* Main Heading */}
      <h1 style={{
        fontSize: '100px',
        textAlign: 'center',
        margin: '40px 0 60px 0',
        color: '#022018',
        fontWeight: '700',
        letterSpacing: '-4px',
        textTransform: 'uppercase',
        fontFamily: '"Apfel Grotezk", system-ui, sans-serif'
      }}>
        Designing Consequence
      </h1>

      {/* Tagline and Arrow Section */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '40px',
        marginBottom: '80px',
        alignItems: 'center'
      }}>
        <div>
          <p style={{
            fontSize: '100px',
            lineHeight: '1.1',
            margin: '0',
            color: '#022018',
            fontWeight: '700',
            letterSpacing: '-2px',
            fontFamily: '"Apfel Grotezk", system-ui, sans-serif'
          }}>
            We strategically position your brand for authority with speed.
          </p>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '400px'
        }}>
          {/* Placeholder for arrow graphic */}
          <div style={{
            fontSize: '120px',
            transform: 'rotate(-15deg)'
          }}>→</div>
        </div>
      </div>

      {/* Let's Talk Button */}
      <div style={{
        marginBottom: '40px'
      }}>
        <button style={{
          border: '2px solid #022018',
          backgroundColor: 'transparent',
          padding: '15px 30px',
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
          Let's Talk
        </button>
      </div>

      {/* Green Rectangle Background */}
      <div style={{
        backgroundColor: '#01803b',
        height: '400px',
        marginTop: '80px'
      }} />
    </section>
  )
}
