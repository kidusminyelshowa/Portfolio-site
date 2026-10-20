import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Footer from './components/Footer.jsx';
import ProjectModal from './components/ProjectModal.jsx';
import SideNav from './components/SideNav.jsx';
import Archive from './pages/Archive.jsx';
import Contact from './pages/Contact.jsx';
import Home from './pages/Home.jsx';

// The private studio loads on its own, so visitors never download it
const Studio = lazy(() => import('./studio/Studio.jsx'));
// A client's proposal page stands on its own too, without the site's navigation
const ProposalPage = lazy(() => import('./proposal/ProposalPage.jsx'));

// Scroll to the top on page changes, or to the section named in the hash
function useScrollManagement(page) {
    useEffect(() => {
        if (page.hash) {
            const target = document.getElementById(page.hash.slice(1));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
                return;
            }
        }
        window.scrollTo(0, 0);
    }, [page.pathname, page.hash]);
}

function Site() {
    const location = useLocation();
    // A project opened from a page keeps that page behind it
    const page = location.state?.background || location;
    useScrollManagement(page);

    return (
        <>
            <SideNav />
            <main className="main-container">
                <Routes location={page}>
                    <Route path="/work" element={<Archive />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="*" element={<Home />} />
                </Routes>
            </main>
            <Footer />
            <ProjectModal />
        </>
    );
}

export default function App() {
    const { pathname } = useLocation();
    // A studio email link can land on the home page when Supabase falls back to the Site URL. Remember it on first load,
    // since the studio clears the token from the URL straight away.
    const [isAuthReturn] = useState(() => /(access_token|error_code)=/.test(window.location.hash));
    if (pathname === '/studio' || pathname.startsWith('/studio/') || isAuthReturn) {
        return (
            <Suspense fallback={null}>
                <Studio />
            </Suspense>
        );
    }
    if (pathname.startsWith('/proposal/')) {
        return (
            <Suspense fallback={null}>
                <Routes>
                    <Route path="/proposal/:slug" element={<ProposalPage />} />
                </Routes>
            </Suspense>
        );
    }
    return <Site />;
}
