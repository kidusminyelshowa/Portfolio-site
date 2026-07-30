import React from 'react'

export default function ProjectsGrid() {
  const projects = [
    { title: 'Project 1' },
    { title: 'Project 2' },
    { title: 'Project 3' },
    { title: 'Project 4' }
  ]

  return (
    <section style={{
      backgroundColor: '#d1f811',
      padding: '120px 40px'
    }}>
      <h2 style={{
        fontSize: '120px',
        textAlign: 'right',
        color: '#022018',
        margin: '0 0 80px 0',
        fontWeight: '700',
        letterSpacing: '-5px',
        textTransform: 'uppercase',
        fontFamily: '"Apfel Grotezk", system-ui, sans-serif'
      }}>
        Projects
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '30px',
        maxWidth: '1200px',
        marginLeft: 'auto',
        marginRight: '0'
      }}>
        {projects.map((project, idx) => (
          <div key={idx} style={{
            aspectRatio: '1',
            backgroundColor: '#022018',
            borderRadius: '4px',
            border: '4px solid #d1f811',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 300ms ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#01803b'
            e.currentTarget.style.transform = 'scale(1.02)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#022018'
            e.currentTarget.style.transform = 'scale(1)'
          }}>
            <p style={{
              color: '#d1f811',
              fontSize: '28px',
              fontWeight: '700',
              margin: '0',
              fontFamily: '"Apfel Grotezk", system-ui, sans-serif'
            }}>
              {project.title}
            </p>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '80px',
        textAlign: 'center'
      }}>
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
          See All
        </button>
      </div>
    </section>
  )
}
