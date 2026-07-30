import React from 'react'

export default function Footer() {
  return (
    <footer style={{
      backgroundColor: '#d1f811',
      padding: '80px 40px 40px',
      borderTop: '1px solid rgba(2, 32, 24, 0.1)'
    }}>
      {/* Main footer grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '40px',
        maxWidth: '1200px',
        marginBottom: '60px'
      }}>
        {/* Column 1 - Links */}
        <div>
          <p style={{
            fontSize: '20px',
            color: '#022018',
            margin: '0 0 20px 0',
            fontWeight: '600',
            fontFamily: '"Apfel Grotezk", system-ui, sans-serif'
          }}>
            Navigation
          </p>
          <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
            <li><a href="#home" style={{ color: '#022018', textDecoration: 'none', fontSize: '16px', marginBottom: '8px', display: 'block' }}>Home</a></li>
            <li><a href="#work" style={{ color: '#022018', textDecoration: 'none', fontSize: '16px', marginBottom: '8px', display: 'block' }}>Work</a></li>
            <li><a href="#services" style={{ color: '#022018', textDecoration: 'none', fontSize: '16px', marginBottom: '8px', display: 'block' }}>Services</a></li>
            <li><a href="#studio" style={{ color: '#022018', textDecoration: 'none', fontSize: '16px', marginBottom: '8px', display: 'block' }}>Studio</a></li>
            <li><a href="#contact" style={{ color: '#022018', textDecoration: 'none', fontSize: '16px', marginBottom: '8px', display: 'block' }}>Let's talk</a></li>
          </ul>
        </div>

        {/* Column 2 - Social */}
        <div>
          <p style={{
            fontSize: '20px',
            color: '#022018',
            margin: '0 0 20px 0',
            fontWeight: '600',
            fontFamily: '"Apfel Grotezk", system-ui, sans-serif'
          }}>
            Social
          </p>
          <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
            <li><a href="#instagram" style={{ color: '#022018', textDecoration: 'none', fontSize: '16px', marginBottom: '8px', display: 'block' }}>Instagram</a></li>
            <li><a href="#linkedin" style={{ color: '#022018', textDecoration: 'none', fontSize: '16px', marginBottom: '8px', display: 'block' }}>LinkedIn</a></li>
            <li><a href="#twitter" style={{ color: '#022018', textDecoration: 'none', fontSize: '16px', marginBottom: '8px', display: 'block' }}>X</a></li>
            <li><a href="#legal" style={{ color: '#022018', textDecoration: 'none', fontSize: '16px', marginBottom: '8px', display: 'block' }}>Legal</a></li>
          </ul>
        </div>

        {/* Column 3 - About (colored blocks) */}
        <div style={{ gridColumn: 'span 2' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '12px'
          }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                aspectRatio: '1',
                backgroundColor: '#01803b',
                borderRadius: i === 0 ? '8px' : i === 1 ? '50%' : i === 2 ? '4px' : i === 3 ? '50%' : '8px'
              }} />
            ))}
          </div>
          <p style={{
            fontSize: '16px',
            color: '#022018',
            margin: '20px 0 0 0',
            lineHeight: '1.6',
            fontFamily: 'system-ui, sans-serif'
          }}>
            We are a design studio based in Addis Ababa, Ethiopia. Specializing in brand design, web design, and motion design.
          </p>
        </div>
      </div>

      {/* Bottom section - Logo and copyright */}
      <div style={{
        borderTop: '1px solid rgba(2, 32, 24, 0.2)',
        paddingTop: '40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: '32px',
          fontWeight: '700',
          color: '#022018',
          fontFamily: '"Apfel Grotezk", system-ui, sans-serif'
        }}>
          THIRTY DEGREES
        </div>
        <p style={{
          fontSize: '14px',
          color: 'rgba(2, 32, 24, 0.6)',
          margin: '0',
          fontFamily: 'system-ui, sans-serif'
        }}>
          © {new Date().getFullYear()} Thirty Degrees. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
