const canvas = document.getElementById("canvas");
const errorBox = document.getElementById("error");
const cameraLabel = document.getElementById("cameraLabel");
const simModeInput = document.getElementById("simMode");
const noiseTypeInput = document.getElementById("noiseType");
const cameraSpeedInput = document.getElementById("cameraSpeed");
const cameraSpeedValue = document.getElementById("cameraSpeedValue");
const pointSizeInput = document.getElementById("pointSize");
const pointSizeValue = document.getElementById("pointSizeValue");
const bloomAmountInput = document.getElementById("bloomAmount");
const bloomAmountValue = document.getElementById("bloomAmountValue");
const particleRInput = document.getElementById("particleR");
const particleRValue = document.getElementById("particleRValue");
const particleGInput = document.getElementById("particleG");
const particleGValue = document.getElementById("particleGValue");
const particleBInput = document.getElementById("particleB");
const particleBValue = document.getElementById("particleBValue");
const curlFrequencyInput = document.getElementById("curlFrequency");
const curlFrequencyValue = document.getElementById("curlFrequencyValue");
const curlStrengthInput = document.getElementById("curlStrength");
const curlStrengthValue = document.getElementById("curlStrengthValue");
const orbitStrengthInput = document.getElementById("orbitStrength");
const orbitStrengthValue = document.getElementById("orbitStrengthValue");
const pullStrengthInput = document.getElementById("pullStrength");
const pullStrengthValue = document.getElementById("pullStrengthValue");
const plyColorizeButton = document.getElementById("plyColorize");
const flowColorizeButton = document.getElementById("flowColorize");
const restartSimulationButton = document.getElementById("restartSimulation");
const exportFramesInput = document.getElementById("exportFrames");
const exportFramesValue = document.getElementById("exportFramesValue");
const exportFpsInput = document.getElementById("exportFps");
const exportFpsValue = document.getElementById("exportFpsValue");
const exportPngButton = document.getElementById("exportPng");
const exportStatus = document.getElementById("exportStatus");
const toggleGuiButton = document.getElementById("toggleGui");
const fullscreenModeButton = document.getElementById("fullscreenMode");
const aspectModeInput = document.getElementById("aspectMode");
const simModeButtons = Array.from(simModeInput.querySelectorAll("button"));
const noiseTypeButtons = Array.from(noiseTypeInput.querySelectorAll("button"));
const aspectModeButtons = Array.from(aspectModeInput.querySelectorAll("button"));

function showError(message) {
  errorBox.style.display = "block";
  errorBox.textContent = message;
  throw new Error(message);
}

function decodeBase64Float32(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

function canvasToBlob(targetCanvas) {
  return new Promise((resolve, reject) => {
    targetCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to encode canvas."));
      }
    }, "image/png");
  });
}

const gl = canvas.getContext("webgl2", {
  antialias: false,
  alpha: false,
  depth: true,
  powerPreference: "high-performance",
});

if (!gl) {
  showError("WebGL2 is required.");
}

const floatExt = gl.getExtension("EXT_color_buffer_float");
if (!floatExt) {
  showError("EXT_color_buffer_float is required.");
}

const SIM_SIZE = 914;
const PARTICLE_COUNT = SIM_SIZE * SIM_SIZE;
const BOUNDS = 6.5;
const INTRO_DURATION = 3.8;
const MODE_BLEND_SPEED_FACTOR = 0.22;
const PLY_BLEND_SPEED_FACTOR = 0.2;
const GLOBAL_ROTATION_SPEED = 0.09;
const ROTATION_BURST_SPEED = 10.5;
const ROTATION_BURST_DECAY = 1.7;

const quadVao = gl.createVertexArray();
gl.bindVertexArray(quadVao);

const particleVao = gl.createVertexArray();
gl.bindVertexArray(particleVao);

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    showError(gl.getShaderInfoLog(shader) || "Shader compile failed.");
  }
  return shader;
}

function createProgram(vsSource, fsSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    showError(gl.getProgramInfoLog(program) || "Program link failed.");
  }
  return program;
}

function createTexture(data) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    SIM_SIZE,
    SIM_SIZE,
    0,
    gl.RGBA,
    gl.FLOAT,
    data
  );
  return texture;
}

function replaceTextureData(texture, data) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIM_SIZE, SIM_SIZE, gl.RGBA, gl.FLOAT, data);
}

function createFramebuffer(texture) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    showError("Framebuffer is incomplete.");
  }
  return framebuffer;
}

function randomPoint(index) {
  const s = Math.sin(index * 12.9898) * 43758.5453;
  const t = Math.sin(index * 78.233 + 19.17) * 24634.6345;
  const u = Math.sin(index * 39.425 + 4.71) * 56445.2341;
  return [
    (s - Math.floor(s) - 0.5) * BOUNDS * 1.1,
    (t - Math.floor(t) - 0.5) * BOUNDS * 1.1,
    (u - Math.floor(u) - 0.5) * BOUNDS * 1.1,
  ];
}

function initialBurstPoint(index) {
  const s = Math.sin(index * 17.137) * 43758.5453;
  const t = Math.sin(index * 31.771 + 9.2) * 24634.6345;
  const u = Math.sin(index * 57.583 + 1.7) * 56445.2341;
  const v = Math.sin(index * 93.113 + 4.3) * 12515.8732;
  const theta = (s - Math.floor(s)) * Math.PI * 2;
  const phi = Math.acos((t - Math.floor(t)) * 2 - 1);
  const radius = (u - Math.floor(u)) * 0.12 + (v - Math.floor(v)) * 0.08;
  const sinPhi = Math.sin(phi);
  return [
    Math.cos(theta) * sinPhi * radius,
    Math.cos(phi) * radius,
    Math.sin(theta) * sinPhi * radius,
  ];
}

