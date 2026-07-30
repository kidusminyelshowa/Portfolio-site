import React from 'react'

export default function Services() {
  const services = [
    { label: 'Brand Design' },
    { label: 'Web Design' },
    { label: 'Content' },
    { label: 'Motion Design' }
  ]

  return (
    <section style={{
      backgroundColor: '#d1f811',
      padding: '120px 40px',
      textAlign: 'center'
    }}>
      <h2 style={{
        fontSize: '25px',
        color: '#022018',
        margin: '0 0 80px 0',
        fontWeight: '600',
        textTransform: 'uppercase',
        fontFamily: '"Apfel Grotezk", system-ui, sans-serif',
        letterSpacing: '-1px'
      }}>
        Services
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '40px',
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {services.map((service, idx) => (
          <div key={idx} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '30px',
            padding: '20px'
          }}>
            <div style={{
              width: '100px',
              height: '100px',
              backgroundColor: '#022018',
              borderRadius: '8px',
              transition: 'all 300ms ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#01803b'
              e.currentTarget.style.transform = 'scale(1.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#022018'
              e.currentTarget.style.transform = 'scale(1)'
            }} />
            <p style={{
              fontSize: '18px',
              color: '#022018',
              margin: '0',
              fontWeight: '600',
              fontFamily: '"Apfel Grotezk", system-ui, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '-0.5px'
            }}>
              {service.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
