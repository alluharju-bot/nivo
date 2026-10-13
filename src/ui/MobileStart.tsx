import { Maximize, X } from 'lucide-react';
import { useState } from 'react';

export function MobileStart({
  onFullscreen,
  onClose,
  supported,
}: {
  onFullscreen: () => Promise<void>;
  onClose: () => void;
  supported: boolean;
}) {
  const [showAgain, setShowAgain] = useState(localStorage.getItem('nivo-mobile-start') !== 'off');
  return (
    <section className="mobile-start" role="dialog" aria-label="Enemmän tilaa mallille">
      <button className="mobile-start-close" aria-label="Jatka selaimessa" onClick={onClose}>
        <X size={18} />
      </button>
      <Maximize size={22} />
      <strong>Enemmän tilaa mallille</strong>
      <p>
        {supported
          ? 'Aloita koko näytöllä. Yläpalkin samasta painikkeesta pääset takaisin.'
          : 'Lisää Nivo kotinäytölle selaimen Jaa- tai ⋮-valikosta. Silloin se avautuu ilman osoitepalkkia.'}
      </p>
      <label>
        <input
          type="checkbox"
          checked={showAgain}
          onChange={(e) => {
            setShowAgain(e.target.checked);
            localStorage.setItem('nivo-mobile-start', e.target.checked ? 'on' : 'off');
          }}
        />{' '}
        {supported ? 'Tarjoa koko näyttöä avattaessa' : 'Näytä aloitusohje avattaessa'}
      </label>
      <button
        className="button dark"
        onClick={() => {
          if (supported) void onFullscreen();
          onClose();
        }}
      >
        {supported ? 'Aloita koko näytöllä' : 'Jatka mallintamaan'}
      </button>
    </section>
  );
}