function mixVec3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function buildRootTargets() {
  const segments = [];
  const upAxis = [0.0, 1.0, 0.0];

  function normalizeVec3(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function crossVec3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function grow(start, direction, length, depth, spread, thickness) {
    if (depth <= 0 || length < 0.18) {
      return;
    }

    const seed = start[0] * 3.17 + start[1] * 2.11 + start[2] * 4.73 + depth * 1.37;
    const swayA = Math.sin(seed) * 0.34;
    const swayB = Math.cos(seed * 1.41) * 0.29;
    const dir = normalizeVec3([
      direction[0] + swayA * 0.45,
      direction[1] - 0.16 + Math.sin(seed * 0.7) * 0.08,
      direction[2] + swayB * 0.45,
    ]);

    const end = [
      start[0] + dir[0] * length,
      start[1] + dir[1] * length,
      start[2] + dir[2] * length,
    ];

    segments.push({ start, end, thickness, depth });

    const right = normalizeVec3(crossVec3(dir, upAxis));
    const binormal = normalizeVec3(crossVec3(right, dir));
    const branchCount = depth > 4 ? 4 : 3;
    for (let i = 0; i < branchCount; i += 1) {
      const side = i === 0 ? -1 : i === 1 ? 1 : 0;
      const front = i === 2 ? 1 : i === 3 ? -1 : 0;
      const forkBias = 0.58 + depth * 0.04;
      const childDir = normalizeVec3([
        dir[0] + right[0] * side * spread * forkBias + binormal[0] * front * spread * 0.75,
        dir[1] - 0.08 - depth * 0.012 + binormal[1] * front * spread * 0.12,
        dir[2] + right[2] * side * spread * forkBias + binormal[2] * front * spread * 0.75,
      ]);
      const childStart = mixVec3(start, end, 0.45 + i * 0.18);
      grow(
        childStart,
        childDir,
        length * (0.7 - i * 0.035),
        depth - 1,
        spread * 0.82,
        thickness * 0.78
      );
    }
  }

  grow([0.0, 3.8, 0.0], [0.0, -1.0, 0.0], 2.1, 6, 0.85, 0.34);

  const points = [];
  let segmentIndex = 0;
  while (points.length < PARTICLE_COUNT) {
    const segment = segments[segmentIndex % segments.length];
    const repeat = (segment.depth + 1) * 34;
    for (let i = 0; i < repeat && points.length < PARTICLE_COUNT; i += 1) {
      const seed = points.length + 1;
      const n0 = Math.sin(seed * 12.345 + segment.depth) * 43758.5453;
      const n1 = Math.sin(seed * 5.271 + segment.thickness) * 12741.371;
      const n2 = Math.sin(seed * 8.913 + segment.depth * 2.1) * 21413.73;
      const t = n0 - Math.floor(n0);
      const base = mixVec3(segment.start, segment.end, t);
      const tangent = [
        segment.end[0] - segment.start[0],
        segment.end[1] - segment.start[1],
        segment.end[2] - segment.start[2],
      ];
      const tangentN = normalizeVec3(tangent);
      let side = crossVec3(tangentN, upAxis);
      if (Math.hypot(side[0], side[1], side[2]) < 1e-4) {
        side = crossVec3(tangentN, [1.0, 0.0, 0.0]);
      }
      side = normalizeVec3(side);
      const normal = normalizeVec3(crossVec3(side, tangentN));
      const angle = (n0 - Math.floor(n0)) * Math.PI * 2.0;
      const radial = (n1 - Math.floor(n1) - 0.5) * segment.thickness;
      const axial = (n2 - Math.floor(n2) - 0.5) * segment.thickness * 0.85;
      points.push([
        base[0] + side[0] * Math.cos(angle) * radial + normal[0] * Math.sin(angle) * axial,
        base[1] + side[1] * Math.cos(angle) * radial + normal[1] * Math.sin(angle) * axial,
        base[2] + side[2] * Math.cos(angle) * radial + normal[2] * Math.sin(angle) * axial,
      ]);
    }
    segmentIndex += 1;
  }

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < points.length; i += 1) {
    cx += points[i][0];
    cy += points[i][1];
    cz += points[i][2];
  }
  cx /= points.length;
  cy /= points.length;
  cz /= points.length;

  let maxRadius = 0;
  for (let i = 0; i < points.length; i += 1) {
    points[i][0] -= cx;
    points[i][1] -= cy;
    points[i][2] -= cz;
    const radius = Math.hypot(points[i][0], points[i][1], points[i][2]);
    if (radius > maxRadius) {
      maxRadius = radius;
    }
  }

  const scale = (BOUNDS * 1.18) / Math.max(maxRadius, 1e-4);
  for (let i = 0; i < points.length; i += 1) {
    points[i][0] *= scale;
    points[i][1] *= scale;
    points[i][2] *= scale;
  }

  const data = new Float32Array(PARTICLE_COUNT * 4);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const p = points[i];
    const o = i * 4;
    data[o] = p[0];
    data[o + 1] = p[1];
    data[o + 2] = p[2];
    data[o + 3] = 1.0;
  }
  return data;
}

const initialState = new Float32Array(PARTICLE_COUNT * 4);
for (let i = 0; i < PARTICLE_COUNT; i += 1) {
  const [x, y, z] = initialBurstPoint(i + 1);
  const o = i * 4;
  initialState[o] = x;
  initialState[o + 1] = y;
  initialState[o + 2] = z;
  initialState[o + 3] = Math.random();
}

const rootTargets = buildRootTargets();
// PLY targets are optional. A bundled asset (window.__PLY_TARGETS_BASE64__)
// is applied on startup if present; otherwise any .ply can be loaded at
// runtime via the Load PLY button or by dropping a file on the canvas.
let plyDataLoaded = false;
const plyTargetTextureData = new Float32Array(PARTICLE_COUNT * 4);
const plyColorTextureData = new Float32Array(PARTICLE_COUNT * 4);
// Placeholder blob so selecting PLY mode before loading shows something.
for (let i = 0; i < PARTICLE_COUNT; i += 1) {
  const [px, py, pz] = initialBurstPoint(i + 1);
  const dst = i * 4;
  plyTargetTextureData[dst] = px * 8.0;
  plyTargetTextureData[dst + 1] = py * 8.0;
  plyTargetTextureData[dst + 2] = pz * 8.0;
  plyTargetTextureData[dst + 3] = 1.0;
  plyColorTextureData[dst] = 1.0;
  plyColorTextureData[dst + 1] = 1.0;
  plyColorTextureData[dst + 2] = 1.0;
  plyColorTextureData[dst + 3] = 1.0;
}

const stateA = createTexture(initialState);
const stateB = createTexture(initialState);
const targetsTexture = createTexture(rootTargets);
const plyTargetsTexture = createTexture(plyTargetTextureData);
const plyColorsTexture = createTexture(plyColorTextureData);
const fboA = createFramebuffer(stateA);
const fboB = createFramebuffer(stateB);

let readState = stateA;
let writeState = stateB;
let writeFbo = fboB;
let simTime = 0.0;

