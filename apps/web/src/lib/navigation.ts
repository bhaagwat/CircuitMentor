/**
* Handles logo click navigation and scrolling behavior across pages:
* - Landing: scrolls smoothly to #hero (falls back to window top)
* - Dashboard: scrolls smoothly to #dashboard-top (falls back to container top)
* - Workbench: navigates to /dashboard
*/
export function handleLogoClick(
  page: 'landing' | 'dashboard' | 'workbench',
  navigate?: (path: string) => void
): void {
  if (page === 'landing') {
    const heroElem = document.getElementById('hero');
    if (heroElem) {
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      heroElem.scrollIntoView({
        behavior: prefersReduced ? 'auto' : 'smooth',
        block: 'start',
      });
    } else {
      console.warn(
        '[CircuitMentor Navigation]: Target element #hero not found on Landing page. Falling back to window top.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }

  if (page === 'dashboard') {
    const topElem = document.getElementById('dashboard-top');
    if (topElem) {
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      topElem.scrollTo({
        top: 0,
        behavior: prefersReduced ? 'auto' : 'smooth',
      });
    } else {
      console.warn(
        '[CircuitMentor Navigation]: Target element #dashboard-top not found on Dashboard page. Falling back to window top.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }

  if (page === 'workbench') {
    if (navigate) {
      navigate('/dashboard');
    } else {
      console.warn(
        '[CircuitMentor Navigation]: navigate function missing on Workbench page.'
      );
    }
  }
}

