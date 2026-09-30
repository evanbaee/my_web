// Iridescent hero backdrop — soft sage and amber bands drifting behind a
// glass sphere that refracts them, like light pooling in molten glass.
(() => {
  const canvas = document.querySelector("[data-iridescence]");
  if (!canvas) return;

  const hero = canvas.closest(".hero");
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    hero?.classList.add("no-webgl");
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The bands are soft, so render a little below native resolution.
  const RENDER_SCALE = 0.75;
  const TIME_OFFSET = 40;

  const vertexSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_pointer;

    vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                         -0.577350269189626, 0.024390243902439);
      vec2 i = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
      m = m * m;
      m = m * m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
      vec3 g;
      g.x = a0.x * x0.x + h.x * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    // Broad, slow bands — soft like blurred silk, never busy.
    float field(vec2 p, float t) {
      vec2 warp = vec2(
        snoise(p * 0.55 + vec2(0.0, t * 0.6)),
        snoise(p * 0.55 + vec2(4.1, -t * 0.5))
      );
      return snoise(p * 0.42 + warp * 0.7 + vec2(t * 0.35, -t * 0.2));
    }

    // Sage and amber ridges separated by black, with a trace of oxblood.
    vec3 palette(float v) {
      vec3 sage = vec3(0.627, 0.878, 0.671);
      vec3 amber = vec3(1.0, 0.675, 0.180);
      vec3 oxblood = vec3(0.647, 0.176, 0.145);

      float g = exp(-pow((v + 0.15) / 0.42, 2.0));
      float a = exp(-pow((v - 0.45) / 0.32, 2.0));
      float o = exp(-pow((v - 0.9) / 0.24, 2.0));

      vec3 color = sage * g * 0.4 + amber * a * 0.7 + oxblood * o * 0.55;
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(vec3(luma), color, 0.72);
    }

    void main() {
      float unit = min(u_resolution.x, u_resolution.y);
      vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / unit;
      vec2 halfSize = 0.5 * u_resolution / unit;
      vec2 pointer = u_pointer - 0.5;
      float t = u_time * 0.06;

      // Glass sphere resting in the upper right.
      float radius = 0.57;
      vec2 center = vec2(halfSize.x - 0.43, halfSize.y - 0.33)
        + vec2(sin(t * 1.3), cos(t * 1.1)) * 0.015
        + pointer * 0.035;
      vec2 d = (p - center) / radius;
      float dist = length(d);
      float edgeWidth = 1.5 / (unit * radius);
      float inside = 1.0 - smoothstep(1.0 - edgeWidth, 1.0, dist);
      float z = sqrt(max(0.0, 1.0 - dist * dist));

      // Refraction: magnified at the core, compressed toward the rim.
      vec2 lens = center + d * radius * mix(1.35, 0.5, z) + vec2(0.3, -0.18);
      vec2 q = mix(p + pointer * 0.06, lens, inside);

      vec3 color = palette(field(q, t));

      // Large pools of shadow drifting through the light.
      float shade = smoothstep(-0.55, 0.2, snoise(q * 0.75 + vec2(7.3, -t * 0.4)));
      color *= mix(0.04, 1.0, shade);

      // Warm fresnel rim, brightest toward the lower left.
      float fresnel = pow(1.0 - z, 2.5) * inside;
      float light = clamp(dot(normalize(d + 0.0001), normalize(vec2(-0.6, -0.8))), 0.0, 1.0);
      color = color * mix(1.0, 0.82, inside)
        + vec3(0.86, 0.68, 0.42) * fresnel * (0.1 + 0.55 * light);

      // Thin dark contour where glass meets air.
      float contour = exp(-pow((dist - 1.0) * radius * unit / 1.6, 2.0));
      color *= 1.0 - 0.65 * contour;

      // Gentle vignette.
      float vignette = smoothstep(1.6, 0.3, length(p / vec2(halfSize.x, halfSize.y) * 0.8));
      color *= mix(0.45, 1.0, vignette);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  if (vertexShader && fragmentShader) {
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
  }

  if (!vertexShader || !fragmentShader || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
    hero?.classList.add("no-webgl");
    return;
  }

  gl.useProgram(program);

  // One oversized triangle covers the whole viewport.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const timeLocation = gl.getUniformLocation(program, "u_time");
  const pointerLocation = gl.getUniformLocation(program, "u_pointer");

  const pointer = { x: 0.5, y: 0.5 };
  const pointerTarget = { x: 0.5, y: 0.5 };

  const resize = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 2) * RENDER_SCALE;
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const draw = (seconds) => {
    pointer.x += (pointerTarget.x - pointer.x) * 0.03;
    pointer.y += (pointerTarget.y - pointer.y) * 0.03;

    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, seconds + TIME_OFFSET);
    gl.uniform2f(pointerLocation, pointer.x, pointer.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  resize();
  draw(0);
  requestAnimationFrame(() => canvas.classList.add("is-ready"));

  if (reduceMotion) {
    window.addEventListener("resize", () => {
      resize();
      draw(0);
    });
    return;
  }

  window.addEventListener("resize", resize);

  window.addEventListener(
    "pointermove",
    (event) => {
      pointerTarget.x = event.clientX / window.innerWidth;
      pointerTarget.y = 1 - event.clientY / window.innerHeight;
    },
    { passive: true },
  );

  // Only animate while the hero is on screen and the tab is visible.
  let heroVisible = true;
  let frame = 0;
  const start = performance.now();

  const loop = (now) => {
    draw((now - start) / 1000);
    frame = requestAnimationFrame(loop);
  };

  const sync = () => {
    const shouldRun = heroVisible && !document.hidden;
    if (shouldRun && !frame) frame = requestAnimationFrame(loop);
    if (!shouldRun && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    sync();
  }).observe(hero || canvas);

  document.addEventListener("visibilitychange", sync);
  sync();
})();