const simProgram = createProgram(
  `#version 300 es
  precision highp float;
  const vec2 POS[6] = vec2[](
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0,  1.0),
    vec2(-1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2( 1.0,  1.0)
  );
  void main() {
    gl_Position = vec4(POS[gl_VertexID], 0.0, 1.0);
  }`,
  `#version 300 es
  precision highp float;

  uniform sampler2D uState;
  uniform sampler2D uTargets;
  uniform sampler2D uPlyTargets;
  uniform float uTime;
  uniform float uDelta;
  uniform float uBounds;
  uniform float uIntroDuration;
  uniform float uModeBlend;
  uniform float uPlyBlend;
  uniform float uRotationSpeed;
  uniform float uCurlFrequency;
  uniform float uCurlStrength;
  uniform float uOrbitStrength;
  uniform float uPullStrength;
  uniform float uNoiseType;

  out vec4 outState;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  vec3 hash33(vec3 p) {
    return vec3(
      hash13(p + vec3(0.0, 1.0, 2.0)),
      hash13(p + vec3(3.0, 4.0, 5.0)),
      hash13(p + vec3(6.0, 7.0, 8.0))
    );
  }

  vec3 fade(vec3 t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  vec3 noiseVec3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = fade(f);

    vec3 n000 = hash33(i + vec3(0.0, 0.0, 0.0));
    vec3 n100 = hash33(i + vec3(1.0, 0.0, 0.0));
    vec3 n010 = hash33(i + vec3(0.0, 1.0, 0.0));
    vec3 n110 = hash33(i + vec3(1.0, 1.0, 0.0));
    vec3 n001 = hash33(i + vec3(0.0, 0.0, 1.0));
    vec3 n101 = hash33(i + vec3(1.0, 0.0, 1.0));
    vec3 n011 = hash33(i + vec3(0.0, 1.0, 1.0));
    vec3 n111 = hash33(i + vec3(1.0, 1.0, 1.0));

    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    ) * 2.0 - 1.0;
  }

  vec3 flowNoise(vec3 p) {
    vec3 q = p;
    vec3 sum = vec3(0.0);
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += noiseVec3(q) * amp;
      q = q * 2.03 + vec3(17.1, 9.2, 13.7);
      amp *= 0.5;
    }
    return sum;
  }

  vec3 curlNoise(vec3 p);

  float worleyDistance(vec3 p) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    float minDist = 1e9;
    for (int z = -1; z <= 1; z++) {
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec3 offset = vec3(float(x), float(y), float(z));
          vec3 feature = hash33(cell + offset) * 0.8 + 0.1;
          vec3 delta = offset + feature - local;
          minDist = min(minDist, dot(delta, delta));
        }
      }
    }
    return sqrt(minDist);
  }

  vec3 ridgedField(vec3 p) {
    vec3 n = flowNoise(p);
    return normalize(sign(n) * (1.0 - abs(n)) + 1e-5);
  }

  vec3 worleyField(vec3 p) {
    float e = 0.22;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);
    float gx = worleyDistance(p + dx) - worleyDistance(p - dx);
    float gy = worleyDistance(p + dy) - worleyDistance(p - dy);
    float gz = worleyDistance(p + dz) - worleyDistance(p - dz);
    return normalize(vec3(-gx, -gy, -gz) + 1e-5);
  }

  vec3 domainWarpedField(vec3 p) {
    vec3 warp = flowNoise(p * 0.56 + vec3(7.3, 3.1, 11.7));
    return curlNoise(p + warp * 1.1);
  }

  vec3 sampleMainField(vec3 p, float noiseType) {
    if (noiseType < 0.5) {
      return curlNoise(p);
    }
    if (noiseType < 1.5) {
      return ridgedField(p);
    }
    if (noiseType < 2.5) {
      return worleyField(p * 0.84);
    }
    return domainWarpedField(p);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      value += noise2(p) * amp;
      p = mat2(1.7, -1.2, 1.2, 1.7) * p + 17.0;
      amp *= 0.5;
    }
    return value;
  }

  vec3 curlNoise(vec3 p) {
    float e = 0.18;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);

    vec3 px0 = flowNoise(p - dx);
    vec3 px1 = flowNoise(p + dx);
    vec3 py0 = flowNoise(p - dy);
    vec3 py1 = flowNoise(p + dy);
    vec3 pz0 = flowNoise(p - dz);
    vec3 pz1 = flowNoise(p + dz);

    float x = (py1.z - py0.z) - (pz1.y - pz0.y);
    float y = (pz1.x - pz0.x) - (px1.z - px0.z);
    float z = (px1.y - px0.y) - (py1.x - py0.x);
    return normalize(vec3(x, y, z) / (2.0 * e) + 1e-5);
  }

  vec3 respawn(vec2 uv, float seed) {
    vec3 r = hash33(vec3(uv * 123.17, seed + floor(uTime * 0.2)));
    return (r - 0.5) * uBounds * 1.1;
  }

  vec3 introDirection(vec2 uv, float seed) {
    vec3 r = hash33(vec3(uv * 41.73, seed * 17.13 + 3.1));
    return normalize(r * 2.0 - 1.0 + vec3(1e-4));
  }

  void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 state = texelFetch(uState, coord, 0);
    vec3 target = texelFetch(uTargets, coord, 0).xyz;
    vec3 plyTarget = texelFetch(uPlyTargets, coord, 0).xyz;
    vec3 pos = state.xyz;
    vec2 uv = (vec2(coord) + 0.5) / float(textureSize(uState, 0).x);
    float introProgress = clamp(uTime / uIntroDuration, 0.0, 1.0);
    float introFade = 1.0 - smoothstep(0.0, 1.0, introProgress);
    float simFade = smoothstep(0.58, 1.0, introProgress);
    float curlFrequency = clamp(uCurlFrequency, 0.35, 1.20);
    float curlStrength = clamp(uCurlStrength, 0.30, 1.20);
    float orbitStrength = clamp(uOrbitStrength, 0.0, 0.18);
    float pullStrength = clamp(uPullStrength, 0.010, 0.060);
    float noiseType = clamp(uNoiseType, 0.0, 3.0);

    vec3 samplePos = pos * 0.46 + vec3(0.0, 0.0, uTime * 0.16);
    vec3 curl = sampleMainField(samplePos * curlFrequency, noiseType);
    vec3 orbit = vec3(-pos.z, 0.0, pos.x) * orbitStrength;
    vec3 globalSpin = vec3(-pos.z, 0.0, pos.x) * 0.09;
    vec3 pull = -pos * pullStrength;
    vec3 simVelocity = curl * curlStrength + orbit + pull + globalSpin * uRotationSpeed;
    vec3 toRoot = target - pos;
    float rootDistance = length(toRoot);
    vec3 rootDir = toRoot / max(rootDistance, 1e-4);
    vec3 rootCurl = curlNoise(target * 0.18 + vec3(0.0, uTime * 0.05, 0.0));
    vec3 rootVelocity = rootDir * min(rootDistance * 1.6, 2.4) + rootCurl * 0.18;
    rootVelocity += vec3(0.0, -0.06, 0.0);
    rootVelocity += globalSpin * uRotationSpeed;
    vec3 burstDir = introDirection(uv, state.w);
    vec3 burstSwirl = cross(burstDir, vec3(0.0, 1.0, 0.0));
    vec3 burstVelocity = burstDir * (1.8 + state.w * 1.4) + burstSwirl * 0.45;
    float curlWeight = max(0.0, 1.0 - uModeBlend);
    vec3 baseVelocity =
      simVelocity * curlWeight +
      rootVelocity * uModeBlend;
    vec3 velocity = burstVelocity * introFade + baseVelocity * simFade;

    pos += velocity * uDelta;
    float plyPositionBlend = pow(clamp(uPlyBlend, 0.0, 1.0), 2.4);
    pos = mix(pos, plyTarget, plyPositionBlend);

    float radius = length(pos);
    if (radius > uBounds && introProgress >= 1.0 && uPlyBlend < 0.999) {
      pos = respawn(uv, state.w);
    }

    outState = vec4(pos, state.w);
  }`
);

