import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import type { Project } from '../model/project';
import { createProjectTransfer, downloadTransfer } from '../storage/projectTransfer';
import { SelectionDialog } from './SelectionDialog';

export function ProjectShare({ project, onClose }: { project: Project; onClose: () => void }) {
  const [file, setFile] = useState<File>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  useEffect(() => {
    let active = true;
    void createProjectTransfer(project)
      .then((f) => {
        if (active) setFile(f);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [project]);
  const canShare = !!file && !!navigator.canShare?.({ files: [file] });
  return (
    <SelectionDialog title="Jatka toisella laitteella" onClose={onClose}>
      <div className="library-heading">
        <strong>{project.name}</strong>
        <button aria-label="Sulje jakaminen" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p className="transfer-help">
        Lähetä projektitiedosto toiselle laitteelle ja avaa se Nivon projektikirjastossa. Kaikki
        mallin osat, mitat ja materiaalit kulkevat mukana.
      </p>
      <p className="transfer-help">
        Siirto tehdään tiedostolla. Muutokset eivät vielä synkronoidu automaattisesti. Jos toisella
        laitteella on eri versio, molemmat säilytetään.
      </p>
      {error && <p role="alert">{error}</p>}
      {!file && !error && <p role="status">Valmistellaan projektitiedostoa…</p>}
      <div className="transfer-actions">
        {canShare && (
          <button
            className="button dark"
            disabled={working}
            onClick={() => {
              setWorking(true);
              // File is prepared before the click; Safari's transient activation stays intact.
              void navigator
                .share({ files: [file!], title: project.name })
                .catch((e: Error) => {
                  if (e.name !== 'AbortError')
                    setError(
                      'Jakaminen ei onnistunut. Voit ladata tiedoston alla olevasta painikkeesta.',
                    );
                })
                .finally(() => setWorking(false));
            }}
          >
            <Share2 size={18} />
            Jaa projektitiedosto
          </button>
        )}
        <button
          className={`button ${canShare ? 'outlined' : 'dark'}`}
          disabled={!file || working}
          onClick={() => downloadTransfer(file!)}
        >
          <Download size={18} />
          Lataa siirtotiedosto
        </button>
      </div>
    </SelectionDialog>
  );
}
