import FeaturedWork from '../components/FeaturedWork.jsx';
import Footer from '../components/Footer.jsx';
import Hero from '../components/Hero.jsx';
import MoreWork from '../components/MoreWork.jsx';
import ProjectModal from '../components/ProjectModal.jsx';
import SideNav from '../components/SideNav.jsx';

export default function Home() {
    return (
        <>
            <SideNav />
            <main className="main-container">
                <Hero />
                <FeaturedWork />
                <MoreWork />
            </main>
            <Footer />
            <ProjectModal />
        </>
    );
}