const renderProgram = createProgram(
  `#version 300 es
  precision highp float;

  uniform sampler2D uState;
  uniform sampler2D uPlyColors;
  uniform mat4 uModel;
  uniform mat4 uViewProj;
  uniform float uPointScale;
  uniform float uSimSize;
  uniform float uBounds;
  uniform float uPlyBlend;
  uniform float uPlyColorBlend;
  uniform float uFlowColorBlend;
  uniform vec3 uParticleTint;
  uniform float uBloomAmount;

  out float vDepth;
  out vec3 vColor;
  out float vBloomAmount;

  void main() {
    float x = mod(float(gl_VertexID), uSimSize);
    float y = floor(float(gl_VertexID) / uSimSize);
    ivec2 coord = ivec2(int(x), int(y));
    vec3 pos = texelFetch(uState, coord, 0).xyz;
    vec3 plyColor = texelFetch(uPlyColors, coord, 0).xyz;
    vec4 clip = uViewProj * uModel * vec4(pos, 1.0);
    gl_Position = clip;
    gl_PointSize = max(1.0, uPointScale / max(0.35, clip.w)) * (1.0 + uBloomAmount * 1.25);
    vDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);
    float plyColorMix = max(uPlyBlend, uPlyColorBlend);
    vec3 flowColor = mix(
      vec3(1.0),
      vec3(1.0, 0.84, 0.18),
      uFlowColorBlend
    );
    vColor = mix(flowColor, plyColor, plyColorMix) * uParticleTint;
    vBloomAmount = uBloomAmount;
  }`,
  `#version 300 es
  precision highp float;

  in float vDepth;
  in vec3 vColor;
  in float vBloomAmount;
  out vec4 outColor;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = dot(p, p);
    float core = smoothstep(0.25, 0.0, d);
    float glowRadius = mix(0.25, 0.55, clamp(vBloomAmount / 1.5, 0.0, 1.0));
    float glow = smoothstep(glowRadius, 0.0, d) * vBloomAmount;
    vec3 color = vColor * (1.0 + glow * 1.4);
    float alpha = max(core, glow * 0.35);
    outColor = vec4(color, alpha);
  }`
);

function perspective(out, fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy / 2.0);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = (2 * far * near) / (near - far);
  out[15] = 0;
  return out;
}

function lookAt(out, eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len;
  zy /= len;
  zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len;
  xy /= len;
  xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx;
  out[1] = xy;
  out[2] = xz;
  out[3] = 0;
  out[4] = yx;
  out[5] = yy;
  out[6] = yz;
  out[7] = 0;
  out[8] = zx;
  out[9] = zy;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

function multiplyMat4(out, a, b) {
  for (let i = 0; i < 4; i += 1) {
    const ai0 = a[i];
    const ai1 = a[i + 4];
    const ai2 = a[i + 8];
    const ai3 = a[i + 12];
    out[i] = ai0 * b[0] + ai1 * b[1] + ai2 * b[2] + ai3 * b[3];
    out[i + 4] = ai0 * b[4] + ai1 * b[5] + ai2 * b[6] + ai3 * b[7];
    out[i + 8] = ai0 * b[8] + ai1 * b[9] + ai2 * b[10] + ai3 * b[11];
    out[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
  }
  return out;
}

function syncOrbitFromEye(eye) {
  orbitDistance = Math.max(0.1, Math.hypot(eye[0], eye[1], eye[2]));
  orbitYaw = Math.atan2(eye[0], eye[2]);
  orbitPitch = Math.asin(Math.max(-0.98, Math.min(0.98, eye[1] / orbitDistance)));
}

function updateEyeFromOrbit(out) {
  const cosPitch = Math.cos(orbitPitch);
  out[0] = Math.sin(orbitYaw) * cosPitch * orbitDistance;
  out[1] = Math.sin(orbitPitch) * orbitDistance;
  out[2] = Math.cos(orbitYaw) * cosPitch * orbitDistance;
}

const proj = new Float32Array(16);
const view = new Float32Array(16);
const viewProj = new Float32Array(16);
const model = new Float32Array(16);
const currentEye = new Float32Array(3);
const targetEye = new Float32Array(3);
const transitionStartEye = new Float32Array(3);
const transitionTargetEye = new Float32Array(3);
let cameraSpeed = Number.parseFloat(cameraSpeedInput.value);
let pointSize = Number.parseFloat(pointSizeInput.value);
let basePointSize = pointSize;
let bloomAmount = Number.parseFloat(bloomAmountInput.value);
let particleR = Number.parseFloat(particleRInput.value);
let particleG = Number.parseFloat(particleGInput.value);
let particleB = Number.parseFloat(particleBInput.value);
let curlFrequency = Number.parseFloat(curlFrequencyInput.value);
let curlStrength = Number.parseFloat(curlStrengthInput.value);
let orbitStrength = Number.parseFloat(orbitStrengthInput.value);
let pullStrength = Number.parseFloat(pullStrengthInput.value);
let simMode = "curl";
let noiseType = "curl";
let modeBlend = 0.0;
let targetModeBlend = simMode === "roots" ? 1.0 : 0.0;
let plyBlend = 0.0;
let targetPlyBlend = simMode === "plyCurl" ? 1.0 : 0.0;
let plyColorBlend = 0.0;
let targetPlyColorBlend = 0.0;
let flowColorBlend = 0.0;
let targetFlowColorBlend = 0.0;
let cameraTransitionStart = 0.0;
let cameraTransitionDuration = 0.0;
let isCameraTransitioning = false;
let rotationBurstVelocity = 0.0;
let rotationBurstAngle = 0.0;
let orbitYaw = 0.0;
let orbitPitch = 0.0;
let orbitDistance = 1.0;
let isPointerDragging = false;
let lastPointerX = 0.0;
let lastPointerY = 0.0;
let exportFrames = Number.parseInt(exportFramesInput.value, 10);
let exportFps = Number.parseInt(exportFpsInput.value, 10);
let exportActive = false;
let interactionTime = 0.0;
let guiHidden = false;
let isAspect16x9 = false;
cameraSpeedValue.textContent = cameraSpeed.toFixed(2);
pointSizeValue.textContent = pointSize.toFixed(2);
bloomAmountValue.textContent = bloomAmount.toFixed(2);
particleRValue.textContent = particleR.toFixed(2);
particleGValue.textContent = particleG.toFixed(2);
particleBValue.textContent = particleB.toFixed(2);
curlFrequencyValue.textContent = curlFrequency.toFixed(2);
curlStrengthValue.textContent = curlStrength.toFixed(2);
orbitStrengthValue.textContent = orbitStrength.toFixed(3);
pullStrengthValue.textContent = pullStrength.toFixed(3);
exportFramesValue.textContent = String(exportFrames);
exportFpsValue.textContent = String(exportFps);

cameraSpeedInput.addEventListener("input", () => {
  cameraSpeed = Number.parseFloat(cameraSpeedInput.value);
  cameraSpeedValue.textContent = cameraSpeed.toFixed(2);
});

pointSizeInput.addEventListener("input", () => {
  pointSize = Number.parseFloat(pointSizeInput.value);
  basePointSize = pointSize;
  pointSizeValue.textContent = pointSize.toFixed(2);
});

bloomAmountInput.addEventListener("input", () => {
  bloomAmount = Number.parseFloat(bloomAmountInput.value);
  bloomAmountValue.textContent = bloomAmount.toFixed(2);
});

particleRInput.addEventListener("input", () => {
  particleR = Number.parseFloat(particleRInput.value);
  particleRValue.textContent = particleR.toFixed(2);
});

particleGInput.addEventListener("input", () => {
  particleG = Number.parseFloat(particleGInput.value);
  particleGValue.textContent = particleG.toFixed(2);
});

particleBInput.addEventListener("input", () => {
  particleB = Number.parseFloat(particleBInput.value);
  particleBValue.textContent = particleB.toFixed(2);
});

function setActiveButton(buttons, value) {
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset.value === value);
  }
}

