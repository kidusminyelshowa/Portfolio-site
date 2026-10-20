import { Link, useLocation } from 'react-router-dom';

// Opens a project over the current page, so closing it returns there
export default function ProjectLink({ slug, ...props }) {
    const location = useLocation();
    return <Link to={`/work/${slug}`} state={{ background: location }} preventScrollReset {...props} />;
}
