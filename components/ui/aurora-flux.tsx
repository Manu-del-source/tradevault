'use client';

import React, { useEffect, useRef } from 'react';

export type AuroraFluxProps = {
  /** Run full-bleed (fills viewport). If false, the canvas just fills its parent. */
  fullScreen?: boolean;
  /** Pause animation when not visible (via page visibility). Default: true */
  pauseWhenHidden?: boolean;
  /** Pause animation while pointer is over the canvas. Default: false */
  pauseOnHover?: boolean;
  /** Initial value for u_mix (kept for parity with original). */
  mix?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Optional aria label for accessibility. */
  ariaLabel?: string;
};

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 vUv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  vUv = a_position * 0.5 + 0.5;
}
`;

const FRAG = `#version 300 es
precision highp float;
uniform vec3 u_resolution;
uniform float u_time;
uniform float u_mix;
out vec4 fragColor;
void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 r = u_resolution.xy;
  vec2 p = (fragCoord + fragCoord - r) / r.y;
  vec2 z = vec2(0.5);
  vec2 i = vec2(0.1);
  vec2 f = p * (z += 5. - 6. * exp(.4 - dot(p, p)));
  vec4 O = vec4(0.0);
  for (i.y = 1.0; i.y <= 8.0; i.y += 1.0) {
    O += (tanh(f) + 1.0).xyyx * abs(f.x - f.y);
    f += tanh(f.yx * i.y + i + u_time) / i.y + 0.7;
  }
  O = tanh(5.0 * exp(z.x - 4.0 - p.y * vec4(-1.0, 1.0, 2.0, 0.0)) / O);
  float mixPhase = dot(p, p) + z.x + u_time + sin(p.x * 1.5 + p.y * 2.5 + u_time * 0.5);
  float channel = cos(mixPhase * 4.0);
  vec3 glow = vec3(
    0.6 + 0.4 * sin(channel + 1.0),
    0.6 + 0.4 * sin(channel + 0.0),
    0.6 + 0.4 * sin(channel + 2.0)
  );
  O.rgb *= glow;
  fragColor = O;
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh) || 'Unknown shader compile error';
    gl.deleteShader(sh);
    throw new Error(info);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog) || 'Unknown program link error';
    gl.deleteProgram(prog);
    throw new Error(info);
  }
  return prog;
}

export default function AuroraFlux({
  fullScreen = true,
  pauseWhenHidden = true,
  pauseOnHover = false,
  mix = 0.5,
  className = '',
  style,
  ariaLabel = 'Aurora flux shader background',
}: AuroraFluxProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const vboRef = useRef<WebGLBuffer | null>(null);
  const rafRef = useRef<number | null>(null);
  const hoverRef = useRef(false);
  const uTimeRef = useRef<WebGLUniformLocation | null>(null);
  const uResRef = useRef<WebGLUniformLocation | null>(null);
  const uMixRef = useRef<WebGLUniformLocation | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) {
      console.error('WebGL2 not supported.');
      return;
    }
    glRef.current = gl;

    const program = createProgram(gl, VERT, FRAG);
    programRef.current = program;
    gl.useProgram(program);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) return;
    vaoRef.current = vao;
    vboRef.current = vbo;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    uTimeRef.current = gl.getUniformLocation(program, 'u_time');
    uResRef.current = gl.getUniformLocation(program, 'u_resolution');
    uMixRef.current = gl.getUniformLocation(program, 'u_mix');
    if (uMixRef.current) gl.uniform1f(uMixRef.current, mix);

    const resize = () => {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const displayW = fullScreen ? window.innerWidth : canvas.clientWidth;
      const displayH = fullScreen ? window.innerHeight : canvas.clientHeight;
      const w = Math.max(1, Math.floor(displayW * dpr));
      const h = Math.max(1, Math.floor(displayH * dpr));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      if (uResRef.current) gl.uniform3f(uResRef.current, w, h, 1);
    };

    const shouldRender = () =>
      !(pauseWhenHidden && document.visibilityState === 'hidden') &&
      !(pauseOnHover && hoverRef.current);

    const loop = (time: number) => {
      if (!shouldRender()) {
        rafRef.current = null;
        return;
      }
      gl.useProgram(program);
      if (uTimeRef.current) gl.uniform1f(uTimeRef.current, time * 0.001);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(loop);
    };

    const onResize = () => resize();
    const onVisibility = () => {
      if (shouldRender() && rafRef.current === null) rafRef.current = requestAnimationFrame(loop);
    };
    const onEnter = () => { hoverRef.current = true; };
    const onLeave = () => {
      hoverRef.current = false;
      if (rafRef.current === null && shouldRender()) rafRef.current = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    if (pauseOnHover) {
      canvas.addEventListener('pointerenter', onEnter);
      canvas.addEventListener('pointerleave', onLeave);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (pauseOnHover) {
        canvas.removeEventListener('pointerenter', onEnter);
        canvas.removeEventListener('pointerleave', onLeave);
      }
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      glRef.current = null;
      programRef.current = null;
      vaoRef.current = null;
      vboRef.current = null;
    };
  }, [fullScreen, pauseWhenHidden, pauseOnHover, mix]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: fullScreen ? 'fixed' : 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: pauseOnHover ? 'auto' : 'none',
        ...style,
      }}
      aria-label={ariaLabel}
      role="img"
    />
  );
}

export { AuroraFlux };