for (const button of noiseTypeButtons) {
  button.addEventListener("click", () => {
    noiseType = button.dataset.value;
    setActiveButton(noiseTypeButtons, noiseType);
  });
}

curlFrequencyInput.addEventListener("input", () => {
  curlFrequency = Number.parseFloat(curlFrequencyInput.value);
  curlFrequencyValue.textContent = curlFrequency.toFixed(2);
});

curlStrengthInput.addEventListener("input", () => {
  curlStrength = Number.parseFloat(curlStrengthInput.value);
  curlStrengthValue.textContent = curlStrength.toFixed(2);
});

orbitStrengthInput.addEventListener("input", () => {
  orbitStrength = Number.parseFloat(orbitStrengthInput.value);
  orbitStrengthValue.textContent = orbitStrength.toFixed(3);
});

pullStrengthInput.addEventListener("input", () => {
  pullStrength = Number.parseFloat(pullStrengthInput.value);
  pullStrengthValue.textContent = pullStrength.toFixed(3);
});

exportFramesInput.addEventListener("input", () => {
  exportFrames = Number.parseInt(exportFramesInput.value, 10);
  exportFramesValue.textContent = String(exportFrames);
});

exportFpsInput.addEventListener("input", () => {
  exportFps = Number.parseInt(exportFpsInput.value, 10);
  exportFpsValue.textContent = String(exportFps);
});

toggleGuiButton.addEventListener("click", () => {
  guiHidden = !guiHidden;
  document.body.classList.toggle("gui-hidden", guiHidden);
  toggleGuiButton.textContent = guiHidden ? "Show GUI" : "Hide GUI";
});

async function toggleFullscreenMode() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await document.documentElement.requestFullscreen();
}

fullscreenModeButton.addEventListener("click", () => {
  toggleFullscreenMode().catch((error) => {
    showError(error.message || "Failed to change fullscreen mode.");
  });
});

function updateExportButtonLabel() {
  const exportWidth = isAspect16x9 ? 1920 : 3840;
  exportPngButton.textContent = `Export ${exportWidth}x1080 PNGs`;
}

for (const button of aspectModeButtons) {
  button.addEventListener("click", () => {
    isAspect16x9 = button.dataset.value === "16-9";
    document.body.classList.toggle("aspect-16-9", isAspect16x9);
    setActiveButton(aspectModeButtons, button.dataset.value);
    updateExportButtonLabel();
    resize();
  });
}
updateExportButtonLabel();

document.addEventListener("fullscreenchange", () => {
  fullscreenModeButton.textContent = document.fullscreenElement
    ? "Exit 16:9 Fullscreen"
    : "Enter 16:9 Fullscreen";
});

plyColorizeButton.addEventListener("click", () => {
  targetPlyColorBlend = targetPlyColorBlend > 0.5 ? 0.0 : 1.0;
  plyColorizeButton.textContent = targetPlyColorBlend > 0.5 ? "On" : "Off";
});

flowColorizeButton.addEventListener("click", () => {
  targetFlowColorBlend = targetFlowColorBlend > 0.5 ? 0.0 : 1.0;
  flowColorizeButton.textContent = targetFlowColorBlend > 0.5 ? "On" : "Off";
});

function resetSimulation() {
  replaceTextureData(stateA, initialState);
  replaceTextureData(stateB, initialState);
  readState = stateA;
  writeState = stateB;
  writeFbo = fboB;
  simTime = 0.0;
  rotationBurstAngle = 0.0;
  rotationBurstVelocity = 0.0;
  lastTime = performance.now();
  exportStatus.textContent = "Simulation restarted.";
}

restartSimulationButton.addEventListener("click", () => {
  resetSimulation();
});

for (const button of simModeButtons) {
  button.addEventListener("click", () => {
    simMode = button.dataset.value;
    setActiveButton(simModeButtons, simMode);
    targetModeBlend = simMode === "roots" ? 1.0 : 0.0;
    targetPlyBlend = simMode === "plyCurl" ? 1.0 : 0.0;
    if (simMode === "plyCurl" && !plyDataLoaded) {
      plyLoadStatus.textContent =
        "No point cloud loaded — showing placeholder. Load a .ply file.";
    }
  });
}

const cameraModes = [
  { name: "Camera 1 / Near Front", getEye() { return [0.0, 1.2, 4.2]; } },
  { name: "Camera 2 / Near Right", getEye() { return [4.6, 1.6, 4.6]; } },
  { name: "Camera 3 / Near Top", getEye() { return [0.0, 5.8, 0.01]; } },
  { name: "Camera 4 / Near Left", getEye() { return [-4.6, 1.6, 4.6]; } },
  { name: "Camera 5 / Near Back Right", getEye() { return [4.2, 1.3, -4.2]; } },
  { name: "Camera 6 / Near Back Left", getEye() { return [-4.2, 1.3, -4.2]; } },
  { name: "Camera 7 / Outer Front", getEye() { return [0.0, 2.8, 6.4]; } },
  { name: "Camera 8 / Outer Right", getEye() { return [5.8, 3.0, 5.8]; } },
  { name: "Camera 9 / Outer Left", getEye() { return [-5.8, 3.0, 5.8]; } },
];

let activeCameraIndex = 0;
cameraLabel.textContent = cameraModes[activeCameraIndex].name;
{
  const eye = cameraModes[activeCameraIndex].getEye(0);
  currentEye[0] = eye[0];
  currentEye[1] = eye[1];
  currentEye[2] = eye[2];
  targetEye[0] = eye[0];
  targetEye[1] = eye[1];
  targetEye[2] = eye[2];
  syncOrbitFromEye(eye);
}

function beginCameraTransition(nextEye, now) {
  transitionStartEye[0] = currentEye[0];
  transitionStartEye[1] = currentEye[1];
  transitionStartEye[2] = currentEye[2];
  transitionTargetEye[0] = nextEye[0];
  transitionTargetEye[1] = nextEye[1];
  transitionTargetEye[2] = nextEye[2];
  targetEye[0] = nextEye[0];
  targetEye[1] = nextEye[1];
  targetEye[2] = nextEye[2];
  const dx = transitionTargetEye[0] - transitionStartEye[0];
  const dy = transitionTargetEye[1] - transitionStartEye[1];
  const dz = transitionTargetEye[2] - transitionStartEye[2];
  const distance = Math.hypot(dx, dy, dz);
  cameraTransitionStart = now;
  cameraTransitionDuration = Math.max(0.35, distance / Math.max(cameraSpeed, 0.05));
  isCameraTransitioning = distance > 1e-4;
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }
  if (event.key === "0") {
    rotationBurstVelocity = ROTATION_BURST_SPEED;
    return;
  }
  const index = Number.parseInt(event.key, 10) - 1;
  if (index >= 0 && index < cameraModes.length) {
    activeCameraIndex = index;
    cameraLabel.textContent = cameraModes[activeCameraIndex].name;
    const now = exportActive ? interactionTime : performance.now() * 0.001;
    beginCameraTransition(cameraModes[activeCameraIndex].getEye(now), now);
  }
});

