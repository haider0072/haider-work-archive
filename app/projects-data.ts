// Project catalogue + per-project 3D viewer configuration.
//
// Every field in `viewer` is derived from the source Blender scene (camera,
// world, lights, colour management) so the WebGL viewer can reproduce the
// offline Cycles render as closely as the browser allows, rather than relying
// on one hand-tuned lighting rig for every model.

export type Category = "3D" | "UI/UX" | "Development" | "Experiment";

export type Vec3 = [number, number, number];

/** A single analytic light lifted from the Blender scene. */
export type ViewerLight =
  | {
      kind: "spot";
      // Blender-space location (x, y, z); converted to Three Y-up at runtime.
      position: Vec3;
      // Point the spot looks at, Blender-space. Derived from light direction.
      target: Vec3;
      colorHex: number;
      intensity: number; // Three.js intensity (hand-tuned from Blender watts)
      angleDeg: number; // full cone angle
      penumbra: number; // 0..1 (from Blender spot_blend)
      distance?: number;
      decay?: number;
      castShadow?: boolean;
      // Marks a beam-producing light the volumetric pass should sample.
      volumetric?: boolean;
    }
  | {
      kind: "rect";
      position: Vec3;
      target: Vec3;
      colorHex: number;
      intensity: number;
      width: number;
      height: number;
    }
  | {
      kind: "directional";
      position: Vec3;
      target: Vec3;
      colorHex: number;
      intensity: number;
      castShadow?: boolean;
    };

/** Raymarched volumetric fog box (recreates a Blender Principled Volume). */
export type VolumetricConfig = {
  // Local-space name of the GLB mesh that represents the fog volume; it is
  // hidden and replaced by the raymarched effect using its world bounds.
  sourceMeshName?: string;
  // Explicit fog box bounds (Blender-space min/max) if not derived from mesh.
  boundsMin: Vec3;
  boundsMax: Vec3;
  density: number;
  anisotropy: number; // Henyey-Greenstein g, forward-scatter for beams
  colorHex: number;
  steps: number; // raymarch steps (desktop); mobile uses a fraction
  strength?: number; // gain on beam (spot) in-scatter only
  ambient?: number; // gain on the uniform haze floor, independent of `strength`
};

export type ViewerConfig = {
  // Colour management — mapped to the closest Three tone mapping + exposure.
  toneMapping: "agx" | "filmic" | "neutral" | "aces";
  exposureEV: number; // Blender exposure in stops (linear mult = 2^EV)
  backgroundHex: number;
  // Environment: either an HDRI file (used as scene.environment + background)
  // or a flat colour world.
  environmentHdr?: string;
  environmentRotationDeg?: Vec3; // Blender world mapping rotation
  environmentAsBackground?: boolean;
  environmentIntensity?: number;

  camera:
    | {
        type: "orthographic";
        position: Vec3; // Blender-space
        rotationEulerDeg: Vec3; // Blender-space XYZ euler
        orthoScale: number; // Blender ortho_scale (larger viewport dim, world units)
        shiftX: number; // Blender lens shift_x (fraction of frame)
        shiftY: number;
      }
    | {
        type: "perspective";
        position: Vec3;
        target: Vec3;
        fovVerticalDeg: number;
      };

  lights: ViewerLight[];
  volumetric?: VolumetricConfig;
  // Cap on emissive material intensity (Blender authors these very hot; high
  // values bloom across the whole frame). Applied to any material above it.
  emissiveClamp?: number;

  // Emissive bloom for glowing materials (eyes / lamps / torch).
  bloom?: { strength: number; radius: number; threshold: number };

  // Orbit control tuning.
  orbit: {
    minDistance?: number;
    maxDistance?: number;
    minPolarDeg?: number;
    maxPolarDeg?: number;
    minZoom?: number; // ortho
    maxZoom?: number; // ortho
    autoRotate?: boolean;
  };
};

export type Project = {
  id: number;
  title: string;
  category: Category;
  year: string;
  blurb: string;
  size: "short" | "medium" | "tall" | "wide";
  accent: "blue" | "ink" | "cream" | "night";
  tags: string[];
  thumbnail: string;
  model: string;
  viewer: ViewerConfig;
};

