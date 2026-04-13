import { useEffect, useRef, useState } from 'react';

interface NavSection {
  id: string;
  label: string;
}

const SECTIONS: NavSection[] = [
  { id: 'section-overview', label: 'Overview' },
  { id: 'section-metrics', label: 'Metrics' },
  { id: 'section-trends', label: 'Trends' },
  { id: 'section-network', label: 'Network' },
  { id: 'section-insights', label: 'Insights' },
  { id: 'section-similar', label: 'Similar' },
  { id: 'section-details', label: 'Details' },
];

export function StoryNavRail() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sectionEls = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];

    if (sectionEls.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // Pick the one highest on screen
        const topmost = visible.reduce((prev, curr) =>
          prev.boundingClientRect.top < curr.boundingClientRect.top ? prev : curr,
        );
        setActiveId(topmost.target.id);
      },
      {
        rootMargin: '-10% 0px -60% 0px',
        threshold: 0,
      },
    );

    sectionEls.forEach((el) => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <nav
      className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 w-40 pl-6 flex-col gap-0.5 z-20"
      aria-label="Page sections"
    >
      {/* Vertical line */}
      <div className="absolute left-7 top-2 bottom-2 w-px bg-slate-200" />

      {SECTIONS.map((section) => {
        const isActive = activeId === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollTo(section.id)}
            className="relative flex items-center gap-3 py-1.5 text-left group"
          >
            {/* Dot */}
            <span
              className={`relative z-10 flex h-2 w-2 shrink-0 rounded-full transition-all duration-200 ${
                isActive ? 'bg-blue-600 scale-125' : 'bg-slate-300 group-hover:bg-slate-400'
              }`}
            />
            {/* Label */}
            <span
              className={`text-sm transition-colors duration-200 ${
                isActive
                  ? 'text-blue-600 font-medium'
                  : 'text-slate-400 group-hover:text-slate-600'
              }`}
            >
              {section.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
