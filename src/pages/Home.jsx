import About from '../components/About.jsx';
import Hero from '../components/Hero.jsx';
import Playground from '../components/Playground.jsx';
import Services from '../components/Services.jsx';
import Values from '../components/Values.jsx';
import WorkGrid from '../components/WorkGrid.jsx';

export default function Home() {
    return (
        <>
            <Hero />
            <WorkGrid />
            <Values />
            <Services />
            <About />
            <Playground />
        </>
    );
}
