import { useNavigate } from 'react-router-dom';
import { Landing } from '../components/Landing';

/** `/`: the landing page, for first-time and returning visitors alike. */
export function LandingPage() {
  const navigate = useNavigate();
  return (
    <Landing
      onOpenApp={() => navigate('/projects')}
      onAddPrototype={() => navigate('/projects', { state: { newProject: true } })}
    />
  );
}
