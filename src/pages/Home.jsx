import Footer from '../components/Footer.jsx';
import Hero from '../components/Hero.jsx';
import ProjectModal from '../components/ProjectModal.jsx';
import SideNav from '../components/SideNav.jsx';
import WorkGrid from '../components/WorkGrid.jsx';

export default function Home() {
    return (
        <>
            <SideNav />
            <main className="main-container">
                <Hero />
                <WorkGrid />
            </main>
            <Footer />
            <ProjectModal />
        </>
    );
}
