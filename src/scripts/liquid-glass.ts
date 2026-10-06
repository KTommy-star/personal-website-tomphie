import { createGlass } from "../vendor/liquid-glass.js";

// Refract aligned scenery, never the panel's text or interactive controls.
// A normal SVG filter also works on WebKit/Gecko, unlike backdrop-filter: url().
const landscape = document.querySelector<HTMLElement>("body > .landscape");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const contrast = matchMedia("(prefers-contrast: more)");
const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
const coarse = matchMedia("(pointer: coarse)");
const disabled = () => contrast.matches || transparency.matches;

if (landscape) {
  type Lens = ReturnType<typeof createGlass>;
  type Surface = {
    element: HTMLElement;
    optics: HTMLElement;
    source: HTMLElement;
    portrait: HTMLImageElement | null;
    scene: HTMLElement;
    lens?: Lens;
    visible: boolean;
    bend: number;
  };
  const surfaces: Surface[] = [];
  let frame = 0;
  let followUntil = 0;

  const update = () => {
    frame = 0;
    if (disabled()) return;
    for (const surface of surfaces) {
      if (!surface.visible) continue;
      const { element, source, scene, portrait } = surface;
      const rect = element.getBoundingClientRect();
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) continue;
      const scaleX = rect.width / element.offsetWidth;
      const scaleY = rect.height / element.offsetHeight;
      const left = rect.left + element.clientLeft * scaleX;
      const top = rect.top + element.clientTop * scaleY;
      const imageRect = portrait?.getBoundingClientRect();
      scene.style.width = `${(imageRect?.width ?? innerWidth) / scaleX}px`;
      scene.style.height = `${(imageRect?.height ?? innerHeight) / scaleY}px`;
      scene.style.transform = `translate(${((imageRect?.left ?? 0) - left) / scaleX}px, ${((imageRect?.top ?? 0) - top) / scaleY}px)`;

      const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0, width / 2, height / 2);
      const bezel = Math.min(28, Math.min(width, height) * .32) / (Math.min(width, height) / 2);
      if (!surface.lens) {
        surface.lens = createGlass(source, {
          fit: true, radius, bezel, curvature: 2.5, ior: 1.45,
          refraction: surface.bend, chroma: coarse.matches ? 0 : .065,
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
  const followInteraction = () => {
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
  const sizes = new ResizeObserver(requestUpdate);

  document.querySelectorAll<HTMLElement>(".glass").forEach(element => {
    const optics = document.createElement("div");
    optics.className = "liquid-glass-optics";
    optics.setAttribute("aria-hidden", "true");
    const source = document.createElement("div");
    source.className = "liquid-glass-refraction";
    const portrait = element.classList.contains("portrait-caption")
      ? document.querySelector<HTMLImageElement>(".portrait-art img") : null;
    const scene = (portrait ?? landscape).cloneNode(true) as HTMLElement;
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
    const surface: Surface = {
      element, optics, source, portrait, scene, visible: false,
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
    element.addEventListener("pointerenter", followInteraction);
    element.addEventListener("pointerleave", followInteraction);
    element.addEventListener("pointerdown", event => {
      if (disabled() || reduced.matches) return;
      positionLight(event);
      element.dataset.glassPressed = "true";
      surface.lens?.update({ refraction: surface.bend * 1.18 });
      followInteraction();
    });
    const release = () => {
      delete element.dataset.glassPressed;
      surface.lens?.update({ refraction: surface.bend });
      followInteraction();
    };
    // A release outside the panel must not leave its material pressed.
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
  });

  const preferenceChanged = () => {
    if (disabled()) {
      for (const surface of surfaces) {
        surface.lens?.destroy();
        surface.lens = undefined;
        delete surface.element.dataset.glass;
        delete surface.element.dataset.glassPressed;
      }
    }
    requestUpdate();
  };
  contrast.addEventListener("change", preferenceChanged);
  transparency.addEventListener("change", preferenceChanged);
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  // Mobile Safari's visible viewport changes when the address bar collapses.
  window.visualViewport?.addEventListener("resize", requestUpdate, { passive: true });
  document.addEventListener("toggle", requestUpdate, true);
  document.fonts.ready.then(requestUpdate);
  requestUpdate();
}