canvas.addEventListener("pointerdown", (event) => {
  isPointerDragging = true;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!isPointerDragging) {
    return;
  }
  const dx = event.clientX - lastPointerX;
  const dy = event.clientY - lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  orbitYaw -= dx * 0.0055;
  orbitPitch = Math.max(-1.2, Math.min(1.2, orbitPitch - dy * 0.0045));
  isCameraTransitioning = false;
  updateEyeFromOrbit(targetEye);
  currentEye[0] = targetEye[0];
  currentEye[1] = targetEye[1];
  currentEye[2] = targetEye[2];
});

function stopPointerDrag(event) {
  if (event && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  isPointerDragging = false;
}

canvas.addEventListener("pointerup", stopPointerDrag);
canvas.addEventListener("pointercancel", stopPointerDrag);

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  orbitDistance = Math.max(2.5, Math.min(14.0, orbitDistance * (1.0 + event.deltaY * 0.001)));
  updateEyeFromOrbit(targetEye);
  currentEye[0] = targetEye[0];
  currentEye[1] = targetEye[1];
  currentEye[2] = targetEye[2];
}, { passive: false });

function resize() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

window.addEventListener("resize", resize);
resize();

gl.disable(gl.CULL_FACE);
gl.disable(gl.DEPTH_TEST);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

let lastTime = performance.now();

function renderFrame(time, delta, width, height) {
  interactionTime = time;
  const aspect = width / height;
  rotationBurstAngle += rotationBurstVelocity * delta;
  rotationBurstVelocity *= Math.exp(-ROTATION_BURST_DECAY * delta);
  if (rotationBurstVelocity < 0.001) {
    rotationBurstVelocity = 0.0;
  }
  const rotationSpeed = GLOBAL_ROTATION_SPEED + rotationBurstVelocity * 0.18;

  gl.useProgram(simProgram);
  gl.bindVertexArray(quadVao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
  gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, readState);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, targetsTexture);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, plyTargetsTexture);
  gl.uniform1i(gl.getUniformLocation(simProgram, "uState"), 0);
  gl.uniform1i(gl.getUniformLocation(simProgram, "uTargets"), 1);
  gl.uniform1i(gl.getUniformLocation(simProgram, "uPlyTargets"), 2);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uTime"), time);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uDelta"), delta);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uBounds"), BOUNDS);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uIntroDuration"), INTRO_DURATION);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uRotationSpeed"), rotationSpeed);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uCurlFrequency"), curlFrequency);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uCurlStrength"), curlStrength);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uOrbitStrength"), orbitStrength);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uPullStrength"), pullStrength);
  gl.uniform1f(
    gl.getUniformLocation(simProgram, "uNoiseType"),
    noiseType === "ridged" ? 1.0 : noiseType === "worley" ? 2.0 : noiseType === "domainWarped" ? 3.0 : 0.0
  );
  const modeDelta = targetModeBlend - modeBlend;
  const modeStep = cameraSpeed * MODE_BLEND_SPEED_FACTOR * delta;
  if (Math.abs(modeDelta) <= modeStep) {
    modeBlend = targetModeBlend;
  } else {
    modeBlend += Math.sign(modeDelta) * modeStep;
  }
  const plyDelta = targetPlyBlend - plyBlend;
  const plyStep = cameraSpeed * PLY_BLEND_SPEED_FACTOR * delta;
  if (Math.abs(plyDelta) <= plyStep) {
    plyBlend = targetPlyBlend;
  } else {
    plyBlend += Math.sign(plyDelta) * plyStep;
  }
  const plyColorDelta = targetPlyColorBlend - plyColorBlend;
  const plyColorStep = cameraSpeed * MODE_BLEND_SPEED_FACTOR * delta;
  if (Math.abs(plyColorDelta) <= plyColorStep) {
    plyColorBlend = targetPlyColorBlend;
  } else {
    plyColorBlend += Math.sign(plyColorDelta) * plyColorStep;
  }
  const flowColorDelta = targetFlowColorBlend - flowColorBlend;
  const flowColorStep = cameraSpeed * MODE_BLEND_SPEED_FACTOR * delta;
  if (Math.abs(flowColorDelta) <= flowColorStep) {
    flowColorBlend = targetFlowColorBlend;
  } else {
    flowColorBlend += Math.sign(flowColorDelta) * flowColorStep;
  }
  const plySizeBlend = Math.pow(Math.max(0.0, Math.min(1.0, plyBlend)), 1.2);
  const effectivePointSize =
    basePointSize +
    (Number.parseFloat(pointSizeInput.max) - basePointSize) * plySizeBlend;
  gl.uniform1f(gl.getUniformLocation(simProgram, "uModeBlend"), modeBlend);
  gl.uniform1f(gl.getUniformLocation(simProgram, "uPlyBlend"), plyBlend);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  [readState, writeState] = [writeState, readState];
  writeFbo = writeState === stateA ? fboA : fboB;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  perspective(proj, Math.PI / 2.8, aspect, 0.1, 100.0);
  if (isCameraTransitioning) {
    const dx = transitionTargetEye[0] - currentEye[0];
    const dy = transitionTargetEye[1] - currentEye[1];
    const dz = transitionTargetEye[2] - currentEye[2];
    const distance = Math.hypot(dx, dy, dz);
    const maxStep = cameraSpeed * delta;
    if (distance <= Math.max(maxStep, 1e-4)) {
      currentEye[0] = transitionTargetEye[0];
      currentEye[1] = transitionTargetEye[1];
      currentEye[2] = transitionTargetEye[2];
      isCameraTransitioning = false;
    } else {
      const stepScale = maxStep / distance;
      currentEye[0] += dx * stepScale;
      currentEye[1] += dy * stepScale;
      currentEye[2] += dz * stepScale;
    }
  } else {
    currentEye[0] = targetEye[0];
    currentEye[1] = targetEye[1];
    currentEye[2] = targetEye[2];
  }
  lookAt(view, currentEye, [0, 0, 0], [0, 1, 0]);
  multiplyMat4(viewProj, proj, view);
  const c = Math.cos(rotationBurstAngle);
  const s = Math.sin(rotationBurstAngle);
  model[0] = c;
  model[1] = 0;
  model[2] = -s;
  model[3] = 0;
  model[4] = 0;
  model[5] = 1;
  model[6] = 0;
  model[7] = 0;
  model[8] = s;
  model[9] = 0;
  model[10] = c;
  model[11] = 0;
  model[12] = 0;
  model[13] = 0;
  model[14] = 0;
  model[15] = 1;

  gl.useProgram(renderProgram);
  gl.bindVertexArray(particleVao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, readState);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, plyColorsTexture);
  gl.uniform1i(gl.getUniformLocation(renderProgram, "uState"), 0);
  gl.uniform1i(gl.getUniformLocation(renderProgram, "uPlyColors"), 1);
  gl.uniformMatrix4fv(gl.getUniformLocation(renderProgram, "uModel"), false, model);
  gl.uniformMatrix4fv(gl.getUniformLocation(renderProgram, "uViewProj"), false, viewProj);
  gl.uniform1f(gl.getUniformLocation(renderProgram, "uPointScale"), Math.min(window.devicePixelRatio || 1, 2) * effectivePointSize);
  gl.uniform1f(gl.getUniformLocation(renderProgram, "uSimSize"), SIM_SIZE);
  gl.uniform1f(gl.getUniformLocation(renderProgram, "uBounds"), BOUNDS);
  gl.uniform1f(gl.getUniformLocation(renderProgram, "uPlyBlend"), plyBlend);
  gl.uniform1f(gl.getUniformLocation(renderProgram, "uPlyColorBlend"), plyColorBlend);
  gl.uniform1f(gl.getUniformLocation(renderProgram, "uFlowColorBlend"), flowColorBlend);
  gl.uniform3f(gl.getUniformLocation(renderProgram, "uParticleTint"), particleR, particleG, particleB);
  gl.uniform1f(gl.getUniformLocation(renderProgram, "uBloomAmount"), bloomAmount);
  gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
}

