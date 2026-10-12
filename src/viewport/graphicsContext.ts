import * as THREE from 'three';

export const contextLostMessage =
  'Yhteys näytönohjaimeen katkesi. Malli on edelleen tallessa. Odotetaan grafiikan palautumista; voit myös yrittää uudelleen. Jos näkymä ei palaudu, sulje selain kokonaan ja avaa se uudelleen.';

export function createRenderer(options: THREE.WebGLRendererParameters) {
  try {
    return new THREE.WebGLRenderer(options);
  } catch (cause) {
    throw new Error(
      '3D-näkymän grafiikkaa ei voitu käynnistää. Jos näkymä toimi aiemmin, sulje selain kokonaan ja avaa se uudelleen. Muussa tapauksessa tarkista selaimen WebGL2-tuki ja laitteistokiihdytys.',
      { cause },
    );
  }
}

export function watchGraphicsContext(
  canvas: HTMLCanvasElement,
  lost: () => void,
  restored: () => void,
) {
  const onLost = (event: Event) => {
    event.preventDefault(); // Allow the browser to restore the context.
    lost();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}
