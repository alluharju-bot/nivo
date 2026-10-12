import { test, expect } from '@playwright/test';
import { fireflyGLSL } from '../src/render/traceFireflies';

test('GPU sample limiter removes indirect spikes, preserves direct emitters and rejects invalid radiance', async ({
  page,
}) => {
  await page.goto('about:blank');
  const result = await page.evaluate((helper) => {
    const canvas = document.createElement('canvas');
    canvas.width = 6;
    canvas.height = 1;
    const gl = canvas.getContext('webgl2')!;
    if (!gl?.getExtension('EXT_color_buffer_float')) throw new Error('Float rendering unavailable');
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader)!);
      return shader;
    };
    const vertex = compile(
      gl.VERTEX_SHADER,
      `#version 300 es
      void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`,
    );
    const fragment = compile(
      gl.FRAGMENT_SHADER,
      `#version 300 es
      precision highp float;
      out vec4 color;
      ${helper}
      void main() {
        vec3 direct = vec3(0.0), indirect = vec3(0.0);
        int pixel = int(gl_FragCoord.x);
        if (pixel == 0) nivoAddRadiance(direct, indirect, vec3(1000000.0,500000.0,100000.0), true);
        if (pixel == 1) nivoAddRadiance(direct, indirect, vec3(1000000.0,500000.0,100000.0), false);
        if (pixel == 2) nivoAddRadiance(direct, indirect, vec3(0.2,0.3,0.4), false);
        if (pixel == 3) {
          nivoAddRadiance(direct, indirect, vec3(1000.0,500.0,100.0), false);
          nivoAddRadiance(direct, indirect, vec3(1000.0,500.0,100.0), false);
        }
        if (pixel == 4) {
          nivoAddRadiance(direct, indirect, vec3(uintBitsToFloat(0x7fc00000u)), false);
          nivoAddRadiance(direct, indirect, vec3(uintBitsToFloat(0x7f800000u)), true);
          nivoAddRadiance(direct, indirect, vec3(0.2,0.3,0.4), false);
        }
        if (pixel == 5) {
          nivoAddRadiance(direct, indirect, vec3(1000.0,500.0,100.0), true);
          nivoAddRadiance(direct, indirect, vec3(1000.0,500.0,100.0), false);
        }
        color = vec4(direct + nivoLimitIndirect(indirect), 1.0);
      }`,
    );
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program)!);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 6, 1);
    const target = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('Incomplete target');
    gl.useProgram(program);
    gl.viewport(0, 0, 6, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Float32Array(24);
    gl.readPixels(0, 0, 6, 1, gl.RGBA, gl.FLOAT, pixels);
    const error = gl.getError();
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.deleteFramebuffer(target);
    gl.deleteTexture(texture);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { pixels: Array.from(pixels), error };
  }, fireflyGLSL);
  expect(result.error).toBe(0);
  const expected = [
    [1e6, 5e5, 1e5, 1],
    [10, 5, 1, 1],
    [0.2, 0.3, 0.4, 1],
    [10, 5, 1, 1],
    [0.2, 0.3, 0.4, 1],
    [1010, 505, 101, 1],
  ].flat();
  result.pixels.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 3));
});
