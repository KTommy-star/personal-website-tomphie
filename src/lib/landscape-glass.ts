/*! Shared landscape renderer; lens-map/GL technique adapted from gentpan/liquidglass
 * @068ad226f53e1ca62d857f78bdc32f58f3c5fce7, MIT /licenses/liquid-glass.txt. */
import { renderLensMap } from "../vendor/liquid-glass.js";

export type LandscapeLens = {
  key: HTMLElement;
  x: number; y: number; width: number; height: number;
  mapWidth: number; mapHeight: number; radius: number; bend: number;
};

// One shared GL renderer/scene texture. The narrow optical strips live INSIDE
// each card, so compositor scrolling carries its rim even when JS is delayed.
// Never draw moving card outlines into a fixed wallpaper or copy a full scene.
const vertex = `
attribute vec2 aPos;
uniform vec2 uSize;
uniform vec4 uLens;
varying vec2 vPos;
void main() {
  vPos = uLens.xy + aPos / uSize * uLens.zw;
  vec2 p = aPos / uSize * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`;
const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uMap;
uniform vec2 uSceneSize;
uniform float uTheme;
uniform vec4 uLens;
uniform float uBend;
varying vec2 vPos;
vec3 scene(vec2 p) {
  vec2 uv = clamp(p / uSceneSize, 0.0, 1.0);
  return mix(texture2D(uDay, uv).rgb, texture2D(uNight, uv).rgb, uTheme);
}
void main() {
  vec4 map = texture2D(uMap, (vPos - uLens.xy) / uLens.zw);
  vec2 bend = map.rg - vec2(128.0 / 255.0);
  float rim = max(0.0, map.b * 2.0 - 256.0 / 255.0);
  // Never paint a separate image across a card's center.
  if (map.a <= 0.0 || (length(bend) < .003 && rim <= .001)) discard;
  vec3 color = min(vec3(1.0), scene(vPos + bend * uBend * 2.0) + rim);
  // Blend the inner edge into the real backdrop, not a hard rectangular seam.
  float alpha = map.a * smoothstep(.003, .09, max(length(bend), rim));
  gl_FragColor = vec4(color * alpha, alpha);
}`;

export async function createLandscapeGlass(landscape: HTMLElement, unavailable: () => void) {
  const day = landscape.querySelector<HTMLImageElement>(".landscape-day img")!;
  const night = landscape.querySelector<HTMLImageElement>(".landscape-night img")!;
  await Promise.all([day.decode(), night.decode()]);
  const canvas = document.createElement("canvas");
  canvas.className = "landscape-glass-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const program = gl.createProgram()!;
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); gl.deleteProgram(program); return null; }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
  gl.useProgram(program);
  const locations = Object.fromEntries(["uSize", "uSceneSize", "uTheme", "uLens", "uBend", "uDay", "uNight", "uMap"].map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(locations.uDay, 0);
  gl.uniform1i(locations.uNight, 1);
  gl.uniform1i(locations.uMap, 2);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const position = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const vertices = new Float32Array(12);
  const texture = (source: HTMLCanvasElement) => {
    const result = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, result);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return result;
  };
  const rect = (x: number, y: number, width: number, height: number) => {
    vertices.set([x, y, x + width, y, x, y + height, x, y + height, x + width, y, x + width, y + height]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  type Strip = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; x: number; y: number; width: number; height: number };
  const maps = new Map<HTMLElement, { shape: string; texture: WebGLTexture; optics: HTMLElement; strips: Strip[] }>();
  let size = "";
  let dayTexture: WebGLTexture | undefined;
  let nightTexture: WebGLTexture | undefined;
  let stopped = false;
  let enabled = true;
  const ratio = Math.min(devicePixelRatio || 1, 1.5);

  // Bake only our two authored pictures, wash and celestial decorations on resize.
  // No DOM screenshots, no per-frame image uploads, no network/cross-origin content.
  const bake = (image: HTMLImageElement, dark: boolean, width: number, height: number) => {
    const plate = document.createElement("canvas");
    plate.width = Math.round(width * ratio); plate.height = Math.round(height * ratio);
    const ctx = plate.getContext("2d")!;
    ctx.scale(ratio, ratio);
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const [px, py] = getComputedStyle(image).objectPosition.split(" ").map(value => parseFloat(value) / 100);
    const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
    ctx.drawImage(image, (width - iw) * px, (height - ih) * py, iw, ih);
    if (width < 768) ctx.fillStyle = dark ? "rgba(5,22,32,.35)" : "rgba(240,247,245,.3)";
    else {
      const wash = ctx.createLinearGradient(0, 0, width, 0);
      wash.addColorStop(0, dark ? "rgba(7,24,32,.75)" : "rgba(243,248,246,.75)");
      wash.addColorStop(dark ? .65 : .58, dark ? "rgba(7,24,32,.15)" : "rgba(238,245,243,.12)");
      wash.addColorStop(1, "transparent"); ctx.fillStyle = wash;
    }
    ctx.fillRect(0, 0, width, height);
    const star = landscape.querySelector<HTMLElement>(dark ? ".scene-moon" : ".scene-sun")!;
    const style = getComputedStyle(star);
    const radius = parseFloat(style.width) / 2;
    const x = width - parseFloat(style.right) - radius, y = parseFloat(style.top) + radius;
    ctx.globalAlpha = dark ? .85 : .8;
    ctx.shadowColor = dark ? "rgba(208,231,238,.35)" : "rgba(255,244,208,.5)";
    ctx.shadowBlur = dark ? 29 : 52;
    ctx.fillStyle = dark ? "#eef5f3" : "#fffbe4";
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    if (dark) {
      ctx.shadowBlur = 0; ctx.fillStyle = "#8da7b3";
      ctx.save(); ctx.clip(); ctx.beginPath(); ctx.arc(x - 7, y - 3, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    return texture(plate);
  };

  landscape.append(canvas);
  const renderer = {
    render(lenses: LandscapeLens[]) {
      if (stopped || !enabled) return;
      const width = landscape.clientWidth, height = landscape.clientHeight;
      const nextSize = `${width}|${height}|${day.currentSrc}|${night.currentSrc}`;
      if (size !== nextSize) {
        if (dayTexture) gl.deleteTexture(dayTexture);
        if (nightTexture) gl.deleteTexture(nightTexture);
        dayTexture = bake(day, false, width, height);
        nightTexture = bake(night, true, width, height);
        size = nextSize;
      }
      // Scratch space only: never displayed, never resized on ordinary scroll.
      const scratchWidth = Math.ceil(Math.max(width, ...lenses.map(lens => lens.mapWidth)) * ratio);
      const scratchHeight = Math.ceil(Math.max(height, ...lenses.map(lens => lens.mapHeight)) * ratio);
      if (canvas.width < scratchWidth) canvas.width = scratchWidth;
      if (canvas.height < scratchHeight) canvas.height = scratchHeight;
      gl.uniform2f(locations.uSceneSize, width, height);
      gl.uniform1f(locations.uTheme, Number(getComputedStyle(night.parentElement!).opacity));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dayTexture!);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, nightTexture!);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE2);
      for (const lens of lenses) {
        const shape = `${lens.mapWidth}|${lens.mapHeight}|${lens.radius}`;
        let map = maps.get(lens.key);
        if (!map || map.shape !== shape) {
          if (map) { gl.deleteTexture(map.texture); map.optics.remove(); }
          const half = Math.min(lens.mapWidth, lens.mapHeight) / 2;
          const { canvas: pixels } = renderLensMap({ width: lens.mapWidth, height: lens.mapHeight, radius: lens.radius,
            bezel: Math.min(24, half * .64) / half, curvature: 2.5, ior: 1.45, specular: .42, specularWidth: 1.4 },
            Math.min(1, 512 / Math.max(lens.mapWidth, lens.mapHeight)));
          const optics = document.createElement("div");
          optics.className = "liquid-glass-optics";
          optics.dataset.glassRims = "true";
          optics.setAttribute("aria-hidden", "true");
          const w = Math.ceil(lens.mapWidth * ratio), h = Math.ceil(lens.mapHeight * ratio);
          // A circular lens's curved rim extends farther in at the diagonal.
          const inset = Math.max(28, lens.radius * (1 - Math.SQRT1_2) + Math.min(24, half * .64) * Math.SQRT1_2 + 2);
          const band = Math.min(Math.ceil(inset * ratio), Math.floor(Math.min(w, h) / 2));
          const strips = [[0, 0, w, band], [0, h - band, w, band],
            [0, band, band, h - 2 * band], [w - band, band, band, h - 2 * band]]
            .filter(([, , sw, sh]) => sw > 0 && sh > 0).map(([x, y, sw, sh]) => {
              const strip = document.createElement("canvas");
              strip.className = "liquid-glass-rim";
              strip.width = sw; strip.height = sh;
              strip.style.cssText = `left:${x / w * 100}%;top:${y / h * 100}%;width:${sw / w * 100}%;height:${sh / h * 100}%`;
              optics.append(strip);
              return { canvas: strip, context: strip.getContext("2d")!, x, y, width: sw, height: sh };
            });
          lens.key.prepend(optics);
          map = { shape, texture: texture(pixels), optics, strips }; maps.set(lens.key, map);
        }
        const w = Math.ceil(lens.mapWidth * ratio), h = Math.ceil(lens.mapHeight * ratio);
        gl.viewport(0, canvas.height - h, w, h);
        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(locations.uSize, lens.mapWidth, lens.mapHeight);
        gl.bindTexture(gl.TEXTURE_2D, map.texture);
        gl.uniform4f(locations.uLens, lens.x, lens.y, lens.width, lens.height);
        gl.uniform1f(locations.uBend, lens.bend);
        gl.enable(gl.SCISSOR_TEST);
        // Draw all edges before reading the result: one GPU flush, no center pass.
        for (const strip of map.strips) {
          gl.scissor(strip.x, canvas.height - strip.y - strip.height, strip.width, strip.height);
          rect(0, 0, lens.mapWidth, lens.mapHeight);
        }
        for (const strip of map.strips) {
          strip.context.clearRect(0, 0, strip.width, strip.height);
          strip.context.drawImage(canvas, strip.x, strip.y, strip.width, strip.height, 0, 0, strip.width, strip.height);
        }
      }
      if (landscape.dataset.glassScene !== "refractive") landscape.dataset.glassScene = "refractive";
    },
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) delete landscape.dataset.glassScene;
    },
    destroy() {
      stopped = true;
      delete landscape.dataset.glassScene;
      canvas.remove();
      for (const map of maps.values()) { gl.deleteTexture(map.texture); map.optics.remove(); }
      if (dayTexture) gl.deleteTexture(dayTexture);
      if (nightTexture) gl.deleteTexture(nightTexture);
      gl.deleteBuffer(buffer); gl.deleteProgram(program);
    },
  };
  canvas.addEventListener("webglcontextlost", () => { renderer.destroy(); unavailable(); }, { once: true });
  return renderer;
}
