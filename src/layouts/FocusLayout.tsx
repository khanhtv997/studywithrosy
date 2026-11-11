import { Outlet } from 'react-router';
import './app-shell.css';
import './product-design.css';

/** Full-screen frame for taking a test: no sidebar, header or footer, nothing to click away to. */
export function FocusLayout() {
  return <div className="app-focus">
    <main id="main-content" className="app-focus-main"><Outlet /></main>
  </div>;
}
