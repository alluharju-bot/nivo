/** GLSL pow(x, y) is undefined for negative x, even for integer y. Clearcoat
 * calls Fresnel with eta=1.5, giving x=-0.2. Metal returns NaN and blackens
 * the whole accumulated pixel; software GL happened to accept it. Keep the
 * exact Fresnel equation, using multiplication rather than undefined pow. */
export function stableTraceNumerics(shader: string) {
  const marker = 'return pow( ( 1.0 - eta ) / ( 1.0 + eta ), 2.0 );';
  if (shader.split(marker).length !== 2)
    throw new Error('Renderöinnin pintalaskennan versio ei vastaa sovellusta.');
  return shader.replace(
    marker,
    'float ratio = ( 1.0 - eta ) / ( 1.0 + eta ); return ratio * ratio;',
  );
}
