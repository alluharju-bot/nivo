import { useEffect, useState } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import type { CloudController } from '../cloud/useCloud';
import type { LocalSession } from '../storage/projects';
export function CloudProjects({
  cloud,
  onOpen,
}: {
  cloud: CloudController;
  onOpen: (s: LocalSession) => Promise<boolean>;
}) {
  const [email, setEmail] = useState(''),
    [token, setToken] = useState('');
  useEffect(() => {
    if (cloud.user) void cloud.refresh();
  }, [cloud.user?.id]);
  return (
    <section className="cloud-projects" aria-label="Pilvisynkronointi">
      <div className="cloud-heading">
        <Cloud size={18} />
        <strong>Omat projektit pilvessä</strong>
      </div>
      {!cloud.configured ? (
        <p>
          Pilvipalvelua ei ole vielä yhdistetty tähän Nivo-versioon. Paikallinen tallennus toimii
          normaalisti.
        </p>
      ) : !cloud.user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void cloud.signIn(email);
          }}
        >
          <p>Kirjaudu samalla sähköpostilla kaikilla laitteillasi.</p>
          <label>
            Sähköposti
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="button outlined" disabled={cloud.working}>
            Lähetä kirjautumislinkki
          </button>
          <details>
            <summary>Kirjaudu sähköpostin koodilla</summary>
            <label>
              Vahvistuskoodi
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={cloud.working || !token || !email}
              onClick={() => void cloud.verify(email, token)}
            >
              Vahvista
            </button>
          </details>
        </form>
      ) : (
        <>
          <div className="cloud-heading">
            <span>{cloud.user.email}</span>
            <button disabled={cloud.working} onClick={() => void cloud.signOut()}>
              Kirjaudu ulos
            </button>
          </div>
          <div className="cloud-current">
            <strong>Avoin projekti</strong>
            {!cloud.enabled ? (
              <button
                className="button outlined"
                disabled={cloud.working}
                onClick={() => void cloud.enable()}
              >
                Synkronoi tämä projekti
              </button>
            ) : (
              <>
                <p role="status">
                  {cloud.working
                    ? 'Synkronoidaan…'
                    : cloud.result.kind === 'synced'
                      ? 'Tallessa pilvessä'
                      : cloud.result.kind === 'remote'
                        ? 'Pilvessä on uudempi versio.'
                        : cloud.result.kind === 'conflict'
                          ? 'Projektia on muutettu myös toisella laitteella.'
                          : cloud.result.kind === 'missing'
                            ? 'Projektin pilvitallennetta ei löytynyt.'
                            : 'Muutokset tallennetaan automaattisesti.'}
                </p>
                {(cloud.result.kind === 'remote' || cloud.result.kind === 'conflict') && (
                  <button
                    disabled={cloud.working}
                    onClick={() => {
                      if (cloud.result.kind === 'remote' || cloud.result.kind === 'conflict')
                        void cloud.open(cloud.result.head, onOpen);
                    }}
                  >
                    Avaa pilviversio · nykyinen säilyy selaimessa
                  </button>
                )}
                {(cloud.result.kind === 'conflict' || cloud.result.kind === 'missing') && (
                  <button disabled={cloud.working} onClick={() => void cloud.fork(onOpen)}>
                    Säilytä tämäkin versio pilvessä
                  </button>
                )}
                <div className="cloud-heading">
                  <button disabled={cloud.working} onClick={() => void cloud.sync()}>
                    <RefreshCw size={14} /> Synkronoi nyt
                  </button>
                  <button disabled={cloud.working} onClick={() => void cloud.pause()}>
                    Lopeta tämän projektin synkronointi
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="cloud-heading">
            <strong>Pilviprojektit</strong>
            <button disabled={cloud.working} onClick={() => void cloud.refresh()}>
              Päivitä lista
            </button>
          </div>
          {cloud.entries.map((entry) => (
            <div className="cloud-project-row" key={entry.id}>
              <div>
                <strong>{entry.name}</strong>
                <small>
                  {entry.parts} osaa · {new Date(entry.updated_at).toLocaleString('fi-FI')} · v
                  {entry.revision}
                </small>
              </div>
              <button disabled={cloud.working} onClick={() => void cloud.open(entry, onOpen)}>
                Avaa
              </button>
            </div>
          ))}
          {!cloud.entries.length && (
            <p className="muted">Synkronoidut projektit näkyvät täällä kaikilla laitteillasi.</p>
          )}
        </>
      )}
      {cloud.error && <p role="alert">{cloud.error}</p>}
      {cloud.notice && <p role="status">{cloud.notice}</p>}
    </section>
  );
}
