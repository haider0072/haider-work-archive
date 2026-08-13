"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Object3D, Texture } from "three";

type Category = "3D" | "UI/UX" | "Development" | "Experiment";

type Project = {
  id: number;
  title: string;
  category: Category;
  year: string;
  blurb: string;
  visual: string;
  size: "short" | "medium" | "tall" | "wide";
  interactive?: boolean;
  accent?: "blue" | "ink" | "cream";
  tags: string[];
  thumbnail?: string;
  model?: string;
  environment?: string;
  cameraOrbit?: string;
  cameraTarget?: string;
  fieldOfView?: string;
};

const projects: Project[] = [
  {
    id: 1,
    title: "Pink Tree Study",
    category: "3D",
    year: "2026",
    blurb: "A playful stylised tree, puddle and grass study built in Blender.",
    visual: "tree-puddle",
    size: "medium",
    interactive: true,
    accent: "cream",
    tags: ["Blender", "Environment", "Low poly", "Stylised"],
    thumbnail: "/projects/tree-puddle/final-render.png?v=2",
    model: "/projects/tree-puddle/tree-puddle-scene.glb?v=2",
    environment: "/projects/tree-puddle/lakeside-sunrise-2k.hdr?v=2",
    cameraOrbit: "147deg 49deg 6.35m",
    cameraTarget: "0.03m 0.7m -0.05m",
    fieldOfView: "35deg",
  },
];

const filters = ["All", "3D"] as const;

