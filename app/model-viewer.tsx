"use client";

// Interactive WebGL viewer that reproduces a Blender Cycles scene from a
// declarative `ViewerConfig` (see projects-data.ts). It reconstructs each
// scene's real camera, lights, colour management and (for the night scene) a
// raymarched volumetric-fog pass, so the browser view lands close to the
// offline render instead of relying on one hand-tuned lighting rig.
//
//   * Orthographic + lens-shift (Scene A "tree-puddle"): Blender's ortho_scale
//     + shift_x map to a THREE.OrthographicCamera with an off-centre frustum;
//     OrbitControls is tuned for ortho zoom; lit by a PMREM-prefiltered HDRI.
//   * Perspective (Scene B "oldman-monster"): real spot/area lights, emissive
//     materials, AgX tone mapping, bloom, and a fullscreen raymarched fog pass
//     that recreates the god-ray beams and haze.
//
// Blender is Z-up; the GLB was exported +Y-up, so mesh data is Y-up while the
// camera/light transforms below still arrive in Blender-space and are converted
// at runtime with the fixed basis change  (x, y, z)_blender -> (x, z, -y)_three.

import { useEffect, useRef, useState } from "react";
import type {
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Texture,
  WebGLRenderer,
} from "three";
import type { ViewerConfig, ViewerLight, Vec3 } from "./projects-data";

/** Blender location (x, y, z) -> Three position (x, z, -y). */
function blenderToThreePosition(v: Vec3): [number, number, number] {
  return [v[0], v[2], -v[1]];
}

// Detect low-power / mobile GPUs so the volumetric pass can scale down.
function isLowPowerDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const coarse =
    typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return coarse || cores <= 4 || (typeof mem === "number" && mem <= 4);
}

type ViewerHandle = {
  title: string;
  config: ViewerConfig;
  modelUrl: string;
  onReady: () => void;
  onError: () => void;
};

/** Edge length of the square used to sample a frame for the health probe below. */
const COMPOSER_PROBE_SIZE = 32;
/** How many frames the probe may stay inconclusive before it gives up. */
const COMPOSER_PROBE_ATTEMPTS = 30;

/**
 * Number of sampled pixels that differ from the first one. Zero means the region
 * is a single flat colour — nothing was drawn into it. Null means the region could
 * not be sampled at all, which is not evidence either way.
 */
function frameVariation(
  renderer: WebGLRenderer,
  target: import("three").WebGLRenderTarget,
): number | null {
  const w = Math.min(target.width, COMPOSER_PROBE_SIZE);
  const h = Math.min(target.height, COMPOSER_PROBE_SIZE);
  if (w < 2 || h < 2) return null;
  const x = Math.max(0, Math.floor((target.width - w) / 2));
  const y = Math.max(0, Math.floor((target.height - h) / 2));
  const pixels = new Uint16Array(w * h * 4); // half-float buffers
  try {
    renderer.readRenderTargetPixels(target, x, y, w, h, pixels);
  } catch {
    return null; // readback unsupported here — no verdict rather than a guess
  }
  let distinct = 0;
  for (let i = 4; i < pixels.length; i += 4) {
    if (
      pixels[i] !== pixels[0] ||
      pixels[i + 1] !== pixels[1] ||
      pixels[i + 2] !== pixels[2]
    ) {
      distinct++;
    }
  }
  return distinct;
}

/**
 * True if the post-processing chain rendered something, false if it produced a flat
 * frame while a direct render of the same scene did not, null if inconclusive.
 */
function composerProducedAnImage(
  THREE: typeof import("three"),
  renderer: WebGLRenderer,
  composer: import("three/examples/jsm/postprocessing/EffectComposer.js").EffectComposer,
  scene: import("three").Scene,
  camera: OrthographicCamera | PerspectiveCamera,
  syncPassUniforms: () => void,
): boolean | null {
  const scratch = new THREE.WebGLRenderTarget(
    COMPOSER_PROBE_SIZE,
    COMPOSER_PROBE_SIZE,
    { type: THREE.HalfFloatType },
  );
  try {
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(scratch);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previousTarget);

    const direct = frameVariation(renderer, scratch);
    // Nothing on screen yet, or no readback — there is nothing to compare against.
    if (direct === null || direct === 0) return null;

    const wasRenderingToScreen = composer.renderToScreen;
    composer.renderToScreen = false;
    syncPassUniforms();
    composer.render();
    composer.renderToScreen = wasRenderingToScreen;

    const composed = frameVariation(renderer, composer.readBuffer);
    if (composed === null) return null;
    return composed > 0;
  } finally {
    scratch.dispose();
  }
}

