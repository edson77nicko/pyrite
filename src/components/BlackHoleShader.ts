// Real-Time Relativistic Black Hole (Gargantua) WebGL Shader Engine
// Uses geodesic light-bending raymarching to render the Event Horizon,
// Photon Sphere, Lensed Accretion Disk, Doppler Beaming, and Lensed Starfield.

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

// Fast hash & 2D/3D procedural value noise for plasma turbulence
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
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
  for (int i = 0; i < 4; i++) {
    v += amp * noise2D(p);
    p = rot * p * 2.03 + vec2(13.1, 7.7);
    amp *= 0.5;
  }
  return v;
}

// Procedural deep-space starfield with gravitational lensing
vec3 renderStars(vec2 uv) {
  vec2 grid = floor(uv * 28.0);
  vec2 sub = fract(uv * 28.0) - 0.5;
  float h = hash21(grid);
  if (h > 0.93) {
    vec2 offset = vec2(fract(h * 13.7) - 0.5, fract(h * 91.3) - 0.5) * 0.6;
    float d = length(sub - offset);
    float twinkle = 0.75 + 0.25 * sin(u_time * (2.0 + h * 6.0) + h * 100.0);
    float star = smoothstep(0.09, 0.0, d) * twinkle * ((h - 0.93) / 0.07);
    vec3 starCol = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.88, 0.65), fract(h * 47.0));
    return starCol * star * 0.65;
  }
  return vec3(0.0);
}

