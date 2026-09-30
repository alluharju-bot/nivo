import { useEffect, useMemo, useState } from 'react';
import type { CadClient } from '../cad/client';
import type { DrawingView, Projection } from '../cad/protocol';
import type { Project } from '../model/project';
import { createSheet, type Sheet } from './svg';

export function DrawingPanel({
  project,
  cad,
  view,
  scale,
  hidden,
  onSheet,
}: {
  project: Project;
  cad: CadClient;
  view: DrawingView;
  scale: number;
  hidden: boolean;
  onSheet: (sheet?: Sheet) => void;
}) {
  const [projection, setProjection] = useState<Projection>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setProjection(undefined);
    setError('');
    void cad
      .project(project.bodies, view)
      .then((result) => {
        if (active) setProjection(result);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [project.bodies, cad, view]);
  const sheet = useMemo(
    () => (projection ? createSheet(project, projection, view, scale, hidden) : undefined),
    [projection, project, view, scale, hidden],
  );
  useEffect(() => onSheet(sheet), [sheet, onSheet]);
  return (
    <div className="drawing-area" data-testid="drawing-area">
      {error ? (
        <div role="alert" className="drawing-message">
          {error}
        </div>
      ) : !sheet ? (
        <div className="drawing-message">Muodostetaan mittakuvaa…</div>
      ) : (
        <>
          {!sheet.fits && (
            <div role="alert" className="drawing-warning">
              Malli ei mahdu arkille. Valitse pienempi mittakaava.
            </div>
          )}
          {sheet.orphanCount > 0 && (
            <div role="alert" className="drawing-warning">
              {sheet.orphanCount} mittaviitettä puuttuu. Poista rikkoutuneet mitat tai palauta
              kappale.
            </div>
          )}
          <div className="drawing-paper" dangerouslySetInnerHTML={{ __html: sheet.svg }} />
        </>
      )}
    </div>
  );
}
