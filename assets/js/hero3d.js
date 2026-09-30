// 3D backdrop — a real glass sphere refracting the iridescent field, fixed
// behind the whole page. The light dims once the hero is behind you, and the
// sphere travels from section to section, passing close to the camera on the
// way. It wobbles like liquid when the pointer or the page moves.
// If three.js can't load or WebGL2 is missing, the 2D hero renderer takes over.

const hero = document.querySelector(".hero");
const media = hero?.querySelector(".hero__media");
const stage = document.querySelector("[data-backdrop]");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

// 3D simplex noise (Ashima Arts / Stefan Gustavson), for the liquid wobble.
const noise3 = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute4(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise3(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute4(permute4(permute4(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    vec3 ns = 0.142857142857 * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 q0 = vec3(a0.xy, h.x);
    vec3 q1 = vec3(a0.zw, h.y);
    vec3 q2 = vec3(a1.xy, h.z);
    vec3 q3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(q0, q0), dot(q1, q1), dot(q2, q2), dot(q3, q3)));
    q0 *= norm.x;
    q1 *= norm.y;
    q2 *= norm.z;
    q3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(q0, x0), dot(q1, x1), dot(q2, x2), dot(q3, x3)));
  }
`;

const fallBackTo2D = (error) => {
  if (error) console.warn("3D hero unavailable, using the 2D backdrop.", error);
  stage?.querySelector(".backdrop__canvas")?.remove();
  document.documentElement.classList.remove("has-3d");
  window.Iridescence?.start2D();
};

const init = (THREE) => {
  const { noise, field } = window.Iridescence.glsl;

  const canvas = document.createElement("canvas");
  canvas.className = "backdrop__canvas";
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.25 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if ("transmissionResolutionScale" in renderer) renderer.transmissionResolutionScale = 0.5;

  stage.prepend(canvas);
  document.documentElement.classList.add("has-3d");

  const scene = new THREE.Scene();
  // A narrow lens keeps the sphere round even near the edge of the frame.
  const camera = new THREE.PerspectiveCamera(12, 1, 0.1, 200);
  camera.position.set(0, 0, 30);

  // --- Reflections: a dark room with one soft warm glow from the lower left,
  // so the glass picks up a warm rim instead of studio highlights.
  const envScene = new THREE.Scene();
  envScene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vDir;
          void main() {
            float warm = pow(max(dot(vDir, normalize(vec3(-0.6, -0.7, 0.4))), 0.0), 3.0);
            float cool = pow(max(dot(vDir, normalize(vec3(0.7, 0.6, 0.2))), 0.0), 6.0);
            vec3 color = vec3(1.0, 0.62, 0.25) * warm * 1.6 + vec3(0.45, 0.6, 0.5) * cool * 0.35;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    ),
  );
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();

  // --- Backdrop: the same band field, now a plane the glass can see through.
  const backdropMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHalf: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uFlow: { value: 0 },
      uGlow: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uHalf;
      uniform vec2 uPointer;
      uniform float uFlow;
      uniform float uGlow;
      varying vec2 vUv;

      ${noise}
      ${field}

      void main() {
        // The bands drift upward as the page scrolls, like light passing by.
        vec2 view = (vUv - 0.5) * 2.0 * uHalf;
        vec2 p = view + uPointer * 0.06 - vec2(0.0, uFlow);
        float t = uTime * 0.06;

        vec3 color = palette(field(p, t));

        // Large pools of shadow drifting through the light.
        float shade = smoothstep(-0.55, 0.2, snoise(p * 0.75 + vec2(7.3, -t * 0.4)));
        color *= mix(0.04, 1.0, shade);

        // Gentle vignette.
        float vignette = smoothstep(1.6, 0.3, length(view / uHalf * 0.8));
        color *= mix(0.45, 1.0, vignette);

        // Full strength in the hero, a low ambient glow behind the content.
        color *= uGlow;

        // Authored in display space; store linear so the glass samples it correctly.
        gl_FragColor = vec4(pow(color, vec3(2.2)), 1.0);
        #include <colorspace_fragment>
      }
    `,
    depthWrite: false,
    toneMapped: false,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMaterial);
  backdrop.position.z = -8;
  scene.add(backdrop);

  // --- Glass sphere with a liquid wobble.
  const REST_WOBBLE = 0.006;
  const wobble = { amount: REST_WOBBLE, target: REST_WOBBLE };
  const sphereUniforms = { uTime: { value: 0 }, uWobble: { value: wobble.amount } };

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    thickness: 2.4,
    ior: 1.5,
    // A faint smoky tint keeps the magnified bands from overpowering the page.
    attenuationColor: new THREE.Color(0xc4bcae),
    attenuationDistance: 9,
  });
  if ("dispersion" in glass) glass.dispersion = 5;

  glass.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sphereUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uWobble;
        ${noise3}
        vec3 wobblePoint(vec3 dir) {
          float n = snoise3(dir * 1.25 + vec3(0.0, uTime * 0.18, uTime * 0.12));
          return dir * (1.0 + n * uWobble);
        }`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `vec3 wDir = normalize(position);
        vec3 wTangent = normalize(cross(wDir, abs(wDir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
        vec3 wBitangent = cross(wDir, wTangent);
        vec3 wP0 = wobblePoint(wDir);
        vec3 wP1 = wobblePoint(normalize(wDir + wTangent * 0.01));
        vec3 wP2 = wobblePoint(normalize(wDir + wBitangent * 0.01));
        vec3 objectNormal = normalize(cross(wP1 - wP0, wP2 - wP0));`,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = wP0;");
  };

  const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1, coarsePointer ? 28 : 48), glass);
  scene.add(sphere);

  // --- Where the sphere rests in each section. x and y mix a fraction of the
  // half-viewport with an offset in units of the shorter side, so the
  // composition holds on any screen. The hero stop mirrors the 2D design.
  const stops = [
    { target: hero, x: [1, -0.43], y: [1, -0.33], r: 0.57, glow: 1 },
    { target: "#work", x: [1, -0.24], y: [0, 0.04], r: 0.3, glow: 0.36 },
    { target: "#about", x: [-1, 0.22], y: [-1, 0.34], r: 0.26, glow: 0.32 },
    { target: "#approach", x: [0, 0.22], y: [0, 0], r: 0.4, glow: 0.44 },
    { target: "#experience", x: [1, -0.2], y: [1, -0.32], r: 0.22, glow: 0.3 },
    { target: "#contact", x: [1, -0.42], y: [0, -0.02], r: 0.5, glow: 0.6 },
  ]
    .map((stop) => ({
      ...stop,
      el: typeof stop.target === "string" ? document.querySelector(stop.target) : stop.target,
      at: 0,
      baseGlow: stop.glow,
    }))
    .filter((stop) => stop.el);

  // A stop is reached when its section sits in the middle of the viewport.
  const measureStops = () => {
    const viewportH = window.innerHeight;
    const maxScroll = Math.max(document.documentElement.scrollHeight - viewportH, 0);
    // Tall, narrow screens put more of the bands behind text, so dim them further.
    const contentGlow = window.innerWidth < 640 ? 0.55 : 1;
    let previous = 0;
    stops.forEach((stop, i) => {
      if (i === 0) return;
      stop.glow = stop.baseGlow * contentGlow;
      const rect = stop.el.getBoundingClientRect();
      const centred = rect.top + window.scrollY + rect.height / 2 - viewportH / 2;
      stop.at = Math.max(Math.min(centred, maxScroll), previous + 1);
      previous = stop.at;
    });
  };

  const smoothstep = (t) => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;

  const targetFor = (scroll) => {
    let i = 0;
    while (i < stops.length - 1 && scroll > stops[i + 1].at) i++;
    const from = stops[i];
    const to = stops[Math.min(i + 1, stops.length - 1)];
    const span = to.at - from.at;
    const t = span > 0 ? smoothstep(Math.min(Math.max((scroll - from.at) / span, 0), 1)) : 0;
    return {
      nx: mix(from.x[0], to.x[0], t),
      ux: mix(from.x[1], to.x[1], t),
      ny: mix(from.y[0], to.y[0], t),
      uy: mix(from.y[1], to.y[1], t),
      r: mix(from.r, to.r, t),
      glow: mix(from.glow, to.glow, t),
      // Between stops the sphere swings toward the camera.
      lift: Math.sin(Math.PI * t),
    };
  };

  const state = targetFor(window.scrollY);
  const view = { w: 1, h: 1, unit: 1 };

  const layout = () => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const fov = THREE.MathUtils.degToRad(camera.fov / 2);
    view.h = 2 * Math.tan(fov) * camera.position.z;
    view.w = view.h * camera.aspect;
    view.unit = Math.min(view.w, view.h);

    // Backdrop fills the view at its depth, with room for pointer drift.
    const depth = camera.position.z - backdrop.position.z;
    const backH = 2 * Math.tan(fov) * depth * 1.1;
    backdrop.scale.set(backH * camera.aspect, backH, 1);
    const unitPx = Math.min(width, height);
    backdropMaterial.uniforms.uHalf.value.set((0.5 * width * 1.1) / unitPx, (0.5 * height * 1.1) / unitPx);

    measureStops();
  };

  // --- Input: pointer drift and scroll, both feed the wobble.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let lastScroll = window.scrollY;

  window.addEventListener(
    "pointermove",
    (event) => {
      const nx = (event.clientX / window.innerWidth) * 2 - 1;
      const ny = -((event.clientY / window.innerHeight) * 2 - 1);
      const speed = Math.hypot(nx - pointer.tx, ny - pointer.ty);
      pointer.tx = nx;
      pointer.ty = ny;
      wobble.target = Math.min(wobble.target + speed * 0.1, 0.05);
    },
    { passive: true },
  );

  const readScroll = () => {
    const delta = Math.abs(window.scrollY - lastScroll);
    lastScroll = window.scrollY;
    wobble.target = Math.min(wobble.target + delta * 0.0005, 0.05);
  };

  // --- Frame.
  const TIME_OFFSET = 40;
  const timer = new THREE.Timer();

  // Time-based easing, so slow devices settle as quickly as fast ones.
  const approach = (rate, dt) => 1 - Math.exp(-rate * dt);

  const render = (timestamp, snap = false) => {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.1);
    const time = timer.getElapsed() + TIME_OFFSET;

    pointer.x += (pointer.tx - pointer.x) * approach(3, dt);
    pointer.y += (pointer.ty - pointer.y) * approach(3, dt);

    wobble.target += (REST_WOBBLE - wobble.target) * approach(2.4, dt);
    wobble.amount += (wobble.target - wobble.amount) * approach(5, dt);
    sphereUniforms.uWobble.value = wobble.amount;
    sphereUniforms.uTime.value = time;

    // Ease toward the stop for the current scroll position.
    const target = targetFor(window.scrollY);
    const follow = snap ? 1 : approach(6, dt);
    for (const key in target) state[key] += (target[key] - state[key]) * follow;

    backdropMaterial.uniforms.uTime.value = time;
    backdropMaterial.uniforms.uPointer.value.set(pointer.x * 0.5, pointer.y * 0.5);
    backdropMaterial.uniforms.uFlow.value = (window.scrollY / window.innerHeight) * 0.35;
    backdropMaterial.uniforms.uGlow.value = state.glow;

    // Float, lean toward the pointer, and swing forward between sections.
    const drift = view.unit * 0.015;
    sphere.position.set(
      state.nx * view.w * 0.5 + state.ux * view.unit + Math.sin(time * 0.08) * drift + pointer.x * view.unit * 0.03,
      state.ny * view.h * 0.5 + state.uy * view.unit + Math.cos(time * 0.066) * drift + pointer.y * view.unit * 0.03,
      state.lift * 3,
    );
    sphere.scale.setScalar(state.r * view.unit);
    sphere.rotation.set(pointer.y * 0.25, pointer.x * 0.35 + time * 0.03, 0);

    renderer.render(scene, camera);
  };

  layout();
  render(undefined, true);
  requestAnimationFrame(() => canvas.classList.add("is-ready"));

  // Section positions shift as fonts and images load.
  new ResizeObserver(measureStops).observe(document.body);

  if (reduceMotion) {
    // No animation loop: redraw only when the page moves or resizes.
    let queued = false;
    const redraw = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        render(undefined, true);
      });
    };
    window.addEventListener("scroll", redraw, { passive: true });
    window.addEventListener("resize", () => {
      layout();
      redraw();
    });
    return;
  }

  window.addEventListener("resize", layout);
  window.addEventListener("scroll", readScroll, { passive: true });

  // Animate while the tab is visible.
  const sync = () => renderer.setAnimationLoop(document.hidden ? null : render);
  document.addEventListener("visibilitychange", sync);
  sync();
};

if (hero && media && stage) {
  import("three")
    .then((THREE) => {
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2")) throw new Error("WebGL2 not supported");
      init(THREE);
    })
    .catch(fallBackTo2D);
}