void main() {
  // Pixel coordinates with y pointing up
  vec2 fragCoord = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);

  // Normalized coordinate relative to Black Hole center, scaled by zoom
  float baseUnit = min(u_resolution.x, u_resolution.y) * 0.42 * u_scale;
  vec2 p = (fragCoord - u_bhCenter) / max(1.0, baseUnit);

  // Subtle spacetime ripple near mouse cursor
  vec2 mouseRel = (fragCoord - u_mouse) / max(1.0, baseUnit);
  float mouseDist = length(mouseRel);
  if (mouseDist < 0.8) {
    float ripple = sin(mouseDist * 28.0 - u_time * 5.0) * exp(-mouseDist * 5.0) * 0.006;
    p += normalize(mouseRel + 0.0001) * ripple;
  }

  // Camera setup looking at the origin (0, 0, 0)
  float camDist = 3.8;
  float tilt = clamp(u_tilt, 0.12, 1.35);
  vec3 ro = vec3(0.0, sin(tilt) * camDist, -cos(tilt) * camDist);

  vec3 forward = normalize(-ro);
  vec3 right = vec3(1.0, 0.0, 0.0);
  vec3 up = cross(right, forward);

  // Slight roll for cinematic framing
  float roll = -0.14;
  float cr = cos(roll), sr = sin(roll);
  vec2 pr = mat2(cr, -sr, sr, cr) * p;

  vec3 rd = normalize(forward * 1.65 + right * pr.x + up * pr.y);

  // Schwarzschild & Accretion parameters
  float rs = 0.24;               // Event horizon radius
  float diskInner = 0.36;        // ISCO (Innermost Stable Circular Orbit)
  float diskOuter = 2.45;        // Outer accretion nebula edge

  vec3 pos = ro;
  vec3 dir = rd;

  vec3 accumColor = vec3(0.0);
  float transmittance = 1.0;
  bool hitHorizon = false;
  float minRadius = 100.0;

  // Geodesic Raymarching (34 steps with adaptive step size)
  for (int i = 0; i < 34; i++) {
    float r = length(pos);
    minRadius = min(minRadius, r);

    if (r < rs) {
      hitHorizon = true;
      break;
    }

    // Relativistic gravitational deflection: F ~ -1.5 * rs * h^2 / r^5
    float r2 = r * r;
    vec3 gravity = -pos * (0.105 / (r2 * r + 0.002));

    // Adaptive step size: finer near the photon sphere & equatorial plane
    float planeDist = abs(pos.y);
    float dt = clamp(r * 0.075, 0.022, 0.22);
    dt = min(dt, max(0.02, planeDist * 0.55));

    vec3 nextPos = pos + dir * dt + 0.5 * gravity * dt * dt;
    dir = normalize(dir + gravity * dt);

    // Check equatorial accretion slab (|y| < diskThickness) or plane crossing
    float diskThickness = 0.055 + 0.04 * smoothstep(diskInner, diskOuter, r);
    if (abs(nextPos.y) < diskThickness || (pos.y * nextPos.y < 0.0)) {
      // Interpolate exact crossing point
      vec3 hitPos = mix(pos, nextPos, 0.5);
      float rad = length(hitPos.xz);

      if (rad > diskInner && rad < diskOuter) {
        // Normalized radial coordinate [0..1]
        float normR = (rad - diskInner) / (diskOuter - diskInner);

        // Differential Keplerian rotation: inner rings spin faster
        float angle = atan(hitPos.z, hitPos.x) + u_rotation;
        float speed = 1.15 / (pow(rad, 0.85) + 0.15);
        float spiralAngle = angle + log(rad * 3.5) * 4.2 - u_time * speed;

        // Multi-scale logarithmic spiral plasma turbulence
        vec2 noiseUV = vec2(spiralAngle * 1.4, rad * 4.5 - u_time * 0.35);
        float turb1 = fbm(noiseUV);
        float turb2 = fbm(vec2(angle * 3.0 - u_time * speed * 0.7, rad * 9.0));
        float rings = 0.65 + 0.35 * sin(rad * 28.0 - turb1 * 5.0 + u_time * 1.2);
        float density = turb1 * 0.65 + turb2 * 0.35;
        density *= rings;

        // Radial & vertical falloff
        float innerFade = smoothstep(diskInner, diskInner + 0.11, rad);
        float outerFade = pow(1.0 - smoothstep(0.15, 1.0, normR), 1.85);
        float vertFade = exp(-abs(hitPos.y) / (diskThickness * 0.48));

        float sampleAlpha = density * innerFade * outerFade * vertFade * 0.52;

        if (sampleAlpha > 0.002) {
          // Relativistic Doppler Beaming (approaching side brighter & warmer/bluer)
          vec3 tangent = normalize(vec3(-hitPos.z, 0.0, hitPos.x));
          float doppler = dot(tangent, -rd); // > 0 when approaching viewer
          float beaming = pow(clamp(1.0 + doppler * 0.48, 0.35, 1.75), 2.4);

          // Temperature color gradient: incandescent core -> gold/accent -> deep cosmic violet/crimson
          vec3 hotCore = vec3(1.0, 0.95, 0.82);
          vec3 midTone = mix(vec3(0.95, 0.65, 0.22), u_accentColor, 0.45);
          vec3 outerCool = mix(vec3(0.45, 0.14, 0.38), u_accentColor * 0.4, 0.5);

          vec3 plasmaCol = mix(hotCore, midTone, smoothstep(0.0, 0.38, normR));
          plasmaCol = mix(plasmaCol, outerCool, smoothstep(0.35, 0.95, normR));

          // Shift hue slightly with Doppler shift
          plasmaCol = mix(plasmaCol * vec3(0.9, 0.6, 0.5), plasmaCol * vec3(1.08, 1.04, 1.15), clamp(doppler * 0.5 + 0.5, 0.0, 1.0));

          vec3 emission = plasmaCol * beaming * (1.6 + (1.0 - normR) * 2.2) * u_intensity;

          accumColor += transmittance * emission * sampleAlpha;
          transmittance *= (1.0 - clamp(sampleAlpha * 0.85, 0.0, 0.92));
          if (transmittance < 0.03) break;
        }
      }
    }

    pos = nextPos;
    if (r > 4.6 && dot(pos, dir) > 0.0) break;
  }

  // Razor-sharp Photon Ring (Einstein ring grazing the horizon)
  float photonRing = exp(-abs(minRadius - (rs * 1.18)) * 36.0);
  float innerGlow = exp(-max(0.0, minRadius - rs) * 7.5);
  vec3 ringColor = mix(vec3(1.0, 0.86, 0.58), u_accentColor, 0.35);
  accumColor += transmittance * ringColor * (photonRing * 1.45 + innerGlow * 0.28) * u_intensity;

  // Deep space background & lensed stars (only for rays that escaped the Event Horizon)
  vec3 bg = vec3(0.024, 0.026, 0.042); // #06070b deep cosmos
  if (!hitHorizon) {
    vec2 lensedUV = dir.xy / (abs(dir.z) + 0.6) + vec2(u_rotation * 0.1, 0.0);
    bg += renderStars(lensedUV) * transmittance;

    // Subtle cosmic nebula glow
    float neb = fbm(lensedUV * 1.8 + vec2(0.0, u_time * 0.02));
    bg += u_accentColor * neb * 0.035 * transmittance;
  } else {
    // Pure pitch-black singularity shadow inside the Event Horizon (behind foreground disk)
    bg = vec3(0.01, 0.01, 0.016) * (1.0 - transmittance);
  }

  vec3 finalColor = bg + accumColor;

  // Cinematic ACES-inspired tone mapping for rich dynamic range without harsh clipping
  finalColor = (finalColor * (2.51 * finalColor + 0.03)) / (finalColor * (2.43 * finalColor + 0.59) + 0.14);

  // Subtle vignette
  vec2 vigUV = v_uv * (1.0 - v_uv.yx);
  float vig = pow(clamp(vigUV.x * vigUV.y * 15.0, 0.0, 1.0), 0.22);
  finalColor *= mix(0.65, 1.0, vig);

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
      // Render shader at slightly scaled internal resolution (0.75x DPR) for silky 60FPS on all GPUs
      const renderScale = Math.min(1.25, dpr * 0.85)
      const targetW = Math.max(1, Math.floor(width * renderScale))
      const targetH = Math.max(1, Math.floor(height * renderScale))

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
