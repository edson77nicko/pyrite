// Photorealistic Hubble / Gargantua Relativistic Black Hole WebGL Shader
// Features:
// - Pure Pitch-Black Event Horizon Shadow (zero milky inner fill)
// - Razor-thin Relativistic Photon Ring
// - High-frequency Filamentary Keplerian Accretion Ringlets with Dark Dust Lanes
// - Multi-layered Hubble Deep-Field Pinpoint Starfield & Subtle Interstellar Nebulae

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_resolution;
uniform vec2 u_bhCenter;    // Screen-space center of the black hole in pixels
uniform float u_scale;      // Camera zoom scale
uniform float u_time;       // Elapsed time in seconds
uniform float u_tilt;       // Disk tilt angle (radians)
uniform float u_rotation;   // Disk azimuthal rotation (radians)
uniform vec3 u_accentColor; // Normalized RGB accent color
uniform vec2 u_mouse;       // Screen-space mouse coords in pixels
uniform float u_intensity;  // Overall disk luminosity multiplier

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n));
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += amp * noise2D(p);
    p = rot * p * 2.07 + vec2(19.3, 11.7);
    amp *= 0.5;
  }
  return v;
}

// Realistic Planckian Blackbody Star Color from random seed [0..1]
vec3 blackbodyStarColor(float t) {
  if (t < 0.25) return mix(vec3(1.0, 0.68, 0.42), vec3(1.0, 0.86, 0.68), t / 0.25); // K/M warm amber-gold
  if (t < 0.70) return mix(vec3(1.0, 0.86, 0.68), vec3(0.98, 0.98, 1.0), (t - 0.25) / 0.45); // G/F solar ivory-white
  return mix(vec3(0.98, 0.98, 1.0), vec3(0.72, 0.86, 1.0), (t - 0.70) / 0.30); // O/B Sirius blue-white
}

// Multi-layered Hubble Deep-Field Starfield (pinpoint optical PSF stars)
vec3 renderHubbleStarLayer(vec2 uv, float scale, float densityThresh, float brightness) {
  vec2 gv = uv * scale;
  vec2 id = floor(gv);
  vec2 f = fract(gv) - 0.5;

  float h = hash21(id);
  if (h < densityThresh) return vec3(0.0);

  vec2 randOff = (hash22(id) - 0.5) * 0.72;
  vec2 dVec = f - randOff;
  float d = length(dVec);

  float relMag = (h - densityThresh) / (1.0 - densityThresh);
  float twinkle = 0.88 + 0.12 * sin(u_time * (1.2 + h * 3.5) + h * 90.0);

  // Sharp optical pinpoint core + soft exponential PSF halo
  float core = exp(-d * d * 260.0);
  float halo = exp(-d * 18.0) * 0.35 * relMag;

  // Subtle Hubble 4-point diffraction cross for the brightest 15% of field stars
  float spikes = 0.0;
  if (relMag > 0.85) {
    float sx = exp(-abs(dVec.y) * 95.0) * exp(-abs(dVec.x) * 14.0);
    float sy = exp(-abs(dVec.x) * 95.0) * exp(-abs(dVec.y) * 14.0);
    spikes = (sx + sy) * 0.45 * (relMag - 0.85) * 6.0;
  }

  vec3 col = blackbodyStarColor(fract(h * 53.7));
  return col * (core + halo + spikes) * relMag * brightness * twinkle;
}

