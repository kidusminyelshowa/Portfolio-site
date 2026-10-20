import About from '../components/About.jsx';
import Hero from '../components/Hero.jsx';
import Playground from '../components/Playground.jsx';
import Services from '../components/Services.jsx';
import WorkGrid from '../components/WorkGrid.jsx';

export default function Home() {
    return (
        <>
            <Hero />
            <WorkGrid />
            <Services />
            <About />
            <Playground />
        </>
    );
}
