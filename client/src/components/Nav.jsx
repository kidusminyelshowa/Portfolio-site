import React from 'react'

export default function Nav({ onToggleInfo }) {
  return (
    <nav className="side-navbar">
      <div className="nav-contact">
        <div className="nav-location">Addis Ababa, Ethiopia</div>
        <div className="nav-email">kidusminye@gmail.com</div>
      </div>
      <div className="nav-avatar">
        <img src="/assets/img/KTM.webp" alt="Avatar" className="avatar-img" width="45" height="45" />
      </div>
      <button className="nav-info-btn" aria-label="Information" onClick={(e) => { e.stopPropagation(); onToggleInfo && onToggleInfo(); }}>
        <img src="/assets/img/Asset 3.svg" alt="Info icon" className="info-icon" />
      </button>
    </nav>
  )
}