vec3 renderHubbleDeepSpace(vec2 lensedUV) {
  // Deepest inky cosmic void - high-contrast deep field
  vec3 space = vec3(0.0003, 0.0004, 0.0008);

  // Hubble Interstellar Nebulae (Carina / Cygnus inspired subtle gas + dark dust lanes - darker tone)
  float n1 = fbm(lensedUV * 1.35 + vec2(2.4, -1.1));
  float n2 = fbm(lensedUV * 2.8 + vec2(-n1 * 0.9, n1 * 0.7));
  float darkDust = smoothstep(0.38, 0.68, fbm(lensedUV * 3.4 + vec2(8.1, 3.7)));

  vec3 warmNebula = vec3(0.035, 0.015, 0.007) * pow(n1, 2.7);
  vec3 coolNebula = vec3(0.007, 0.015, 0.035) * pow(n2, 2.5);
  vec3 accentMist = u_accentColor * 0.008 * pow(n1 * n2, 1.9);

  space += (warmNebula + coolNebula + accentMist) * (1.0 - darkDust * 0.85);

  // 3 octaves of pinpoint Hubble stars (faint background dust -> medium stars -> bright field stars)
  space += renderHubbleStarLayer(lensedUV, 95.0, 0.85, 0.25);
  space += renderHubbleStarLayer(lensedUV + vec2(17.3, 9.1), 46.0, 0.92, 0.55);
  space += renderHubbleStarLayer(lensedUV + vec2(41.7, 23.4), 21.0, 0.97, 0.95);

  return space;
}