async function mountViewer(
  host: HTMLDivElement,
  handle: ViewerHandle,
  resetViewRef: React.MutableRefObject<(() => void) | null>,
  isDisposed: () => boolean,
): Promise<() => void> {
  const [
    THREE,
    { GLTFLoader },
    { HDRLoader },
    { OrbitControls },
    { RectAreaLightUniformsLib },
    { EffectComposer },
    { RenderPass },
    { ShaderPass },
    { OutputPass },
    { UnrealBloomPass },
  ] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/loaders/HDRLoader.js"),
    import("three/examples/jsm/controls/OrbitControls.js"),
    import("three/examples/jsm/lights/RectAreaLightUniformsLib.js"),
    import("three/examples/jsm/postprocessing/EffectComposer.js"),
    import("three/examples/jsm/postprocessing/RenderPass.js"),
    import("three/examples/jsm/postprocessing/ShaderPass.js"),
    import("three/examples/jsm/postprocessing/OutputPass.js"),
    import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
  ]);

  if (isDisposed()) return () => {};

  // RectAreaLight contributes nothing until its BRDF LUT is initialised once.
  RectAreaLightUniformsLib.init();

  const { config } = handle;
  const width = Math.max(host.clientWidth, 1);
  const height = Math.max(host.clientHeight, 1);
  const lowPower = isLowPowerDevice();

  // -- Renderer -------------------------------------------------------------
  const renderer: WebGLRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Blender colour management -> closest Three tone mapping. Blender replaced
  // "Filmic" with AgX, so AgX is the closest roll-off for both. Exposure is in
  // stops, so the linear multiplier is 2^EV. Tone mapping is applied by the
  // final OutputPass (it reads renderer.toneMapping); RenderPass into an
  // offscreen target is not tone-mapped, so we set it once and leave it.
  const toneMap = {
    agx: THREE.AgXToneMapping,
    filmic: THREE.AgXToneMapping,
    neutral: THREE.NeutralToneMapping,
    aces: THREE.ACESFilmicToneMapping,
  } as const;
  renderer.toneMapping = toneMap[config.toneMapping] ?? THREE.AgXToneMapping;
  renderer.toneMappingExposure = Math.pow(2, config.exposureEV);
  renderer.shadowMap.enabled = true;
  // PCF over VSM: VSM's light bleeding washed the diorama's contact shadow out
  // entirely against a strong image-based environment. (PCFSoftShadowMap is
  // deprecated in this version of three and silently downgrades to this anyway.)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.replaceChildren(renderer.domElement);

  // -- Scene ----------------------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.backgroundHex);
  if (config.environmentIntensity !== undefined) {
    scene.environmentIntensity = config.environmentIntensity;
  }

  // -- Camera (ortho + shift, or perspective) -------------------------------
  const cam = config.camera;
  const aspect = width / height;

  let orthoScale = 3.5;
  let shiftX = 0;
  let shiftY = 0;
  let isOrtho = false;

  let camera: OrthographicCamera | PerspectiveCamera;

  function applyOrthoFrustum(orthoCam: OrthographicCamera, viewAspect: number) {
    let halfW: number;
    let halfH: number;
    if (viewAspect >= 1) {
      halfW = orthoScale / 2;
      halfH = halfW / viewAspect;
    } else {
      halfH = orthoScale / 2;
      halfW = halfH * viewAspect;
    }
    const largerFull = 2 * Math.max(halfW, halfH);
    const ox = shiftX * largerFull;
    const oy = shiftY * largerFull;
    orthoCam.left = -halfW + ox;
    orthoCam.right = halfW + ox;
    orthoCam.top = halfH + oy;
    orthoCam.bottom = -halfH + oy;
    orthoCam.updateProjectionMatrix();
  }

  if (cam.type === "orthographic") {
    isOrtho = true;
    orthoScale = cam.orthoScale;
    shiftX = cam.shiftX;
    shiftY = cam.shiftY;

    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 1000);
    applyOrthoFrustum(orthoCam, aspect);
    orthoCam.position.set(...blenderToThreePosition(cam.position));

    // Convert Blender's XYZ euler to a quaternion, then reinterpret the axes
    // into Three space with a -90 degree X basis rotation. (OrbitControls will
    // re-derive orientation from position->target immediately; for a ~0-roll
    // isometric 3/4 this is visually identical.)
    const d2r = Math.PI / 180;
    const eBlender = new THREE.Euler(
      cam.rotationEulerDeg[0] * d2r,
      cam.rotationEulerDeg[1] * d2r,
      cam.rotationEulerDeg[2] * d2r,
      "XYZ",
    );
    const qBlender = new THREE.Quaternion().setFromEuler(eBlender);
    const qConv = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -Math.PI / 2,
    );
    orthoCam.quaternion.copy(qConv.clone().multiply(qBlender));
    orthoCam.updateMatrixWorld();
    camera = orthoCam;
  } else {
    camera = new THREE.PerspectiveCamera(cam.fovVerticalDeg, aspect, 0.05, 200);
    camera.position.set(...blenderToThreePosition(cam.position));
  }

  // -- OrbitControls --------------------------------------------------------
  const controls = new OrbitControls(camera, renderer.domElement);
  // Damping is disabled: with it on, the small mismatch between the authored
  // camera position and the spherical OrbitControls derives from the target
  // gets eased over several seconds, slowly drifting the opening shot into a
  // brighter angle. Off = the framing stays exactly where authored.
  controls.enableDamping = false;
  controls.rotateSpeed = 0.85;

  const orbitTarget =
    cam.type === "perspective"
      ? new THREE.Vector3(...blenderToThreePosition(cam.target))
      : new THREE.Vector3(0, 0.7, 0);
  controls.target.copy(orbitTarget);

  if (isOrtho) {
    controls.minZoom = config.orbit.minZoom ?? 0.5;
    controls.maxZoom = config.orbit.maxZoom ?? 4;
  } else {
    controls.minDistance = config.orbit.minDistance ?? 2;
    controls.maxDistance = config.orbit.maxDistance ?? 24;
  }
  if (config.orbit.minPolarDeg !== undefined) {
    controls.minPolarAngle = THREE.MathUtils.degToRad(config.orbit.minPolarDeg);
  }
  if (config.orbit.maxPolarDeg !== undefined) {
    controls.maxPolarAngle = THREE.MathUtils.degToRad(config.orbit.maxPolarDeg);
  }
  controls.autoRotate = config.orbit.autoRotate ?? false;

  const homePosition = camera.position.clone();
  const homeZoom = isOrtho ? (camera as OrthographicCamera).zoom : 1;

  const resetView = () => {
    camera.position.copy(homePosition);
    if (isOrtho) {
      (camera as OrthographicCamera).zoom = homeZoom;
      camera.updateProjectionMatrix();
    }
    controls.target.copy(orbitTarget);
    controls.update();
  };
  controls.update();
  resetViewRef.current = resetView;

  // -- Analytic lights + env fallback ---------------------------------------
  const lightObjects: Object3D[] = [];
  const volumetricSpots: import("three").SpotLight[] = [];

  // -- HDRI environment (PMREM-prefiltered for correct PBR roughness) -------
  let environmentTexture: Texture | null = null;
  let pmremRT: import("three").WebGLRenderTarget | null = null;
  if (config.environmentHdr) {
    // Fallback lighting so an HDR that fails to load never leaves an
    // otherwise-unlit (HDRI-only) scene rendering pure black. Removed once the
    // real environment is in place.
    const fallbackLight = new THREE.HemisphereLight(0xfff2e0, 0x8a94a6, 1.1);
    scene.add(fallbackLight);
    lightObjects.push(fallbackLight);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    new HDRLoader().load(
      config.environmentHdr,
      (texture) => {
        if (isDisposed()) {
          texture.dispose();
          pmrem.dispose();
          return;
        }
        scene.remove(fallbackLight);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const rt = pmrem.fromEquirectangular(texture);
        pmremRT = rt;
        scene.environment = rt.texture;
        if (config.environmentAsBackground) {
          environmentTexture = texture; // keep raw equirect for the background
          scene.background = texture;
        } else {
          texture.dispose();
        }
        pmrem.dispose();

        // Blender World mapping rotation (deg). After the Blender->glTF axis
        // conversion, Blender Z-yaw maps to Three Y and Blender Y-tilt to Z.
        if (config.environmentRotationDeg) {
          const [rx, ry, rz] = config.environmentRotationDeg;
          const rot = new THREE.Euler(
            THREE.MathUtils.degToRad(rx),
            THREE.MathUtils.degToRad(-rz),
            THREE.MathUtils.degToRad(ry),
            "XYZ",
          );
          scene.environmentRotation.copy(rot);
          scene.backgroundRotation.copy(rot);
        }
      },
      undefined,
      () => {
        pmrem.dispose();
        // Missing/corrupt HDR: keep the flat background + any analytic lights.
      },
    );
  }

  // -- Analytic lights ------------------------------------------------------
  for (const light of config.lights) {
    const created = createLight(THREE, light);
    for (const obj of created) {
      scene.add(obj);
      lightObjects.push(obj);
    }
    if (light.kind === "spot" && light.volumetric && created[0]) {
      volumetricSpots.push(created[0] as import("three").SpotLight);
    }
  }

  // -- Model ----------------------------------------------------------------
  let modelRoot: Object3D | null = null;
  new GLTFLoader().load(
    handle.modelUrl,
    (gltf) => {
      if (isDisposed()) return;
      modelRoot = gltf.scene;

      // Blender ships its own lights inside the GLB via KHR_lights_punctual, and the
      // exporter converts watts to candela — a 1000 W lamp arrives as intensity 54351,
      // which floods the frame. `config.lights` already reconstructs this rig with
      // values tuned for three's falloff, so drop the imported copies instead of
      // letting the two rigs stack.
      const importedLights: Object3D[] = [];
      modelRoot.traverse((object) => {
        if ((object as { isLight?: boolean }).isLight) importedLights.push(object);
      });
      for (const light of importedLights) light.parent?.remove(light);

      modelRoot.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        // Hide the Blender volume proxy mesh; real volumetrics replace it.
        if (
          config.volumetric?.sourceMeshName &&
          object.name === config.volumetric.sourceMeshName
        ) {
          object.visible = false;
        }
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            // Only lean on the environment map when there IS one; the night
            // scene is lit purely by analytic lights. Avoid double-applying
            // env intensity (scene.environmentIntensity already scales IBL).
            if (config.environmentHdr) material.envMapIntensity = 1;
            // Blender authored the lamp/torch emissives very hot (strength 7-8);
            // at that level bloom smears them across the whole frame. Tame the
            // emissive intensity so they glow without blowing out.
            if (config.emissiveClamp !== undefined && material.emissiveIntensity > config.emissiveClamp) {
              material.emissiveIntensity = config.emissiveClamp;
            }
            material.needsUpdate = true;
          }
        }
      });
      scene.add(modelRoot);
      handle.onReady();
    },
    undefined,
    () => {
      if (isDisposed()) return;
      handle.onError();
    },
  );

  // -- Post-processing composer ---------------------------------------------
  // Perspective scenes with emissives/fog get the full pipeline: RenderPass ->
  // volumetric fog -> bloom -> OutputPass. The ortho HDRI scene renders direct.
  const drawSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const wantsComposer =
    !isOrtho && (!!config.volumetric || !!config.bloom) && !!config.bloom;

  let composer: import("three/examples/jsm/postprocessing/EffectComposer.js").EffectComposer | null = null;
  let fogPass: import("three/examples/jsm/postprocessing/ShaderPass.js").ShaderPass | null = null;
  let bloomPass: import("three/examples/jsm/postprocessing/UnrealBloomPass.js").UnrealBloomPass | null = null;

  if (wantsComposer) {
    // Each of the composer's two ping-pong buffers needs its OWN depth attachment.
    // The fog pass samples the depth of the buffer it reads while writing into the
    // other one; if both buffers shared a single DepthTexture, that texture would be
    // a bound depth attachment and a sampled texture in the same draw call — a GL
    // feedback loop, which renders nothing at all and reports no error.
    // EffectComposer clones the render target it is given, and RenderTarget.clone()
    // clones the depth texture with it, so passing one here yields two independent
    // attachments; nothing further should reassign them.
    const sceneDepth = new THREE.DepthTexture(drawSize.x, drawSize.y);
    sceneDepth.type = THREE.UnsignedIntType;
    sceneDepth.format = THREE.DepthFormat;

    const rt = new THREE.WebGLRenderTarget(drawSize.x, drawSize.y, {
      depthTexture: sceneDepth,
      depthBuffer: true,
      type: THREE.HalfFloatType,
      samples: 0,
    });

    composer = new EffectComposer(renderer, rt);
    // Size the composer in CSS pixels: setSize() applies the renderer's pixel ratio
    // itself, and addPass() derives each pass's size the same way. Constructing it
    // from a device-pixel target leaves _width in device pixels, which would then
    // allocate every pass at pixelRatio^2.
    composer.setSize(width, height);

    composer.addPass(new RenderPass(scene, camera));

    if (config.volumetric && !lowPower) {
      fogPass = new ShaderPass(
        buildVolumetricShader(THREE, config, volumetricSpots.length || 1),
      );
      composer.addPass(fogPass);
    }

    if (config.bloom) {
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(drawSize.x, drawSize.y),
        config.bloom.strength,
        config.bloom.radius,
        config.bloom.threshold,
      );
      composer.addPass(bloomPass);
    }

    composer.addPass(new OutputPass());
  }

  // Reusable temporaries for per-frame uniform updates (avoid per-frame allocs).
  const tmpInvVP = new THREE.Matrix4();
  const tmpCamPos = new THREE.Vector3();

  function updateFogUniforms() {
    if (!fogPass || !config.volumetric || !composer) return;
    // RenderPass draws into the composer's current read buffer, so that buffer's
    // depth attachment holds this frame's depth. The two buffers swap once per
    // enabled swapping pass, so which one that is has to be re-read every frame
    // rather than bound once at setup.
    fogPass.uniforms.tDepth.value = composer.readBuffer.depthTexture;
    camera.updateMatrixWorld();
    tmpInvVP
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .invert();
    const u = fogPass.uniforms;
    u.uInvViewProj.value.copy(tmpInvVP);
    u.uCamPos.value.copy(camera.getWorldPosition(tmpCamPos));
    u.uNear.value = (camera as PerspectiveCamera).near;
    u.uFar.value = (camera as PerspectiveCamera).far;
    // Refresh spot transforms (targets may have settled after add()).
    volumetricSpots.forEach((spot, i) => {
      spot.updateMatrixWorld();
      spot.target.updateMatrixWorld();
      const p = spot.getWorldPosition(new THREE.Vector3());
      const tp = spot.target.getWorldPosition(new THREE.Vector3());
      const dir = tp.sub(p).normalize();
      (u.uSpotPos.value as import("three").Vector3[])[i].copy(p);
      (u.uSpotDir.value as import("three").Vector3[])[i].copy(dir);
    });
  }

  // -- Resize ---------------------------------------------------------------
  const resize = () => {
    const w = Math.max(host.clientWidth, 1);
    const h = Math.max(host.clientHeight, 1);
    const a = w / h;
    if (isOrtho) {
      applyOrthoFrustum(camera as OrthographicCamera, a);
    } else {
      (camera as PerspectiveCamera).aspect = a;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(w, h, false);
    if (composer) {
      // CSS pixels — setSize() applies the pixel ratio to the buffers and to every
      // pass. Both depth textures are resized by three when their render target's
      // framebuffer is rebuilt.
      composer.setSize(w, h);
      const ds = renderer.getDrawingBufferSize(new THREE.Vector2());
      if (fogPass) fogPass.uniforms.uResolution.value.set(ds.x, ds.y);
    }
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  // -- Render loop ----------------------------------------------------------
  // A post-processing chain that fails at the GL level — an incomplete framebuffer,
  // a texture bound for sampling and as an attachment in the same draw, a driver that
  // rejects a pass — neither throws nor logs. It just yields an empty frame, which
  // reads to the user as a broken viewer. Compare one composed frame against a direct
  // render of the same scene and drop the chain if it produced nothing. Inconclusive
  // attempts (nothing drawn yet, no readback support) retry for a bounded number of
  // frames and then leave the chain alone.
  let probesRemaining = COMPOSER_PROBE_ATTEMPTS;

  let frame = 0;
  const renderLoop = () => {
    if (isDisposed()) return;
    controls.update();

    if (composer && probesRemaining > 0 && modelRoot) {
      probesRemaining--;
      let healthy: boolean | null = null;
      try {
        healthy = composerProducedAnImage(
          THREE,
          renderer,
          composer,
          scene,
          camera,
          updateFogUniforms,
        );
      } catch (error) {
        console.warn("[model-viewer] post-processing probe failed", error);
        healthy = false;
      }
      if (healthy === false) {
        console.warn(
          "[model-viewer] post-processing produced an empty frame; falling back to direct rendering",
        );
        composer.dispose();
        composer = null;
      } else if (healthy === true) {
        probesRemaining = 0;
      }
    }

    if (composer) {
      updateFogUniforms();
      // (Jitter is static per-pixel now, so no per-frame counter is needed.)
      try {
        composer.render();
      } catch (error) {
        console.warn(
          "[model-viewer] post-processing threw; falling back to direct rendering",
          error,
        );
        composer.dispose();
        composer = null;
        renderer.render(scene, camera);
      }
    } else {
      renderer.render(scene, camera);
    }
    frame = window.requestAnimationFrame(renderLoop);
  };
  renderLoop();

  // -- Cleanup --------------------------------------------------------------
  return () => {
    window.cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    controls.dispose();
    environmentTexture?.dispose();
    pmremRT?.dispose();
    composer?.renderTarget1.depthTexture?.dispose();
    composer?.renderTarget2.depthTexture?.dispose();
    fogPass?.dispose?.();
    bloomPass?.dispose?.();
    composer?.dispose?.();
    for (const obj of lightObjects) obj.parent?.remove(obj);
    modelRoot?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

/**
 * Fullscreen raymarched volumetric fog + god-rays for the night scene.
 * Reads scene colour + depth, marches the camera ray through the fog AABB,
 * accumulates spot-light in-scattering (Henyey-Greenstein), and composites the
 * result additively before tone mapping. GLSL1 lane (texture2D / gl_FragColor).
 */
function buildVolumetricShader(
  THREE: typeof import("three"),
  config: ViewerConfig,
  spotCount: number,
) {
  const vol = config.volumetric!;
  const nSpot = Math.max(spotCount, 1);
  // Blender-space AABB -> Three-space AABB via (x, z, -y). y flips sign, so
  // recompute min/max after the swap.
  const bMin = vol.boundsMin;
  const bMax = vol.boundsMax;
  const toThree = (v: Vec3): [number, number, number] => [v[0], v[2], -v[1]];
  const c0 = toThree(bMin);
  const c1 = toThree(bMax);
  const boxMin = new THREE.Vector3(
    Math.min(c0[0], c1[0]),
    Math.min(c0[1], c1[1]),
    Math.min(c0[2], c1[2]),
  );
  const boxMax = new THREE.Vector3(
    Math.max(c0[0], c1[0]),
    Math.max(c0[1], c1[1]),
    Math.max(c0[2], c1[2]),
  );

  const steps = config.volumetric!.steps;

  return {
    uniforms: {
      tDiffuse: { value: null as Texture | null },
      tDepth: { value: null as import("three").DepthTexture | null },
      uInvViewProj: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uNear: { value: 0.05 },
      uFar: { value: 200 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uFrame: { value: 0 },
      uBoxMin: { value: boxMin },
      uBoxMax: { value: boxMax },
      uSteps: { value: steps },
      uSigmaT: { value: vol.density },
      uG: { value: vol.anisotropy },
      uStrength: { value: vol.strength ?? 1.0 },
      uAmbient: { value: vol.ambient ?? 0.05 },
      uAmbientHaze: {
        // Faint blue floor so shadowed haze isn't pure black; scaled by uAmbient
        // independently of the beam gain so the deep night contrast survives.
        value: new THREE.Color(vol.colorHex),
      },
      uSpotPos: {
        value: Array.from({ length: nSpot }, () => new THREE.Vector3()),
      },
      uSpotDir: {
        value: Array.from({ length: nSpot }, () => new THREE.Vector3(0, -1, 0)),
      },
      uSpotColor: {
        // Beam colour, weighted by the light's own intensity so a dim torch and a
        // bright street lamp keep their relative strength in the haze. Absolute
        // brightness is governed by the scattering integral and uStrength.
        value: config.lights
          .filter((l) => l.kind === "spot" && l.volumetric)
          .map((l) =>
            new THREE.Color((l as { colorHex: number }).colorHex).multiplyScalar(
              Math.min(((l as { intensity: number }).intensity ?? 1) / 120, 2.0),
            ),
          ),
      },
      uSpotCosOuter: {
        value: config.lights
          .filter((l) => l.kind === "spot" && l.volumetric)
          .map((l) =>
            Math.cos(THREE.MathUtils.degToRad((l as { angleDeg: number }).angleDeg) * 0.5),
          ),
      },
      uSpotCosInner: {
        value: config.lights
          .filter((l) => l.kind === "spot" && l.volumetric)
          .map((l) => {
            const half =
              THREE.MathUtils.degToRad((l as { angleDeg: number }).angleDeg) * 0.5;
            return Math.cos(half * (1 - (l as { penumbra: number }).penumbra));
          }),
      },
      uSpotRange: {
        value: config.lights
          .filter((l) => l.kind === "spot" && l.volumetric)
          .map((l) => (l as { distance?: number }).distance ?? 20),
      },
    },
    defines: {
      NSPOT: nSpot,
      MAX_STEPS: Math.max(steps, 96),
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #define PI 3.141592653589793
      varying vec2 vUv;

      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform mat4  uInvViewProj;
      uniform vec3  uCamPos;
      uniform float uNear;
      uniform float uFar;
      uniform int   uSteps;
      uniform float uSigmaT;
      uniform float uG;
      uniform float uStrength;
      uniform float uAmbient;
      uniform vec3  uAmbientHaze;
      uniform vec3  uBoxMin;
      uniform vec3  uBoxMax;
      uniform float uFrame;

      uniform vec3  uSpotPos[NSPOT];
      uniform vec3  uSpotDir[NSPOT];
      uniform vec3  uSpotColor[NSPOT];
      uniform float uSpotCosOuter[NSPOT];
      uniform float uSpotCosInner[NSPOT];
      uniform float uSpotRange[NSPOT];

      float hash12(vec2 p){
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float hg(float cosT, float g){
        float g2 = g * g;
        return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
      }

      bool intersectBox(vec3 ro, vec3 rd, out float t0, out float t1){
        vec3 inv = 1.0 / rd;
        vec3 a = (uBoxMin - ro) * inv;
        vec3 b = (uBoxMax - ro) * inv;
        vec3 tmin = min(a, b), tmax = max(a, b);
        t0 = max(max(tmin.x, tmin.y), tmin.z);
        t1 = min(min(tmax.x, tmax.y), tmax.z);
        return t1 > max(t0, 0.0);
      }

      vec3 spotInScatter(int i, vec3 p, vec3 rayDir){
        vec3 L = uSpotPos[i] - p;
        float dist = length(L);
        L /= dist;
        float cosA = dot(-L, uSpotDir[i]);
        float cone = smoothstep(uSpotCosOuter[i], uSpotCosInner[i], cosA);
        if (cone <= 0.0) return vec3(0.0);
        // Distance falloff with a soft floor (0.5) so rays grazing the lamp
        // itself don't spike to huge values and blow out the frame.
        float atten = cone / (0.5 + dist * dist);
        atten *= 1.0 - smoothstep(uSpotRange[i] * 0.7, uSpotRange[i], dist);
        // phase: (toward camera) . (toward light) — forward beams face the eye.
        float phase = hg(dot(-rayDir, -L), uG);
        // Clamp per-sample radiance to keep the integral well behaved.
        return min(uSpotColor[i] * atten * phase, vec3(1.5));
      }

      void main(){
        vec3 sceneColor = texture2D(tDiffuse, vUv).rgb;

        // Reconstruct the world ray for this pixel and the scene hit distance.
        float rawDepth = texture2D(tDepth, vUv).x;
        vec4 farNdc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
        vec4 farW = uInvViewProj * farNdc; farW /= farW.w;
        vec3 rayDir = normalize(farW.xyz - uCamPos);

        float sceneDist;
        if (rawDepth > 0.9999) {
          sceneDist = 1e9; // sky / empty
        } else {
          vec4 ndc = vec4(vUv * 2.0 - 1.0, rawDepth * 2.0 - 1.0, 1.0);
          vec4 wp = uInvViewProj * ndc; wp /= wp.w;
          sceneDist = distance(wp.xyz, uCamPos);
        }

        float t0, t1;
        if (!intersectBox(uCamPos, rayDir, t0, t1)) {
          gl_FragColor = vec4(sceneColor, 1.0);
          return;
        }
        float tStart = max(t0, 0.0);
        float tEnd = min(t1, sceneDist);
        if (tEnd <= tStart) {
          gl_FragColor = vec4(sceneColor, 1.0);
          return;
        }

        float span = tEnd - tStart;
        float dt = span / float(uSteps);
        // Static per-pixel dither (no time term): breaks up banding without the
        // temporal shimmer/precision drift that a growing frame counter causes.
        float jitter = hash12(gl_FragCoord.xy);
        float t = tStart + jitter * dt;

        // Beam and ambient in-scatter accumulate separately. A single 1/d^2 spot
        // sample carries far less energy than the uniform haze term, so one shared
        // gain cannot serve both: the multiplier that makes the god-ray cones read
        // also floods the whole fog box to a flat milky grey.
        vec3 beam = vec3(0.0);
        vec3 ambient = vec3(0.0);
        float transmittance = 1.0;

        for (int s = 0; s < MAX_STEPS; ++s) {
          if (s >= uSteps) break;
          vec3 p = uCamPos + rayDir * t;
          float stepT = exp(-uSigmaT * dt);

          vec3 inScat = vec3(0.0);
          for (int i = 0; i < NSPOT; ++i) {
            inScat += spotInScatter(i, p, rayDir);
          }

          // Scattering is proportional to the medium density over the step
          // (uSigmaT * dt), so total in-scatter stays bounded regardless of how
          // many steps subdivide the beam — otherwise it blows out.
          float density = transmittance * uSigmaT * dt;
          beam += inScat * density;
          ambient += uAmbientHaze * density;
          transmittance *= stepT;
          t += dt;
          if (transmittance < 0.01) break;
        }

        // Bound the integral so a ray grazing a lamp cannot spike to a huge value,
        // but leave enough headroom for the beam cores to reach the near-white the
        // render has — the tone mapper does the roll-off from here.
        vec3 scatter = min(beam * uStrength + ambient * uAmbient, vec3(1.2));
        vec3 outColor = sceneColor + scatter;
        gl_FragColor = vec4(outColor, 1.0);
      }
    `,
  };
}

function createLight(
  THREE: typeof import("three"),
  light: ViewerLight,
): Object3D[] {
  const pos = blenderToThreePosition(light.position);

  if (light.kind === "spot") {
    const spot = new THREE.SpotLight(
      light.colorHex,
      light.intensity,
      light.distance ?? 0,
      THREE.MathUtils.degToRad(light.angleDeg / 2),
      light.penumbra,
      light.decay ?? 2,
    );
    spot.position.set(...pos);
    const target = new THREE.Object3D();
    target.position.set(...blenderToThreePosition(light.target));
    spot.target = target;
    if (light.castShadow) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0004;
      spot.shadow.camera.near = 0.5;
      spot.shadow.camera.far = light.distance ?? 30;
    }
    return [spot, target];
  }

  if (light.kind === "rect") {
    const rect = new THREE.RectAreaLight(
      light.colorHex,
      light.intensity,
      light.width,
      light.height,
    );
    rect.position.set(...pos);
    rect.lookAt(...blenderToThreePosition(light.target));
    return [rect];
  }

  const dir = new THREE.DirectionalLight(light.colorHex, light.intensity);
  dir.position.set(...pos);
  const target = new THREE.Object3D();
  target.position.set(...blenderToThreePosition(light.target));
  dir.target = target;
  if (light.castShadow) {
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    // The default +/-5 ortho frustum clips a diorama this size, dropping the cast
    // shadow off the backdrop entirely.
    const shadowCamera = dir.shadow.camera;
    shadowCamera.left = -9;
    shadowCamera.right = 9;
    shadowCamera.top = 9;
    shadowCamera.bottom = -9;
    shadowCamera.near = 0.5;
    shadowCamera.far = 40;
    shadowCamera.updateProjectionMatrix();
    dir.shadow.bias = -0.0008;
    dir.shadow.normalBias = 0.02;
  }
  return [dir, target];
}

// ---------------------------------------------------------------------------
// React wrapper: owns lifecycle, loading UI, render/interactive toggle.
// ---------------------------------------------------------------------------

export type ModelViewerProps = {
  title: string;
  config: ViewerConfig;
  modelUrl: string;
  thumbnail: string;
  /** Dark scenes want a near-black viewer chrome; bright scenes stay cream. */
  theme?: "cream" | "night";
};

export default function ModelViewer({
  title,
  config,
  modelUrl,
  thumbnail,
  theme = "cream",
}: ModelViewerProps) {
  const [viewerState, setViewerState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadIssue, setLoadIssue] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [viewMode, setViewMode] = useState<"render" | "interactive">(
    "interactive",
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let cleanup = () => {};
    const isDisposed = () => disposed;
    const loadTimer = window.setTimeout(
      () => !disposed && setLoadIssue(true),
      15000,
    );

    setViewerState("loading");
    setModelLoaded(false);
    setLoadIssue(false);

    const url = `${modelUrl}${modelUrl.includes("?") ? "&" : "?"}attempt=${attempt}`;

    mountViewer(
      host,
      {
        title,
        config,
        modelUrl: url,
        onReady: () => {
          if (disposed) return;
          window.clearTimeout(loadTimer);
          setViewerState("ready");
          setModelLoaded(true);
          setLoadIssue(false);
        },
        onError: () => {
          if (disposed) return;
          window.clearTimeout(loadTimer);
          setViewerState("ready");
          setLoadIssue(true);
        },
      },
      resetViewRef,
      isDisposed,
    )
      .then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        cleanup = dispose;
      })
      .catch(() => {
        if (!disposed) {
          window.clearTimeout(loadTimer);
          setViewerState("unavailable");
        }
      });

    return () => {
      disposed = true;
      window.clearTimeout(loadTimer);
      resetViewRef.current = null;
      cleanup();
    };
  }, [title, config, modelUrl, attempt]);

  const retry = () => {
    setModelLoaded(false);
    setLoadIssue(false);
    setAttempt((a) => a + 1);
  };

  return (
    <div
      className={`model-shell theme-${theme} is-${viewerState} ${modelLoaded ? "model-loaded" : ""}`}
    >
      <img
        className="model-poster-fallback"
        src={thumbnail}
        alt=""
        aria-hidden="true"
      />
      <div
        ref={hostRef}
        className="three-canvas"
        role="img"
        aria-label={`Interactive 3D model of ${title}`}
      />
      {viewMode === "render" && (
        <img
          className="render-view"
          src={thumbnail}
          alt={`${title} final Blender render`}
        />
      )}
      {viewMode === "interactive" && (
        <span className="focus-depth" aria-hidden="true" />
      )}
      <div className="view-switch" aria-label="Viewer mode">
        <button
          className={viewMode === "render" ? "selected" : ""}
          onClick={() => setViewMode("render")}
        >
          RENDER
        </button>
        <button
          className={viewMode === "interactive" ? "selected" : ""}
          onClick={() => setViewMode("interactive")}
        >
          INTERACTIVE
        </button>
      </div>
      {viewMode === "interactive" && modelLoaded && (
        <button
          className="reset-view"
          onClick={() => resetViewRef.current?.()}
        >
          RESET VIEW ↺
        </button>
      )}
      {viewMode === "interactive" && modelLoaded && (
        <span className="drag-hint">DRAG TO ORBIT · SCROLL TO ZOOM</span>
      )}
      {viewMode === "interactive" && viewerState === "loading" && (
        <span className="model-loading">PREPARING 3D…</span>
      )}
      {viewMode === "interactive" &&
        viewerState === "ready" &&
        !modelLoaded &&
        !loadIssue && <span className="model-loading">LOADING 3D…</span>}
      {viewMode === "interactive" &&
        viewerState === "ready" &&
        !modelLoaded &&
        loadIssue && (
          <div className="model-load-issue" role="status">
            <span>3D TOOK TOO LONG</span>
            <button onClick={retry}>RETRY</button>
            <button onClick={() => setViewMode("render")}>VIEW RENDER</button>
          </div>
        )}
      {viewMode === "interactive" && viewerState === "unavailable" && (
        <span className="model-loading">3D VIEW NEEDS WEBGL</span>
      )}
    </div>
  );
}