function step(now) {
  if (exportActive) {
    return;
  }
  resize();

  const delta = Math.min(0.033, (now - lastTime) * 0.001);
  lastTime = now;
  simTime += delta;
  renderFrame(simTime, delta, canvas.width, canvas.height);

  requestAnimationFrame(step);
}

async function exportPngSequence() {
  if (exportActive) {
    return;
  }
  exportActive = true;
  exportPngButton.disabled = true;
  exportStatus.textContent = "Preparing export...";
  try {
    let exportDirectory = null;
    const isElectron = Boolean(window.electronEnv && window.electronEnv.isElectron);
    if (isElectron) {
      exportDirectory = await window.electronEnv.prepareExportDirectory();
    } else if (typeof window.showDirectoryPicker === "function") {
      exportDirectory = await window.showDirectoryPicker({ mode: "readwrite" });
    } else {
      showError("PNG export requires Electron or a Chromium-based browser with File System Access API.");
    }
    if (!exportDirectory) {
      exportStatus.textContent = "Export canceled.";
      return;
    }
    const prevWidth = canvas.width;
    const prevHeight = canvas.height;
    const exportWidth = isAspect16x9 ? 1920 : 3840;
    const exportHeight = 1080;
    const dt = 1.0 / exportFps;
    let exportTime = simTime;
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    gl.viewport(0, 0, exportWidth, exportHeight);
    for (let i = 0; i < exportFrames; i += 1) {
      renderFrame(exportTime, dt, exportWidth, exportHeight);
      const filename = `frame_${String(i + 1).padStart(6, "0")}.png`;
      if (isElectron) {
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j += 1) {
          bytes[j] = binary.charCodeAt(j);
        }
        await window.electronEnv.writeExportFile(`${exportDirectory}/${filename}`, bytes.buffer);
      } else {
        const blob = await canvasToBlob(canvas);
        const fileHandle = await exportDirectory.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      }
      exportStatus.textContent = `Exporting ${i + 1} / ${exportFrames}`;
      exportTime += dt;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    canvas.width = prevWidth;
    canvas.height = prevHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    exportStatus.textContent = `Export complete: ${exportFrames} PNGs at ${exportWidth}x${exportHeight} -> ${exportDirectory}`;
  } catch (error) {
    if (error && error.name === "AbortError") {
      exportStatus.textContent = "Export canceled.";
    } else {
      exportStatus.textContent = "Export failed.";
      throw error;
    }
  } finally {
    exportActive = false;
    exportPngButton.disabled = false;
    lastTime = performance.now();
    resize();
    requestAnimationFrame(step);
  }
}

exportPngButton.addEventListener("click", () => {
  exportPngSequence().catch((error) => {
    showError(error.message || "PNG export failed.");
  });
});

// ---- Runtime point-cloud (.ply) loading ------------------------------------
const loadPlyButton = document.getElementById("loadPly");
const plyFileInput = document.getElementById("plyFileInput");
const plyLoadStatus = document.getElementById("plyLoadStatus");

const PLY_TYPE_SIZE = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4,
  float: 4, float32: 4, double: 8, float64: 8,
};

function isFloatType(type) {
  return type === "float" || type === "float32" || type === "double" || type === "float64";
}

function readPlyValue(view, offset, type, littleEndian) {
  switch (type) {
    case "char": case "int8": return view.getInt8(offset);
    case "uchar": case "uint8": return view.getUint8(offset);
    case "short": case "int16": return view.getInt16(offset, littleEndian);
    case "ushort": case "uint16": return view.getUint16(offset, littleEndian);
    case "int": case "int32": return view.getInt32(offset, littleEndian);
    case "uint": case "uint32": return view.getUint32(offset, littleEndian);
    case "float": case "float32": return view.getFloat32(offset, littleEndian);
    case "double": case "float64": return view.getFloat64(offset, littleEndian);
    default: return 0;
  }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Parse ASCII / binary (little & big endian) PLY. Returns { positions, colors }.
function parsePly(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const probe = new TextDecoder("utf-8").decode(
    bytes.subarray(0, Math.min(bytes.length, 100000))
  );
  const endIdx = probe.indexOf("end_header");
  if (endIdx < 0) {
    throw new Error("Not a PLY file (missing end_header).");
  }
  const nlIdx = probe.indexOf("\n", endIdx);
  const dataOffset = nlIdx + 1;
  const lines = probe.slice(0, nlIdx).split(/\r?\n/);

  let format = "ascii";
  const elements = [];
  let current = null;
  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith("format")) {
      format = t.split(/\s+/)[1];
    } else if (t.startsWith("element")) {
      const p = t.split(/\s+/);
      current = { name: p[1], count: parseInt(p[2], 10), props: [] };
      elements.push(current);
    } else if (t.startsWith("property") && current) {
      const p = t.split(/\s+/);
      if (p[1] === "list") {
        current.props.push({ name: p[4], list: true, countType: p[2], itemType: p[3] });
      } else {
        current.props.push({ name: p[2], list: false, type: p[1] });
      }
    }
  }

  const vertexEl = elements.find((e) => e.name === "vertex");
  if (!vertexEl) {
    throw new Error("PLY has no vertex element.");
  }
  const idxOf = (names) =>
    vertexEl.props.findIndex((prop) => names.includes(prop.name));
  const xi = idxOf(["x"]);
  const yi = idxOf(["y"]);
  const zi = idxOf(["z"]);
  if (xi < 0 || yi < 0 || zi < 0) {
    throw new Error("PLY vertices have no x/y/z coordinates.");
  }
  const ri = idxOf(["red", "diffuse_red", "r"]);
  const gi = idxOf(["green", "diffuse_green", "g"]);
  const bi = idxOf(["blue", "diffuse_blue", "b"]);
  const hasColor = ri >= 0 && gi >= 0 && bi >= 0;
  const cScale = (i) => (isFloatType(vertexEl.props[i].type) ? 1.0 : 1.0 / 255.0);
  const rS = hasColor ? cScale(ri) : 1;
  const gS = hasColor ? cScale(gi) : 1;
  const bS = hasColor ? cScale(bi) : 1;

  const n = vertexEl.count;
  const positions = new Float32Array(n * 3);
  const colors = hasColor ? new Float32Array(n * 3) : null;

  const store = (rec, values) => {
    positions[rec * 3] = values[xi];
    positions[rec * 3 + 1] = values[yi];
    positions[rec * 3 + 2] = values[zi];
    if (hasColor) {
      colors[rec * 3] = clamp01(values[ri] * rS);
      colors[rec * 3 + 1] = clamp01(values[gi] * gS);
      colors[rec * 3 + 2] = clamp01(values[bi] * bS);
    }
  };

  if (format === "ascii") {
    const body = new TextDecoder("utf-8").decode(bytes.subarray(dataOffset));
    const tokens = body.split(/\s+/);
    let ptr = 0;
    while (ptr < tokens.length && tokens[ptr] === "") ptr += 1;
    for (const el of elements) {
      for (let rec = 0; rec < el.count; rec += 1) {
        const values = new Array(el.props.length);
        for (let pI = 0; pI < el.props.length; pI += 1) {
          const prop = el.props[pI];
          if (prop.list) {
            const cnt = parseInt(tokens[ptr++], 10) || 0;
            ptr += cnt;
            values[pI] = 0;
          } else {
            values[pI] = parseFloat(tokens[ptr++]);
          }
        }
        if (el === vertexEl) store(rec, values);
      }
    }
  } else if (format === "binary_little_endian" || format === "binary_big_endian") {
    const le = format === "binary_little_endian";
    const view = new DataView(arrayBuffer, dataOffset);
    let off = 0;
    for (const el of elements) {
      for (let rec = 0; rec < el.count; rec += 1) {
        const values = new Array(el.props.length);
        for (let pI = 0; pI < el.props.length; pI += 1) {
          const prop = el.props[pI];
          if (prop.list) {
            const cnt = readPlyValue(view, off, prop.countType, le);
            off += PLY_TYPE_SIZE[prop.countType];
            off += cnt * PLY_TYPE_SIZE[prop.itemType];
            values[pI] = 0;
          } else {
            values[pI] = readPlyValue(view, off, prop.type, le);
            off += PLY_TYPE_SIZE[prop.type];
          }
        }
        if (el === vertexEl) store(rec, values);
      }
    }
  } else {
    throw new Error(`Unsupported PLY format: ${format}`);
  }

  return { positions, colors };
}