function ProjectVisual({ project, detailed = false }: { project: Project; detailed?: boolean }) {
  const dots = Array.from({ length: 12 });
  const bars = Array.from({ length: 14 });

  return (
    <div className={`visual visual-${project.visual} ${detailed ? "visual-detailed" : ""}`} aria-hidden="true">
      {project.thumbnail && (
        <img className="project-render" src={project.thumbnail} alt="" />
      )}

      {project.visual === "creature" && (
        <div className="creature-scene">
          <span className="shadow-oval" />
          <span className="creature-arm arm-left" />
          <span className="creature-arm arm-right" />
          <span className="creature-body">
            <i className="eye eye-left" />
            <i className="eye eye-right" />
            <i className="mouth" />
          </span>
          <span className="creature-leg leg-left" />
          <span className="creature-leg leg-right" />
        </div>
      )}

      {project.visual === "dashboard" && (
        <div className="dashboard-ui">
          <div className="dash-top"><b>MAX</b><span /><span /></div>
          <div className="dash-body">
            <aside><i /><i /><i /><i /></aside>
            <div className="dash-content">
              <div className="dash-heading"><strong>Candidates</strong><span>+ Add</span></div>
              {["HA", "SM", "FA", "AK"].map((name, index) => (
                <div className="candidate-row" key={name}><b>{name}</b><i /><em className={index === 0 ? "hot" : ""} /></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {project.visual === "phone" && (
        <div className="phone-shell">
          <div className="phone-island" />
          <b className="lumen-mark">L</b>
          <strong>Send brighter.</strong>
          <div className="transfer-ring"><span>72%</span></div>
          <div className="phone-files"><i /><i /><i /></div>
        </div>
      )}

      {project.visual === "grass" && (
        <div className="grass-scene">
          <span className="grass-sun" />
          {bars.map((_, i) => <i key={i} style={{ "--n": i } as React.CSSProperties} />)}
          <b>LINKED / VARIED</b>
        </div>
      )}

      {project.visual === "city" && (
        <div className="city-scene">
          <span className="city-moon" />
          {bars.slice(0, 10).map((_, i) => <i key={i} style={{ "--n": i } as React.CSSProperties} />)}
          <b>ECHO<br />{"//CITY"}</b>
          <small>00:14:59</small>
        </div>
      )}

      {project.visual === "system" && (
        <div className="system-board">
          <b>Aa</b>
          <strong>BUILD ONCE.<br />SCALE CLEARLY.</strong>
          <div className="swatches"><i /><i /><i /><i /></div>
          <div className="system-pills"><span>Default</span><span>Hover</span><span>Active</span></div>
          {dots.slice(0, 6).map((_, i) => <em key={i} />)}
        </div>
      )}

      {project.visual === "agent" && (
        <div className="agent-scene">
          <div className="agent-light" />
          <span className="agent-head" />
          <span className="agent-body" />
          <span className="agent-arm" />
          <b>AGENT<br />SHAH</b>
          <small>INTERACTIVE ACTION STUDY</small>
        </div>
      )}

      {project.visual === "materials" && (
        <div className="material-shelf">
          <span className="material-ball ball-a" />
          <span className="material-ball ball-b" />
          <span className="material-ball ball-c" />
          <div className="shelf-line" />
          <b>ROUGH / SOFT / WORN</b>
        </div>
      )}

      {project.visual === "media" && (
        <div className="media-ui">
          <div className="media-disc"><span>EMBER</span></div>
          <div className="track-copy"><strong>Midnight Protocol</strong><small>Local stream · FLAC</small></div>
          <div className="waveform">{bars.map((_, i) => <i key={i} style={{ "--n": i } as React.CSSProperties} />)}</div>
          <span className="media-play">▶</span>
        </div>
      )}

      {project.visual === "stocks" && (
        <div className="stocks-ui">
          <div className="stocks-top"><b>PSX</b><span>Market open</span></div>
          <strong>KSE-100</strong><h3>121,641.02</h3><small>+1.82% TODAY</small>
          <div className="chart-line">{bars.slice(0, 11).map((_, i) => <i key={i} style={{ "--n": i } as React.CSSProperties} />)}</div>
          {["LUCK", "MARI", "SYS", "HBL"].map((ticker, i) => <div className="stock-row" key={ticker}><b>{ticker}</b><span>{i % 2 ? "+0.94%" : "+2.14%"}</span></div>)}
        </div>
      )}

      {project.visual === "inbox" && (
        <div className="inbox-ui">
          <header><b>INBOX</b><span>12 open</span></header>
          <div className="inbox-layout">
            <aside>{dots.slice(0, 5).map((_, i) => <i key={i} />)}</aside>
            <main>
              {["Sarah · SMS", "Mikael · Email", "Haider · Voice", "Arman · SMS"].map((thread, i) => <div className={i === 0 ? "active-thread" : ""} key={thread}><b>{thread}</b><span /></div>)}
            </main>
          </div>
        </div>
      )}

      {project.visual === "forge" && (
        <div className="forge-scene">
          <span className="forge-grid" />
          <div className="forge-cube"><i /><i /><i /></div>
          <b>IMAGE<br />→ OBJECT</b>
          <small>FORMFORGE / 006</small>
        </div>
      )}
    </div>
  );
}

function InteractiveModel({ project }: { project: Project }) {
  const [viewerState, setViewerState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadIssue, setLoadIssue] = useState(false);
  const [modelAttempt, setModelAttempt] = useState(0);
  const [viewMode, setViewMode] = useState<"render" | "interactive">("interactive");
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);

  const resetView = () => {
    resetViewRef.current?.();
  };

  useEffect(() => {
    if (!project.model || !canvasHostRef.current) return;

    const modelPath = project.model;
    let disposed = false;
    let cleanup = () => {};
    const host = canvasHostRef.current;
    const loadTimer = window.setTimeout(() => !disposed && setLoadIssue(true), 15000);

    setViewerState("loading");
    setModelLoaded(false);
    setLoadIssue(false);

    const startViewer = async () => {
      try {
        const [THREE, { GLTFLoader }, { RGBELoader }, { OrbitControls }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/loaders/RGBELoader.js"),
          import("three/examples/jsm/controls/OrbitControls.js"),
        ]);

        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1), false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        // A filmic highlight roll-off is closer to the authored Blender view
        // than Neutral, which made the pink and yellow clip too aggressively.
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.VSMShadowMap;
        host.replaceChildren(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xe4ded2);
        scene.environmentIntensity = 0.88;

        // Blender World Mapping: Y -30 degrees / Z -148 degrees. After the
        // Blender-to-glTF axis conversion, Z yaw maps to Three Y and Y tilt to Z.
        scene.environmentRotation.set(
          0,
          THREE.MathUtils.degToRad(-148),
          THREE.MathUtils.degToRad(30),
          "XYZ",
        );

        const camera = new THREE.PerspectiveCamera(
          35,
          Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1),
          0.01,
          100,
        );
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.minDistance = 2.25;
        controls.maxDistance = 9;
        controls.minPolarAngle = THREE.MathUtils.degToRad(18);
        controls.maxPolarAngle = THREE.MathUtils.degToRad(88);

        const intendedTarget = new THREE.Vector3(0.03, 0.7, -0.05);
        const intendedOrbit = new THREE.Spherical(
          6.35,
          THREE.MathUtils.degToRad(49),
          THREE.MathUtils.degToRad(147),
        );
        const intendedPosition = new THREE.Vector3().setFromSpherical(intendedOrbit).add(intendedTarget);

        const applyIntendedView = () => {
          camera.position.copy(intendedPosition);
          camera.fov = 35;
          camera.updateProjectionMatrix();
          controls.target.copy(intendedTarget);
          controls.update();
        };
        applyIntendedView();
        resetViewRef.current = applyIntendedView;

        // A restrained fallback keeps the model visible without flattening the
        // HDRI contrast or washing out the authored materials.
        scene.add(new THREE.AmbientLight(0xfffbf3, 0.16));
        scene.add(new THREE.HemisphereLight(0xffead6, 0x71829a, 0.22));

        // IBL supplies reflections but does not cast realtime shadows. This sun
        // follows the screen-right direction of the Blender HDRI composition.
        const sun = new THREE.DirectionalLight(0xffefdc, 1.38);
        sun.position.set(-4.5, 7, -3.5);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 0.1;
        sun.shadow.camera.far = 24;
        sun.shadow.camera.left = -6;
        sun.shadow.camera.right = 6;
        sun.shadow.camera.top = 6;
        sun.shadow.camera.bottom = -6;
        sun.shadow.bias = -0.0002;
        sun.shadow.normalBias = 0.018;
        sun.shadow.radius = 5;
        sun.shadow.blurSamples = 16;
        scene.add(sun);

        const fill = new THREE.DirectionalLight(0xb8c7df, 0.2);
        fill.position.set(4, 3.5, 3);
        scene.add(fill);

        // The Blender render includes a matte studio floor catching the long
        // tree/grass shadows; that surface is not part of the exported GLB.
        const studioFloor = new THREE.Mesh(
          new THREE.PlaneGeometry(30, 30),
          new THREE.MeshStandardMaterial({
            color: 0xe4ded2,
            metalness: 0,
            roughness: 1,
          }),
        );
        studioFloor.rotation.x = -Math.PI / 2;
        studioFloor.position.y = -0.012;
        studioFloor.receiveShadow = true;
        scene.add(studioFloor);

        const modelUrl = `${modelPath}${modelPath.includes("?") ? "&" : "?"}attempt=${modelAttempt}`;
        let modelRoot: Object3D | null = null;
        let environmentTexture: Texture | null = null;

        new GLTFLoader().load(
          modelUrl,
          (gltf) => {
            if (disposed) return;
            modelRoot = gltf.scene;
            modelRoot.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return;
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              object.castShadow = !materials.some((material) => material.name === "water");
              object.receiveShadow = true;
              materials.forEach((material) => {
                if (material instanceof THREE.MeshStandardMaterial) {
                  material.envMapIntensity = material.name === "water" ? 1.05 : 0.86;
                  material.needsUpdate = true;
                }
              });
            });
            scene.add(modelRoot);
            window.clearTimeout(loadTimer);
            setViewerState("ready");
            setModelLoaded(true);
            setLoadIssue(false);
          },
          undefined,
          () => {
            if (disposed) return;
            window.clearTimeout(loadTimer);
            setViewerState("ready");
            setLoadIssue(true);
          },
        );

        // The original Blender environment enriches reflections and colour,
        // while the explicit lights above remain a reliable visibility floor.
        if (project.environment) {
          new RGBELoader().load(
            project.environment,
            (texture) => {
              if (disposed) {
                texture.dispose();
                return;
              }
              texture.mapping = THREE.EquirectangularReflectionMapping;
              environmentTexture = texture;
              scene.environment = texture;
            },
            undefined,
            () => {
              // Keep the authored key/fill lighting when HDR decoding fails.
            },
          );
        }

        const resize = () => {
          const width = Math.max(host.clientWidth, 1);
          const height = Math.max(host.clientHeight, 1);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        let frame = 0;
        const render = () => {
          if (disposed) return;
          controls.update();
          renderer.render(scene, camera);
          frame = window.requestAnimationFrame(render);
        };
        render();

        cleanup = () => {
          window.cancelAnimationFrame(frame);
          resizeObserver.disconnect();
          controls.dispose();
          environmentTexture?.dispose();
          studioFloor.geometry.dispose();
          studioFloor.material.dispose();
          modelRoot?.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!disposed) {
          window.clearTimeout(loadTimer);
          setViewerState("unavailable");
        }
      }
    };

    startViewer();
    return () => {
      disposed = true;
      window.clearTimeout(loadTimer);
      resetViewRef.current = null;
      cleanup();
    };
  }, [modelAttempt, project.environment, project.model]);

  const retryModel = () => {
    setModelLoaded(false);
    setLoadIssue(false);
    setModelAttempt((attempt) => attempt + 1);
  };

  if (!project.model) return null;

  return (
    <div className={`model-shell is-${viewerState} ${modelLoaded ? "model-loaded" : ""}`}>
      {project.thumbnail && <img className="model-poster-fallback" src={project.thumbnail} alt="" aria-hidden="true" />}
      <div ref={canvasHostRef} className="three-canvas" role="img" aria-label={`Interactive 3D model of ${project.title}`} />
      {viewMode === "render" && project.thumbnail && <img className="render-view" src={project.thumbnail} alt={`${project.title} final Blender render`} />}
      {viewMode === "interactive" && <span className="focus-depth" aria-hidden="true" />}
      <div className="view-switch" aria-label="Viewer mode">
        <button className={viewMode === "render" ? "selected" : ""} onClick={() => setViewMode("render")}>RENDER</button>
        <button className={viewMode === "interactive" ? "selected" : ""} onClick={() => setViewMode("interactive")}>INTERACTIVE</button>
      </div>
      {viewMode === "interactive" && modelLoaded && <button className="reset-view" onClick={resetView}>RESET VIEW ↺</button>}
      {viewMode === "interactive" && modelLoaded && <span className="drag-hint">DRAG TO ORBIT · SCROLL TO ZOOM</span>}
      {viewMode === "interactive" && viewerState === "loading" && <span className="model-loading">PREPARING 3D…</span>}
      {viewMode === "interactive" && viewerState === "ready" && !modelLoaded && !loadIssue && <span className="model-loading">LOADING 3D…</span>}
      {viewMode === "interactive" && viewerState === "ready" && !modelLoaded && loadIssue && (
        <div className="model-load-issue" role="status">
          <span>3D TOOK TOO LONG</span>
          <button onClick={retryModel}>RETRY</button>
          <button onClick={() => setViewMode("render")}>VIEW RENDER</button>
        </div>
      )}
      {viewMode === "interactive" && viewerState === "unavailable" && <span className="model-loading">3D VIEW NEEDS WEBGL</span>}
    </div>
  );
}

