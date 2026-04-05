const projectData = {
    "project-1": {
        title: "EEC",
        context: "Partnered with the Ethiopian Engineering Corporation to develop a bold and functional visual identity rooted in strength and precision. EEC is an industry leader in infrastructure and innovation.",
        approach: "We crafted a full corporate identity system, from logo design to brand guidelines, specifically designed to reflect the scale and technical excellence of their work.",
        outcome: "A comprehensive brand framework that ensures consistency across all physical and digital touchpoints, reinforcing the corporation’s credibility on a national level.",
        images: [
            "assets/projects/EEC/EEC-Field Jacket.webp",
            "assets/projects/EEC/EEC-Cosntruction Site.webp",
            "assets/projects/EEC/EEC-Photography.webp",
            "assets/projects/EEC/EEC-Hard Hat.webp",
            "assets/projects/EEC/EEC-Employee ID.webp",
            "assets/projects/EEC/EEC-Hi-Vi Vest.webp",
            "assets/projects/EEC/Backgrounds.webp",
            "assets/projects/EEC/0-59-Recovered.webp",
            "assets/projects/EEC/EEC-Site Signage.webp",
            "assets/projects/EEC/EEC-Animation.webm"
        ]
    },
    "project-2": {
        title: "Palace Museum",
        context: "A comprehensive rebrand for the National Palace Museum, formerly the Jubilee Palace. The project objective was to reintroduce this iconic landmark as a premier cultural destination with deep historical weight and contemporary relevance.",
        approach: "The identity design draws inspiration from imperial architecture, heritage patterns, and archival archival elements, creating a visual language that honors the past while remaining accessible to modern audiences.",
        outcome: "A cohesive identity system, including wayfinding and signage, that allows the museum to communicate with dignity and clarity across all exhibitions and communications.",
        images: [
            "assets/projects/Palace Museum/Palace Museum Entrance.webp",
            "assets/projects/Palace Museum/Palace Museum Story Animation.webm",
            "assets/projects/Palace Museum/Palace Museum Signage.webp",
            "assets/projects/Palace Museum/Palace Museum Totebag.webp",
            "assets/projects/Palace Museum/Palace Museum Cataloge.webp",
            "assets/projects/Palace Museum/Palace Museum Guide Video.webm",
            "assets/projects/Palace Museum/Palace Museum Post Card.webp",
            "assets/projects/Palace Museum/Palace Museum Wayfinding.webp",
            "assets/projects/Palace Museum/Palace Museum Posters.webp",
            "assets/projects/Palace Museum/Palace Museum Logo.webp"
        ]
    },
    "project-3": {
        title: "Heineken EVP",
        context: "A visual identity system developed for Heineken’s Employer Value Proposition (EVP). The project focused on aligning Heineken’s global corporate standards with Ethiopia’s unique local culture.",
        approach: "We utilized bold typography and high-contrast visuals to communicate authenticity, pride, and the 'Heineken Spirit' throughout the workspace and internal communications.",
        outcome: "A successful internal launch that unified the team’s visual language across all physical and digital touchpoints, from office environments to digital toolkits.",
        images: [
            "assets/projects/Heineken EVP/EVP-Reveal Video.webm",
            "assets/projects/Heineken EVP/EVP-Billboard.webp",
            "assets/projects/Heineken EVP/EVP Tote Bag.webp",
            "assets/projects/Heineken EVP/EVP-Hoodie.webp",
            "assets/projects/Heineken EVP/EVP Poster.webp",
            "assets/projects/Heineken EVP/EVP t shirt.webp",
            "assets/projects/Heineken EVP/EVP_Wall Papers.webp",
            "assets/projects/Heineken EVP/EVP Stamps.webp",
            "assets/projects/Heineken EVP/EVP Illustrations.webp",
            "assets/projects/Heineken EVP/EVP-Stickers.webp"
        ]
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('project-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalStatement = document.getElementById('modal-statement');
    const modalVisuals = document.getElementById('modal-visuals');
    const closeBtn = document.querySelector('.close-modal');
    const backdrop = document.querySelector('.modal-backdrop');

    // Open Modal Logic
    let currentProjectId = null;
    const projectKeys = Object.keys(projectData);

    const openProject = (projectId) => {
        const data = projectData[projectId];
        if (data) {
            currentProjectId = projectId;
            modalTitle.textContent = data.title;
            modalStatement.textContent = data.context;

            // Clear and generate bento blocks from project data
            modalVisuals.innerHTML = '';

            if (data.images && data.images.length > 0) {
                data.images.forEach((imgSrc, index) => {
                    const block = document.createElement('div');
                    block.className = `bento-block block-${index + 1}`;

                    // Apply 10% grey background to the 4th image of Heineken EVP
                    if (projectId === 'project-3' && index === 3) {
                        block.style.backgroundColor = '#e6e6e6';
                    }

                    if (imgSrc.toLowerCase().endsWith('.webm') || imgSrc.toLowerCase().endsWith('.webm')) {
                        block.style.overflow = 'hidden';
                        block.style.position = 'relative';
                        const video = document.createElement('video');
                        video.src = imgSrc;
                        video.autoplay = true;
                        video.loop = true;
                        video.muted = true;
                        video.playsInline = true;
                        video.style.width = '100%';
                        video.style.height = '100%';
                        video.style.objectFit = 'cover';
                        video.style.position = 'absolute';
                        video.style.top = '0';
                        video.style.left = '0';
                        video.style.pointerEvents = 'none';
                        block.appendChild(video);
                        // Videos are considered loaded immediately for opacity
                        block.classList.add('loaded');
                    } else {
                        const img = document.createElement('img');
                        img.loading = 'lazy';
                        img.decoding = 'async';
                        img.onload = () => {
                            block.classList.add('loaded');
                        };
                        img.src = imgSrc;
                        // Handle cached images
                        if (img.complete) {
                            block.classList.add('loaded');
                        }
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        block.appendChild(img);
                    }

                    modalVisuals.appendChild(block);
                });
            } else {
                // Fallback to placeholder blocks if no images
                for (let i = 1; i <= 10; i++) {
                    const block = document.createElement('div');
                    block.className = `bento-block block-${i}`;
                    block.classList.add('loaded');
                    modalVisuals.appendChild(block);
                }
            }

            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent scroll

            // Reset modal scroll position to top
            const modalContent = document.querySelector('.modal-content');
            if (modalContent) modalContent.scrollTop = 0;
        }
    };

    document.querySelectorAll('.project-item').forEach(item => {
        item.addEventListener('click', () => {
            const projectId = item.getAttribute('data-project');
            openProject(projectId);
        });
    });

    // Next Project Functionality
    const nextProjectBtn = document.getElementById('next-project-btn');
    const modalBody = document.querySelector('.modal-body');

    if (nextProjectBtn) {
        nextProjectBtn.addEventListener('click', () => {
            if (currentProjectId) {
                const currentIndex = projectKeys.indexOf(currentProjectId);
                const nextIndex = (currentIndex + 1) % projectKeys.length;
                const nextProjectId = projectKeys[nextIndex];

                // Content transition
                if (modalBody) {
                    modalBody.style.opacity = '0';
                    setTimeout(() => {
                        openProject(nextProjectId);
                        modalBody.style.opacity = '1';
                    }, 250);
                } else {
                    openProject(nextProjectId);
                }
            }
        });
    }

    // Info Overlay Toggle
    const infoBtn = document.querySelector('.nav-info-btn');
    const infoOverlay = document.getElementById('info-overlay');

    if (infoBtn && infoOverlay) {
        infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            infoOverlay.classList.toggle('active');
        });

        // Close overlay on click outside
        document.addEventListener('click', (e) => {
            if (!infoOverlay.contains(e.target) && !infoBtn.contains(e.target)) {
                infoOverlay.classList.remove('active');
            }
        });
    }

    // Close Modal Function
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Restore scroll
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    // Escape Key to Close
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });

    // More Work Accordion
    const workItems = document.querySelectorAll('.work-item');
    workItems.forEach(item => {
        item.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            // Close all items
            workItems.forEach(i => {
                if (i.classList.contains('active')) {
                    i.classList.remove('active');
                    i.classList.add('no-hover'); // Prevent immediate hover reappear
                }
            });

            // If the clicked item wasn't active, open it
            if (!isActive) {
                item.classList.add('active');
                item.classList.remove('no-hover');
            }
        });

        // Clear no-hover when the mouse leaves
        item.addEventListener('mouseleave', () => {
            item.classList.remove('no-hover');
        });
    });

    // Video Intersection Observer to play only when in view
    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.play().catch(e => {});
            } else {
                entry.target.pause();
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.more-work video, .square-video').forEach(video => {
        videoObserver.observe(video);
    });

    // Hero Floating Labels
    const squares = document.querySelectorAll('.hero .square');
    const floatingPill = document.getElementById('hero-floating-pill');

    if (floatingPill) {
        let tick = false;
        const updatePill = (e, square) => {
            if (!tick) {
                requestAnimationFrame(() => {
                    const x = e.clientX || (e.touches && e.touches[0].clientX);
                    const y = e.clientY || (e.touches && e.touches[0].clientY);

                    if (x && y) {
                        const label = square.getAttribute('data-label');
                        floatingPill.textContent = label;
                        floatingPill.classList.add('active');

                        // Add color class
                        floatingPill.classList.remove('red', 'green', 'blue');
                        if (square.classList.contains('red-square')) floatingPill.classList.add('red');
                        if (square.classList.contains('green-square')) floatingPill.classList.add('green');
                        if (square.classList.contains('blue-square')) floatingPill.classList.add('blue');

                        floatingPill.style.left = x + 'px';
                        floatingPill.style.top = y + 'px';
                    }
                    tick = false;
                });
                tick = true;
            }
        };

        const hidePill = () => {
            floatingPill.classList.remove('active');
        };

        squares.forEach(square => {
            // Mouse interactions
            square.addEventListener('mouseenter', (e) => {
                updatePill(e, square);
                const video = square.querySelector('.square-video');
                if (video) video.play();
            });
            square.addEventListener('mousemove', (e) => updatePill(e, square));
            square.addEventListener('mouseleave', () => {
                hidePill();
                const video = square.querySelector('.square-video');
                if (video) {
                    video.pause();
                    video.currentTime = 0;
                }
            });

            // Touch interactions
            square.addEventListener('touchstart', (e) => {
                updatePill(e, square);
                const video = square.querySelector('.square-video');
                if (video) video.play();
            }, { passive: true });
            square.addEventListener('touchmove', (e) => updatePill(e, square), { passive: true });
            square.addEventListener('touchend', () => {
                hidePill();
                const video = square.querySelector('.square-video');
                if (video) {
                    video.pause();
                    video.currentTime = 0;
                }
            });
            square.addEventListener('touchcancel', hidePill);
        });
    }
});
