"use client";

import { useEffect, useMemo, useState } from "react";
import { filters, projects, type Project } from "./projects-data";
import ModelViewer from "./model-viewer";

export default function Home() {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const visibleProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    return projects.filter((project) => {
      const filterMatch = activeFilter === "All" || project.category === activeFilter;
      const queryMatch =
        !term ||
        [project.title, project.category, ...project.tags].join(" ").toLowerCase().includes(term);
      return filterMatch && queryMatch;
    });
  }, [activeFilter, query]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [selected]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = Math.max(window.scrollY, 0);
      const movement = currentScrollY - lastScrollY;
      if (currentScrollY < 96) setFiltersVisible(true);
      else if (movement > 7) setFiltersVisible(false);
      else if (movement < -7) setFiltersVisible(true);
      setLastScrollY(currentScrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <main>
      <header className="site-header" id="top">
        <a href="#top" className="brand" aria-label="Haider — home">HAIDER<span>*</span></a>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, tools, experiments..."
            aria-label="Search projects"
          />
        </label>
        <nav aria-label="Primary navigation">
          <a className="active" href="#work">Work</a>
          <a href="mailto:hello@haider.work">Contact ↗</a>
        </nav>
      </header>

      <section
        className={`work-tools ${filtersVisible ? "is-visible" : "is-hidden"}`}
        id="work"
        aria-label="Project filters"
      >
        <div className="filters">
          {filters.map((filter) => (
            <button
              key={filter}
              aria-pressed={activeFilter === filter}
              className={activeFilter === filter ? "selected" : ""}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        <span className="project-count">
          {String(visibleProjects.length).padStart(2, "0")}{" "}
          {visibleProjects.length === 1 ? "PROJECT" : "PROJECTS"}
        </span>
      </section>

      {visibleProjects.length ? (
        <section className="masonry" aria-live="polite">
          {visibleProjects.map((project, index) => (
            <button
              className={`project-card size-${project.size}`}
              key={project.id}
              onClick={() => setSelected(project)}
              aria-label={`Open ${project.title} project`}
            >
              <div className={`card-media tone-${project.accent} has-thumbnail`}>
                <div className="visual" aria-hidden="true">
                  <img className="project-render" src={project.thumbnail} alt="" />
                </div>
                <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="interactive-badge"><i>◇</i> 3D · DRAG TO ROTATE</span>
                <span className="open-mark">↗</span>
              </div>
              <span className="card-meta">
                <span><strong>{project.title}</strong><small>{project.category}</small></span>
                <small>{project.year}</small>
              </span>
            </button>
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <strong>NOTHING HERE — YET.</strong>
          <button onClick={() => { setQuery(""); setActiveFilter("All"); }}>Clear search</button>
        </section>
      )}

      <footer>
        <a className="brand" href="#top">HAIDER<span>*</span></a>
        <span>DESIGN · CODE · 3D</span>
        <span>© 2026</span>
      </footer>

      {selected && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}
        >
          <article className="project-modal" role="dialog" aria-modal="true" aria-labelledby="project-title">
            <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close project">
              CLOSE ×
            </button>
            <div className={`modal-visual tone-${selected.accent} model-playground`}>
              <ModelViewer
                title={selected.title}
                config={selected.viewer}
                modelUrl={selected.model}
                thumbnail={selected.thumbnail}
                theme={selected.accent === "night" ? "night" : "cream"}
              />
            </div>
            <div className="modal-copy">
              <div className="modal-label"><span>{selected.category}</span><span>{selected.year}</span></div>
              <h2 id="project-title">{selected.title}</h2>
              <p>{selected.blurb}</p>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