export default function Home() {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [rotation, setRotation] = useState({ x: -8, y: -18, dragging: false });
  const [filtersVisible, setFiltersVisible] = useState(true);
  const lastScrollY = useRef(0);

  const visibleProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    return projects.filter((project) => {
      const filterMatch = activeFilter === "All" || project.category === activeFilter;
      const queryMatch = !term || [project.title, project.category, ...project.tags].join(" ").toLowerCase().includes(term);
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
      const movement = currentScrollY - lastScrollY.current;

      if (currentScrollY < 96) {
        setFiltersVisible(true);
      } else if (movement > 7) {
        setFiltersVisible(false);
      } else if (movement < -7) {
        setFiltersVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main>
      <header className="site-header" id="top">
        <a href="#top" className="brand" aria-label="Haider — home">HAIDER<span>*</span></a>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, tools, experiments..." aria-label="Search projects" />
        </label>
        <nav aria-label="Primary navigation">
          <a className="active" href="#work">Work</a>
          <a href="mailto:hello@haider.work">Contact ↗</a>
        </nav>
      </header>

      <section className={`work-tools ${filtersVisible ? "is-visible" : "is-hidden"}`} id="work" aria-label="Project filters">
        <div className="filters">
          {filters.map((filter) => (
            <button key={filter} aria-pressed={activeFilter === filter} className={activeFilter === filter ? "selected" : ""} onClick={() => setActiveFilter(filter)}>
              {filter}
            </button>
          ))}
        </div>
        <span className="project-count">
          {String(visibleProjects.length).padStart(2, "0")} {visibleProjects.length === 1 ? "PROJECT" : "PROJECTS"}
        </span>
      </section>

      {visibleProjects.length ? (
        <section className="masonry" aria-live="polite">
          {visibleProjects.map((project, index) => (
            <button className={`project-card size-${project.size}`} key={project.id} onClick={() => setSelected(project)} aria-label={`Open ${project.title} project`}>
              <div className={`card-media tone-${project.accent ?? "cream"} ${project.thumbnail ? "has-thumbnail" : ""}`}>
                <ProjectVisual project={project} />
                <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
                {project.interactive && <span className="interactive-badge"><i>◇</i> 3D · DRAG TO ROTATE</span>}
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
        <section className="empty-state"><strong>NOTHING HERE — YET.</strong><button onClick={() => { setQuery(""); setActiveFilter("All"); }}>Clear search</button></section>
      )}

      <footer>
        <a className="brand" href="#top">HAIDER<span>*</span></a>
        <span>DESIGN · CODE · 3D</span>
        <span>© 2026</span>
      </footer>

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <article className="project-modal" role="dialog" aria-modal="true" aria-labelledby="project-title">
            <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close project">CLOSE ×</button>
            <div
              className={`modal-visual tone-${selected.accent ?? "cream"} ${selected.model ? "model-playground" : selected.interactive ? "draggable" : ""}`}
              onPointerDown={(event) => {
                if (selected.model) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setRotation((r) => ({ ...r, dragging: true }));
              }}
              onPointerMove={(event) => !selected.model && rotation.dragging && setRotation((r) => ({ ...r, x: r.x - event.movementY * 0.35, y: r.y + event.movementX * 0.35 }))}
              onPointerUp={() => !selected.model && setRotation((r) => ({ ...r, dragging: false }))}
              style={{ "--rx": `${rotation.x}deg`, "--ry": `${rotation.y}deg` } as React.CSSProperties}
            >
              {selected.model ? <InteractiveModel project={selected} /> : <ProjectVisual project={selected} detailed />}
              {selected.interactive && !selected.model && <span className="drag-hint">CLICK + DRAG TO INSPECT</span>}
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