export const projects: Project[] = [
  {
    id: 1,
    title: "Pink Tree Study",
    category: "3D",
    year: "2026",
    blurb:
      "A playful stylised tree, puddle and grass study built in Blender — modelled low-poly, lit with a lakeside sunrise HDRI and framed on an orthographic isometric camera.",
    size: "medium",
    accent: "cream",
    tags: ["Blender", "Environment", "Low poly", "Stylised", "Isometric"],
    thumbnail: "/projects/tree-puddle/final-render.png?v=3",
    model: "/projects/tree-puddle/tree-puddle-scene.glb?v=3",
    viewer: {
      // Neutral tone mapping keeps the vivid pink/yellow/cyan saturation of the
      // Cycles render (AgX desaturates the highlights too much for this bright,
      // colourful scene).
      toneMapping: "neutral",
      exposureEV: 0,
      // Matched to the lit backdrop plane inside the GLB so the plane's far edge
      // does not read as a hard diagonal seam against the surrounding colour.
      backgroundHex: 0xfdf6e4,
      environmentHdr: "/projects/tree-puddle/lakeside-sunrise-2k.hdr?v=4",
      environmentRotationDeg: [0, -30, -148],
      environmentAsBackground: false,
      environmentIntensity: 1.15,
      camera: {
        type: "orthographic",
        position: [5.678516, 2.73531, 4.135495],
        rotationEulerDeg: [56.1039, 0, 144.1199],
        // Blender frames this with ortho_scale 3.5 + a large lens shift for a
        // static composition. In an orbit viewer the target recentres the
        // shot, so we widen the frustum a touch and drop the shift instead of
        // double-counting it (which pushed the tree into a corner). Kept just
        // tight enough that the backdrop plane still fills the frame.
        orthoScale: 5.5,
        shiftX: 0,
        shiftY: 0,
      },
      lights: [
        {
          // The HDRI alone cannot cast anything: image-based lighting carries no
          // shadow in three.js, which is why the diorama floated with no contact
          // shadow at all. This directional key stands in for the HDRI's sun,
          // aimed so the shadow falls to frame-left as it does in the render.
          kind: "directional",
          position: [-0.66, 7.45, 11.14],
          target: [0, 0, 0.7],
          colorHex: 0xfff0dd,
          intensity: 5.2,
          castShadow: true,
        },
      ],
      bloom: { strength: 0.12, radius: 0.5, threshold: 0.9 },
      orbit: {
        minZoom: 0.6,
        maxZoom: 3.2,
        minPolarDeg: 12,
        maxPolarDeg: 86,
        autoRotate: false,
      },
    },
  },
  {
    id: 2,
    title: "Old Man & the Monster",
    category: "3D",
    year: "2026",
    blurb:
      "A cinematic low-poly night scene — a lone figure under a street lamp as a red-eyed monster looms out of the fog. Real Blender lights and volumetric haze recreated live in the browser.",
    size: "wide",
    accent: "night",
    tags: ["Blender", "Cinematic", "Volumetric", "Low poly", "Lighting"],
    thumbnail: "/projects/oldman-monster/final-render.png?v=1",
    model: "/projects/oldman-monster/oldman-monster-scene.glb?v=1",
    viewer: {
      toneMapping: "agx",
      exposureEV: -0.4,
      backgroundHex: 0x060a18,
      environmentIntensity: 0,
      camera: {
        // The scene camera exactly as exported in the GLB (its glTF transform,
        // expressed back in Blender space for the shared conversion below), so the
        // opening shot is the framing the render was composed on: a low, near
        // eye-level 3/4 with both figures in frame.
        type: "perspective",
        position: [8.493312, -10.480357, 3.236283],
        target: [-0.718, 0.052, 2.051],
        fovVerticalDeg: 25.36,
      },
      lights: [
        {
          // Torch / flashlight beam the old man holds — warm orange.
          kind: "spot",
          position: [0.411056, -1.624895, 0.544829],
          // Aim taken from the light's own GLB rotation, not eyeballed.
          target: [0.189, 2.212, 1.654],
          colorHex: 0xff4a08,
          intensity: 22,
          angleDeg: 53.6,
          penumbra: 0.68,
          distance: 14,
          decay: 2,
          castShadow: true,
          // Visible in the render as a warm cone thrown forward across the road
          // into the monster's legs, so it feeds the volumetric pass too.
          volumetric: true,
        },
        {
          // Street lamp — near old man.
          kind: "spot",
          position: [-2.657892, -1.821705, 4.504978],
          target: [-1.692, -1.809, 0.623],
          colorHex: 0xffa040,
          intensity: 220,
          angleDeg: 53.6,
          penumbra: 0.68,
          distance: 16,
          decay: 2,
          castShadow: true,
          volumetric: true,
        },
        {
          // Street lamp — near monster.
          kind: "spot",
          position: [-2.657892, 3.14037, 4.513879],
          target: [-2.378, 3.153, 0.524],
          colorHex: 0xffa040,
          intensity: 220,
          angleDeg: 53.6,
          penumbra: 0.68,
          distance: 16,
          decay: 2,
          castShadow: true,
          volumetric: true,
        },
        {
          // Cool blue fill / moonlight rim.
          kind: "rect",
          position: [-0.472864, 4.925318, 4.913879],
          target: [-0.47, 0, 0],
          colorHex: 0x3358d8,
          intensity: 18,
          width: 6,
          height: 6,
        },
      ],
      volumetric: {
        sourceMeshName: "Fog",
        boundsMin: [-4.67, -5.25, -0.5],
        boundsMax: [2.98, 5.25, 6.5],
        density: 0.15,
        anisotropy: 0.68,
        colorHex: 0x223049,
        steps: 56,
        strength: 260,
        ambient: 0.22,
      },
      emissiveClamp: 2.0,
      // Just enough bloom to make the red eyes and lamp filaments glow, with a
      // high threshold so the haze and lit surfaces never smear to white.
      bloom: { strength: 0.5, radius: 0.4, threshold: 0.85 },
      orbit: {
        minDistance: 6,
        maxDistance: 24,
        minPolarDeg: 40,
        maxPolarDeg: 90,
        autoRotate: false,
      },
    },
  },
];

export const filters = ["All", "3D"] as const;
