import { animate, press, scroll } from "motion";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

if (!reduced.matches) {
  press("[data-press]", (element) => {
    if (reduced.matches) return;
    animate(element, { scale: 0.97 }, { duration: 0.1 });
    return () => animate(element, { scale: 1 }, { type: "spring", bounce: 0, duration: 0.35 });
  });

  const portrait = document.querySelector<HTMLElement>("[data-portrait-drift]");
  const hero = document.querySelector<HTMLElement>(".home-hero");
  if (portrait && hero && matchMedia("(min-width: 64rem)").matches) {
    const drift = animate(portrait, { y: [0, -32] }, { ease: "linear" });
    const stopTracking = scroll(drift, { target: hero, offset: ["start start", "end start"] });
    reduced.addEventListener("change", (event) => {
      if (event.matches) { stopTracking(); drift.stop(); portrait.style.transform = ""; }
    });
  }
}