// Resample an arbitrary point cloud to exactly PARTICLE_COUNT points, center
// and scale it to fit within BOUNDS, then upload to the PLY target/color
// textures. Colorless clouds default to white.
function applyPointCloud(rawPositions, rawColors, options) {
  const normalize = !(options && options.normalize === false);
  const n = Math.floor(rawPositions.length / 3);
  if (n < 1) {
    throw new Error("Point cloud has no points.");
  }

  let cx = 0;
  let cy = 0;
  let cz = 0;
  let scale = 1;
  if (normalize) {
    for (let i = 0; i < n; i += 1) {
      cx += rawPositions[i * 3];
      cy += rawPositions[i * 3 + 1];
      cz += rawPositions[i * 3 + 2];
    }
    cx /= n;
    cy /= n;
    cz /= n;
    let maxR2 = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = rawPositions[i * 3] - cx;
      const dy = rawPositions[i * 3 + 1] - cy;
      const dz = rawPositions[i * 3 + 2] - cz;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > maxR2) maxR2 = r2;
    }
    scale = (BOUNDS * 1.1) / Math.max(Math.sqrt(maxR2), 1e-4);
  }

  const upsampling = n < PARTICLE_COUNT;
  const jitter = upsampling ? BOUNDS * 0.006 : 0;
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const src = n >= PARTICLE_COUNT ? Math.floor((i * n) / PARTICLE_COUNT) : i % n;
    let x = (rawPositions[src * 3] - cx) * scale;
    let y = (rawPositions[src * 3 + 1] - cy) * scale;
    let z = (rawPositions[src * 3 + 2] - cz) * scale;
    if (upsampling) {
      x += (Math.random() - 0.5) * jitter;
      y += (Math.random() - 0.5) * jitter;
      z += (Math.random() - 0.5) * jitter;
    }
    const dst = i * 4;
    plyTargetTextureData[dst] = x;
    plyTargetTextureData[dst + 1] = y;
    plyTargetTextureData[dst + 2] = z;
    plyTargetTextureData[dst + 3] = 1.0;
    plyColorTextureData[dst] = rawColors ? rawColors[src * 3] : 1.0;
    plyColorTextureData[dst + 1] = rawColors ? rawColors[src * 3 + 1] : 1.0;
    plyColorTextureData[dst + 2] = rawColors ? rawColors[src * 3 + 2] : 1.0;
    plyColorTextureData[dst + 3] = 1.0;
  }

  replaceTextureData(plyTargetsTexture, plyTargetTextureData);
  replaceTextureData(plyColorsTexture, plyColorTextureData);
  plyDataLoaded = true;
}

async function loadPlyFile(file) {
  try {
    plyLoadStatus.textContent = `Loading ${file.name} ...`;
    const buffer = await file.arrayBuffer();
    const { positions, colors } = parsePly(buffer);
    const count = Math.floor(positions.length / 3);
    if (count < 1) {
      throw new Error("no vertices found.");
    }
    applyPointCloud(positions, colors, { normalize: true });
    simMode = "plyCurl";
    setActiveButton(simModeButtons, simMode);
    targetModeBlend = 0.0;
    targetPlyBlend = 1.0;
    const colorNote = colors ? "" : " (no color → white)";
    plyLoadStatus.textContent =
      `Loaded ${count.toLocaleString()} points from ${file.name}${colorNote}.`;
  } catch (error) {
    plyLoadStatus.textContent = `Failed to load PLY: ${error.message || error}`;
  }
}

if (loadPlyButton && plyFileInput) {
  loadPlyButton.addEventListener("click", () => plyFileInput.click());
  plyFileInput.addEventListener("change", () => {
    const file = plyFileInput.files && plyFileInput.files[0];
    if (file) loadPlyFile(file);
    plyFileInput.value = "";
  });
}

canvas.addEventListener("dragover", (event) => event.preventDefault());
canvas.addEventListener("drop", (event) => {
  event.preventDefault();
  const file =
    event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) loadPlyFile(file);
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

// Apply the bundled point cloud asset on startup if it is present.
if (window.__PLY_TARGETS_BASE64__ && window.__PLY_COLORS_BASE64__) {
  try {
    const bundledTargets = decodeBase64Float32(window.__PLY_TARGETS_BASE64__);
    const bundledColors = decodeBase64Float32(window.__PLY_COLORS_BASE64__);
    if (
      bundledTargets.length === PARTICLE_COUNT * 3 &&
      bundledColors.length === PARTICLE_COUNT * 3
    ) {
      const targets3 = new Float32Array(bundledTargets);
      applyPointCloud(targets3, bundledColors, { normalize: false });
    }
  } catch (error) {
    // Ignore a malformed bundled asset; runtime loading still works.
  }
}

requestAnimationFrame(step);
