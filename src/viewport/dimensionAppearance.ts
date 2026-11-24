import { labelInk, labelRadius, type AnnotationPatch } from '../model/annotationStyle';
import { highlightDash } from '../model/highlightStyle';

/** Inline overrides keep custom colours visible while selection still adds weight and an outline. */
export function applyDimensionAppearance(
  annotation: AnnotationPatch,
  line: SVGPathElement,
  extension: SVGPathElement,
  box: SVGRectElement,
  text: SVGTextElement,
  height: number,
) {
  const dash = annotation.lineStyle ? (highlightDash(annotation.lineStyle) ?? 'none') : '';
  for (const path of [line, extension]) {
    path.style.stroke = annotation.lineColor ?? '';
    path.style.strokeDasharray = dash;
  }
  box.style.fill = annotation.labelColor ?? '';
  text.style.fill = annotation.labelColor ? labelInk(annotation.labelColor) : '';
  box.setAttribute('rx', String(labelRadius(annotation.labelShape, height)));
}