void main() {
  vec2 fragCoord = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);

  float baseUnit = min(u_resolution.x, u_resolution.y) * 0.42 * u_scale;
  vec2 p = (fragCoord - u_bhCenter) / max(1.0, baseUnit);

  // Camera setup looking at the singularity (0, 0, 0)
  float camDist = 3.8;
  float tilt = clamp(u_tilt, 0.12, 1.35);
  vec3 ro = vec3(0.0, sin(tilt) * camDist, -cos(tilt) * camDist);

  vec3 forward = normalize(-ro);
  vec3 right = vec3(1.0, 0.0, 0.0);
  vec3 up = cross(right, forward);

  // Subtle cinematic angle roll (-8 degrees)
  float roll = -0.14;
  float cr = cos(roll), sr = sin(roll);
  vec2 pr = mat2(cr, -sr, sr, cr) * p;

  vec3 rd = normalize(forward * 1.65 + right * pr.x + up * pr.y);

  // Schwarzschild & Thin Relativistic Accretion Disk parameters
  float rs = 0.235;              // Event horizon shadow radius
  float diskInner = 0.35;        // Innermost Stable Circular Orbit (ISCO)
  float diskOuter = 2.40;        // Outer filamentous edge

  vec3 pos = ro;
  vec3 dir = rd;

  vec3 accumDisk = vec3(0.0);
  float transmittance = 1.0;
  bool hitHorizon = false;
  float minRadius = 100.0;

  // Geodesic Raymarching (56 steps for complete 360-degree convergence into the Event Horizon)
  for (int i = 0; i < 56; i++) {
    float r = length(pos);
    minRadius = min(minRadius, r);

    if (r < rs) {
      hitHorizon = true;
      break;
    }

    // Relativistic light bending around the Schwarzschild metric
    float r2 = r * r;
    vec3 gravity = -pos * (0.102 / (r2 * r + 0.0015));

    float planeDist = abs(pos.y);
    float dt = clamp(r * 0.075, 0.020, 0.20);
    dt = min(dt, max(0.016, planeDist * 0.55));

    vec3 nextPos = pos + dir * dt + 0.5 * gravity * dt * dt;
    dir = normalize(dir + gravity * dt);

    // Check intersection with the thin equatorial accretion disk plane (y = 0)
    float diskHalfH = 0.028 + 0.022 * smoothstep(diskInner, diskOuter, r);
    if (abs(nextPos.y) < diskHalfH || (pos.y * nextPos.y < 0.0)) {
      // Exact linear interpolation of the plane crossing for razor-sharp ring detail
      float crossT = clamp(abs(pos.y) / (abs(pos.y - nextPos.y) + 0.0001), 0.0, 1.0);
      vec3 hitPos = mix(pos, nextPos, crossT);
      float rad = length(hitPos.xz);

      if (rad > diskInner && rad < diskOuter) {
        float normR = (rad - diskInner) / (diskOuter - diskInner);

        // Keplerian differential angular speed (inner rings orbit much faster)
        float angle = atan(hitPos.z, hitPos.x) + u_rotation;
        float speed = 1.05 / (pow(rad, 0.9) + 0.14);

        // High-frequency sheared spiral filaments (like real astrophoto plasma streaks)
        float shearAngle = angle + log(rad * 3.2) * 9.5 - u_time * speed;
        float streakNoise = fbm(vec2(shearAngle * 1.8, rad * 14.0));
        float fineStreaks = noise2D(vec2(shearAngle * 5.5, rad * 38.0));

        // Concentric Keplerian ringlets & dark dust gaps (prevents flat white blobs!)
        float ringlets1 = 0.5 + 0.5 * sin(rad * 78.0 + streakNoise * 4.5);
        float ringlets2 = 0.5 + 0.5 * sin(rad * 195.0 - fineStreaks * 3.2);
        float dustGaps = smoothstep(0.22, 0.78, streakNoise * 0.65 + ringlets1 * 0.35);

        float filamentStructure = dustGaps * (0.45 + 0.55 * ringlets1 * ringlets2) * (0.6 + 0.4 * fineStreaks);

        // Smooth inner ISCO rim and outer exponential falloff
        float innerEdge = smoothstep(diskInner, diskInner + 0.055, rad);
        float outerEdge = pow(1.0 - smoothstep(0.08, 1.0, normR), 2.35);
        float vertProfile = exp(-abs(hitPos.y) / (diskHalfH * 0.45));

        float density = filamentStructure * innerEdge * outerEdge * vertProfile * 0.36;

        if (density > 0.001) {
          // Subtle, realistic relativistic Doppler beaming (never blows out to flat grey-white)
          vec3 tangent = normalize(vec3(-hitPos.z, 0.0, hitPos.x));
          float doppler = dot(tangent, -rd);
          float beaming = clamp(1.0 + doppler * 0.28, 0.62, 1.32);

          // Authentic Blackbody Temperature Gradient:
          // Warm ivory inner rim -> Golden Amber -> Burnt Copper / Deep Rust outer dust
          vec3 innerHot = vec3(1.0, 0.91, 0.72);
          vec3 midGold = mix(vec3(0.92, 0.56, 0.20), u_accentColor, 0.28);
          vec3 outerCopper = vec3(0.38, 0.13, 0.05);

          vec3 col = mix(innerHot, midGold, smoothstep(0.0, 0.26, normR));
          col = mix(col, outerCopper, smoothstep(0.24, 0.88, normR));

          // Carve dark dust absorption veins inside the disk for photographic contrast
          col *= mix(0.25, 1.15, filamentStructure);

          vec3 emission = col * beaming * (1.25 + (1.0 - normR) * 1.1) * u_intensity;

          accumDisk += transmittance * emission * density;
          transmittance *= (1.0 - clamp(density * 0.82, 0.0, 0.88));
          if (transmittance < 0.03) break;
        }
      }
    }

    pos = nextPos;
    if (r > 4.6 && dot(pos, dir) > 0.0) break;
  }

  vec3 finalColor = vec3(0.0);

  if (hitHorizon) {
    // Pure pitch-black Event Horizon shadow (#000000 void)
    finalColor = vec3(0.0);
  } else {
    // Ray escaped into deep space: sample lensed Hubble background + razor-thin Photon Ring
    vec2 lensedUV = dir.xy / (abs(dir.z) + 0.55) + vec2(u_rotation * 0.06, 0.0);
    vec3 deepSpace = renderHubbleDeepSpace(lensedUV);

    // Brilliant, incandescent razor-thin Photon Ring framing the event horizon shadow
    float distFromShadow = max(0.0, minRadius - rs);
    float sharpRing = exp(-distFromShadow * 140.0) * 4.2;
    float innerHalo = exp(-distFromShadow * 36.0) * 1.8;
    float coronaGlow = exp(-distFromShadow * 12.0) * 0.5;

    vec3 ringCore = vec3(1.0, 0.98, 0.94) * sharpRing;
    vec3 ringHalo = vec3(1.0, 0.84, 0.48) * innerHalo;
    vec3 ringCorona = mix(vec3(1.0, 0.70, 0.30), u_accentColor, 0.25) * coronaGlow;

    // Smooth optical sub-pixel antialiasing at the shadow boundary to eliminate serrated edge
    float pixelDist = 3.2 / max(1.0, baseUnit * 0.45);
    float edgeRamp = smoothstep(0.0, pixelDist, distFromShadow);

    vec3 photonCol = (ringCore + ringHalo + ringCorona) * edgeRamp * u_intensity;

    vec3 escapedLight = accumDisk + transmittance * (deepSpace + photonCol);
    finalColor = mix(vec3(0.0), escapedLight, edgeRamp);
  }

  // Smooth photographic filmic tone mapping (preserves rich golden highlights without washing out)
  finalColor = 1.0 - exp(-finalColor * 1.15);
  finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(0.96));

  gl_FragColor = vec4(finalColor, 1.0);
}
`

export interface BlackHoleRenderer {
  render: (params: {
    width: number
    height: number
    dpr: number
    centerX: number
    centerY: number
    scale: number
    time: number
    tilt: number
    rotation: number
    accentRgb: [number, number, number]
    mouseX: number
    mouseY: number
    intensity: number
  }) => void
  dispose: () => void
}

export function createBlackHoleRenderer(canvas: HTMLCanvasElement): BlackHoleRenderer | null {
  const gl = (canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false }) ||
    canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null

  if (!gl) return null

  const compileShader = (type: number, source: string) => {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[BlackHoleShader] Compile error:', gl.getShaderInfoLog(shader))
      gl.deleteShader(shader)
      return null
    }
    return shader
  }

  const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vs || !fs) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[BlackHoleShader] Link error:', gl.getProgramInfoLog(program))
    return null
  }

  const posBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  )

  const aPos = gl.getAttribLocation(program, 'a_position')
  const uRes = gl.getUniformLocation(program, 'u_resolution')
  const uCenter = gl.getUniformLocation(program, 'u_bhCenter')
  const uScale = gl.getUniformLocation(program, 'u_scale')
  const uTime = gl.getUniformLocation(program, 'u_time')
  const uTilt = gl.getUniformLocation(program, 'u_tilt')
  const uRot = gl.getUniformLocation(program, 'u_rotation')
  const uAccent = gl.getUniformLocation(program, 'u_accentColor')
  const uMouse = gl.getUniformLocation(program, 'u_mouse')
  const uIntensity = gl.getUniformLocation(program, 'u_intensity')

  return {
    render({
      width,
      height,
      dpr,
      centerX,
      centerY,
      scale,
      time,
      tilt,
      rotation,
      accentRgb,
      mouseX,
      mouseY,
      intensity
    }) {
      const renderScale = Math.min(2.0, Math.max(1.0, dpr))
      const targetW = Math.max(1, Math.ceil(width * renderScale))
      const targetH = Math.max(1, Math.ceil(height * renderScale))

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }

      gl.viewport(0, 0, targetW, targetH)
      gl.useProgram(program)

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

      gl.uniform2f(uRes, targetW, targetH)
      gl.uniform2f(uCenter, centerX * renderScale, centerY * renderScale)
      gl.uniform1f(uScale, scale)
      gl.uniform1f(uTime, time)
      gl.uniform1f(uTilt, tilt)
      gl.uniform1f(uRot, rotation)
      gl.uniform3f(uAccent, accentRgb[0], accentRgb[1], accentRgb[2])
      gl.uniform2f(uMouse, mouseX * renderScale, mouseY * renderScale)
      gl.uniform1f(uIntensity, intensity)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
    },
    dispose() {
      gl.deleteBuffer(posBuffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }
}
