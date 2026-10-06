import { createGlass, engine } from "../vendor/liquid-glass.js";

// Use native backdrop refraction where supported, so compositor scrolling owns
// the background alignment. WebKit/Gecko keep the aligned-scene compatibility path.
const landscape = document.querySelector<HTMLElement>("body > .landscape");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const contrast = matchMedia("(prefers-contrast: more)");
const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
const disabled = () => contrast.matches || transparency.matches;

if (landscape) {
  type Lens = ReturnType<typeof createGlass>;
  type Surface = {
    element: HTMLElement;
    source: HTMLElement;
    portrait: HTMLImageElement | null;
    scene?: HTMLElement;
    native: boolean;
    scrolls: boolean;
    lens?: Lens;
    visible: boolean;
    bend: number;
  };
  const surfaces: Surface[] = [];
  let frame = 0;
  let followUntil = 0;
  let geometryChanged = true;
  let pressed: Surface | undefined;

  const update = () => {
    frame = 0;
    if (disabled()) return;
    // Read every active box before writing styles; don't force layout per card.
    const following = performance.now() < followUntil;
    const measurements = surfaces.filter(surface => surface.visible &&
      (surface.scrolls || (!surface.native && following) || geometryChanged || !surface.lens)).map(surface => {
      const { element, portrait } = surface;
      const width = surface.native ? element.offsetWidth : element.clientWidth;
      const height = surface.native ? element.offsetHeight : element.clientHeight;
      const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0, width / 2, height / 2);
      const rect = surface.scene ? element.getBoundingClientRect() : null;
      const imageRect = portrait?.getBoundingClientRect();
      const scaleX = rect ? rect.width / element.offsetWidth : 1;
      const scaleY = rect ? rect.height / element.offsetHeight : 1;
      return { surface, width, height, radius,
        sceneWidth: `${(imageRect?.width ?? innerWidth) / scaleX}px`,
        sceneHeight: `${(imageRect?.height ?? innerHeight) / scaleY}px`,
        sceneTransform: rect ? `translate(${((imageRect?.left ?? 0) - rect.left) / scaleX - element.clientLeft}px, ${((imageRect?.top ?? 0) - rect.top) / scaleY - element.clientTop}px)` : "",
      };
    });
    geometryChanged = false;
    for (const { surface, width, height, radius, sceneWidth, sceneHeight, sceneTransform } of measurements) {
      if (!width || !height) continue;
      const { element, source, scene } = surface;
      if (scene) {
        if (scene.style.width !== sceneWidth) scene.style.width = sceneWidth;
        if (scene.style.height !== sceneHeight) scene.style.height = sceneHeight;
        if (scene.style.transform !== sceneTransform) scene.style.transform = sceneTransform;
      }
      const bezel = Math.min(28, Math.min(width, height) * .32) / (Math.min(width, height) / 2);
      if (!surface.lens) {
        surface.lens = createGlass(source, {
          mode: surface.native ? "backdrop" : "content",
          fit: true, radius, bezel, curvature: 2.5, ior: 1.45,
          // One optical pass per panel, not three full-size colour-channel passes.
          refraction: surface.bend, chroma: 0,
          blur: 0, specular: .42, specularWidth: 1.4,
          mapScale: Math.min(1, 768 / Math.max(width, height)),
        });
        element.dataset.glass = "refractive";
      } else {
        surface.lens.update({ radius, bezel });
      }
    }
    if (performance.now() < followUntil && !reduced.matches) requestUpdate();
  };
  const requestUpdate = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  // Follow only short presses/hover transitions, not an idle render loop.
  const followInteraction = (surface: Surface) => {
    if (surface.native) return;
    if (!reduced.matches) followUntil = performance.now() + 380;
    requestUpdate();
  };

  const visibility = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const surface = surfaces.find(item => item.element === entry.target);
      if (surface) surface.visible = entry.isIntersecting;
    }
    requestUpdate();
  }, { rootMargin: "120px" });
  const requestGeometry = () => { geometryChanged = true; requestUpdate(); };
  const sizes = new ResizeObserver(requestGeometry);

  document.querySelectorAll<HTMLElement>(".glass").forEach(element => {
    // The fixed header keeps a static scenery plane, so passing headlines don't
    // become a second layer of warped text behind its navigation. No scroll sync.
    const inHeader = !!element.closest(".site-header");
    const native = engine === "blink" && !inHeader && !element.parentElement?.closest(".glass");
    let source: HTMLElement = element;
    let scene: HTMLElement | undefined;
    const portrait = !native && element.classList.contains("portrait-caption")
      ? document.querySelector<HTMLImageElement>(".portrait-art img") : null;
    if (!native) {
      const optics = document.createElement("div");
      optics.className = "liquid-glass-optics";
      optics.setAttribute("aria-hidden", "true");
      source = document.createElement("div");
      source.className = "liquid-glass-refraction";
      scene = (portrait ?? landscape).cloneNode(true) as HTMLElement;
      // Keep Astro's style scope, but never duplicate behavior/IDs/accessible content.
      for (const node of [scene, ...scene.querySelectorAll<HTMLElement>("*")]) {
        node.removeAttribute("id");
        for (const name of node.getAttributeNames()) {
          if (name.startsWith("data-") && !name.startsWith("data-astro-")) node.removeAttribute(name);
        }
      }
      if (portrait) {
        scene.setAttribute("alt", "");
        scene.style.objectFit = "cover";
        scene.style.objectPosition = getComputedStyle(portrait).objectPosition;
      }
      scene.classList.add("liquid-glass-scenery");
      source.append(scene);
      optics.append(source);
      element.prepend(optics);
    }
    const surface: Surface = {
      element, source, portrait, scene, native, scrolls: !native && !portrait && !inHeader, visible: false,
      bend: element.matches(".header-pane, .portrait-caption, .journey-filters") ? 16 : 21,
    };
    surfaces.push(surface);
    visibility.observe(element);
    sizes.observe(element);
    portrait?.addEventListener("load", requestUpdate);

    let lightFrame = 0;
    const positionLight = (event: PointerEvent) => {
      if (disabled() || reduced.matches || lightFrame) return;
      lightFrame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--pointer-x", `${(event.clientX - rect.left) / rect.width * 100}%`);
        element.style.setProperty("--pointer-y", `${(event.clientY - rect.top) / rect.height * 100}%`);
        lightFrame = 0;
      });
    };
    element.addEventListener("pointermove", positionLight);
    element.addEventListener("pointerenter", () => followInteraction(surface));
    element.addEventListener("pointerleave", () => followInteraction(surface));
    element.addEventListener("pointerdown", event => {
      if (disabled() || reduced.matches) return;
      if (event.target instanceof Element && event.target.closest(".glass") !== element) return;
      positionLight(event);
      pressed = surface;
      element.dataset.glassPressed = "true";
      surface.lens?.update({ refraction: surface.bend * 1.18 });
      followInteraction(surface);
    });
  });

  // One release handler, only for the pressed surface (including an outside release).
  const release = () => {
    if (!pressed) return;
    delete pressed.element.dataset.glassPressed;
    pressed.lens?.update({ refraction: pressed.bend });
    followInteraction(pressed);
    pressed = undefined;
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  window.addEventListener("blur", release);

  const preferenceChanged = () => {
    if (disabled()) {
      for (const surface of surfaces) {
        surface.lens?.destroy();
        surface.lens = undefined;
        delete surface.element.dataset.glass;
        delete surface.element.dataset.glassPressed;
      }
    }
    requestGeometry();
  };
  contrast.addEventListener("change", preferenceChanged);
  transparency.addEventListener("change", preferenceChanged);
  window.addEventListener("scroll", () => {
    // Native lenses need no JS coordinates, style writes or alignment RAF on scroll.
    if (surfaces.some(surface => surface.visible && surface.scrolls)) requestUpdate();
  }, { passive: true });
  window.addEventListener("resize", requestGeometry, { passive: true });
  // Mobile Safari's visible viewport changes when the address bar collapses.
  window.visualViewport?.addEventListener("resize", requestGeometry, { passive: true });
  document.addEventListener("toggle", () => {
    // Keep the dropdown's image aligned during its short opening scale transition.
    if (!reduced.matches) followUntil = performance.now() + 200;
    requestGeometry();
  }, true);
  document.fonts.ready.then(requestGeometry);
  requestUpdate();
}
