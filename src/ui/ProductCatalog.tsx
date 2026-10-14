import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Box,
  ExternalLink,
  FileInput,
  Lightbulb,
  Plug,
  Search,
  ShowerHead,
  SlidersHorizontal,
} from 'lucide-react';
import type { CadClient } from '../cad/client';
import type { Project } from '../model/project';
import {
  catalogCheckedAt,
  productCatalog,
  productCategories,
  searchProducts,
  type CatalogProduct,
} from '../model/productCatalog';
import { importedProductProject, installationProject } from '../model/productLibrary';
import { saveLocal } from '../storage/projects';
import { ImportDialog } from './ExchangeDialogs';

const icons = {
  power: Plug,
  lighting: Lightbulb,
  hardware: SlidersHorizontal,
  taps: ShowerHead,
  sanitary: Box,
};
const brands = [...new Set(productCatalog.map((p) => p.brand))].sort((a, b) =>
  a.localeCompare(b, 'fi'),
);

export function ProductCatalog({
  cad,
  onAdd,
  onWorkingChange,
}: {
  cad: CadClient;
  onAdd: (project: Project, place?: boolean) => Promise<boolean>;
  onWorkingChange: (working: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [selected, setSelected] = useState<CatalogProduct>();
  const [variantIndex, setVariantIndex] = useState(0);
  const [article, setArticle] = useState('');
  const [savePart, setSavePart] = useState(true);
  const [files, setFiles] = useState<File[]>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (selected ? backButton.current : searchInput.current)?.focus({ preventScroll: true });
  }, [selected]);
  const running = useRef(false);
  const products = searchProducts(query, category, brand);
  const variant =
    selected?.variants?.[variantIndex] ??
    (article.trim() ? { name: article.trim(), article: article.trim() } : undefined);
  const select = (product: CatalogProduct) => {
    setSelected(product);
    setVariantIndex(0);
    setArticle('');
    setError('');
  };
  const add = async (mode: 'space' | 'opening') => {
    if (!selected || running.current) return;
    running.current = true;
    setWorking(true);
    onWorkingChange(true);
    setError('');
    try {
      if (!(await onAdd(installationProject(selected, mode, variant), true)))
        throw new Error(
          'Osaa ei voitu lisätä malliin. Tarkista projektin ilmoitus ja yritä uudelleen.',
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setWorking(false);
      onWorkingChange(false);
    }
  };
  const closeImport = () => {
    setFiles(undefined);
    onWorkingChange(false);
  };
  const Icon = selected ? icons[selected.category] : Box;
  return (
    <div className="product-catalog">
      {!selected ? (
        <>
          <div className="product-search">
            <label className="product-query">
              <Search size={17} />
              <input
                ref={searchInput}
                aria-label="Hae tuotteita"
                placeholder="Tuote, valmistaja tai tuotekoodi"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Tuoteryhmä"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Kaikki tuoteryhmät</option>
              {Object.entries(productCategories).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Valmistaja"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="">Kaikki valmistajat</option>
              {brands.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="product-catalog-summary">
            <span role="status">{products.length} tuotetta ja tuoteperhettä</span>
            <span>Valmistajien aineistot · omat 3D-mallit</span>
          </div>
          <div className="product-grid">
            {products.map((p) => {
              const ItemIcon = icons[p.category];
              return (
                <button
                  className="product-card"
                  key={p.key}
                  onClick={() => select(p)}
                  aria-label={`Avaa tuote ${p.brand} ${p.name}`}
                >
                  <span className="product-symbol">
                    <ItemIcon size={25} strokeWidth={1.5} />
                  </span>
                  <span className="product-card-text">
                    <small>{p.brand}</small>
                    <strong>{p.name}</strong>
                    <span>{p.summary}</span>
                  </span>
                  <span className="product-badge">
                    {p.installation ? 'Asennusmitat' : p.variants ? 'Tuote' : 'Tuoteperhe'}
                  </span>
                </button>
              );
            })}
            {!products.length && (
              <div className="product-empty">
                <p>Hakua vastaavia tuotteita ei löytynyt.</p>
                <button
                  onClick={() => {
                    setQuery('');
                    setBrand('');
                    setCategory('');
                  }}
                >
                  Tyhjennä haku ja rajaukset
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <button
            ref={backButton}
            className="product-back"
            disabled={working}
            onClick={() => setSelected(undefined)}
          >
            <ArrowLeft size={16} /> Takaisin tuotteisiin
          </button>
          <div className="product-detail">
            <div className="product-identity">
              <span className="product-symbol">
                <Icon size={34} strokeWidth={1.4} />
              </span>
              <div>
                <small>
                  {selected.brand} · {productCategories[selected.category]}
                </small>
                <h3>{selected.name}</h3>
                <p>{selected.summary}</p>
              </div>
            </div>
            <div className="product-detail-columns">
              <div>
                {selected.variants ? (
                  <label className="product-field">
                    Tuoteversio
                    <select
                      aria-label="Tuoteversio"
                      disabled={working}
                      value={variantIndex}
                      onChange={(e) => setVariantIndex(Number(e.target.value))}
                    >
                      {selected.variants.map((v, i) => (
                        <option key={v.article} value={i}>
                          {v.name} · {v.article}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="product-field">
                    Tuotekoodi <small>(valinnainen)</small>
                    <input
                      aria-label="Tuotekoodi"
                      maxLength={100}
                      placeholder="Valmistajan tarkka tuotekoodi"
                      value={article}
                      disabled={working}
                      onChange={(e) => setArticle(e.target.value)}
                    />
                  </label>
                )}
                {selected.specs && (
                  <dl className="product-specs">
                    {selected.specs.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="product-sources">
                  <a href={selected.source} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={14} /> Tuotetiedot ja lataukset
                  </a>
                  {selected.cad && selected.cad.url !== selected.source && (
                    <a href={selected.cad.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} /> {selected.cad.label}
                    </a>
                  )}
                  <small>
                    Lähde: {selected.region} · tarkistettu{' '}
                    {catalogCheckedAt.split('-').reverse().join('.')}
                  </small>
                  {selected.region !== 'FI' && (
                    <small>Suomen tuoteversio ja saatavuus tarkistetaan toimittajalta.</small>
                  )}
                </div>
              </div>
              <div className="product-model-actions">
                {selected.installation && (
                  <section className="product-installation">
                    <h4>Suunnittele asennuspaikka</h4>
                    <InstallationDrawing product={selected} />
                    <p>{selected.installation.note}</p>
                    <div className="dialog-actions">
                      {!!selected.installation.depth && (
                        <button
                          className="button dark"
                          disabled={working}
                          onClick={() => void add('space')}
                        >
                          Lisää upotustila
                        </button>
                      )}
                      <button disabled={working} onClick={() => void add('opening')}>
                        Lisää aukkoluonnos
                      </button>
                    </div>
                    <small>
                      Mittamalli asetteluun. Aukkoluonnosta voi käyttää Cutin leikkurina.
                    </small>
                  </section>
                )}
                <section className="product-import">
                  <h4>Tuotteen 3D-malli</h4>
                  <p>
                    Lataa haluamasi versio valmistajalta ja tuo tiedosto tähän. Tuotetiedot kulkevat
                    mallin mukana.
                  </p>
                  <button
                    className={`button ${selected.installation ? '' : 'dark'}`}
                    disabled={working}
                    onClick={() => fileInput.current?.click()}
                  >
                    <FileInput size={16} /> Tuo tuotteen 3D-tiedosto
                  </button>
                  <small>
                    STEP/STP, GLB/glTF tai STL. Revit-, DWG- ja IFC-tiedostot tarvitsevat
                    muunnoksen.
                  </small>
                  <label className="product-save">
                    <input
                      type="checkbox"
                      checked={savePart}
                      onChange={(e) => setSavePart(e.target.checked)}
                    />{' '}
                    Tallenna myös Omiin osiin
                  </label>
                </section>
              </div>
            </div>
            <p className="product-rights">
              Valmistajan mallit haetaan sen omasta palvelusta käyttöehtoineen. Kirjaston mukana ei
              jaeta valmistajien CAD-tiedostoja.
            </p>
          </div>
        </>
      )}
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        data-testid="catalog-file"
        accept=".step,.stp,.stl,.glb,.gltf,.bin,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = '';
          setError('');
          if (!picked.length) return;
          if (!picked.some((f) => /\.(step|stp|stl|glb|gltf)$/i.test(f.name))) {
            setError('Valitse STEP-, GLB-, glTF- tai STL-malli.');
            return;
          }
          setFiles(picked);
          onWorkingChange(true);
        }}
      />
      {files &&
        selected &&
        createPortal(
          <ImportDialog
            files={files}
            mode="add"
            cad={cad}
            initialPlace
            title={`Tuo tuote · ${selected.name}`}
            description="Tarkista tiedoston mittayksikkö ja tuoteversio. Valmistajan nimi ja tuotekoodi tallentuvat osan tietoihin."
            onClose={closeImport}
            onAccept={async (incoming, place) => {
              const product = importedProductProject(incoming, selected, variant);
              if (savePart) await saveLocal(product, undefined, { kind: 'part', activate: false });
              if (!(await onAdd(product, place)))
                throw new Error(
                  'Osaa ei voitu lisätä malliin. Tarkista projektin ilmoitus ja yritä uudelleen.',
                );
              return true;
            }}
          />,
          document.body,
        )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function InstallationDrawing({ product }: { product: CatalogProduct }) {
  const p = product.installation!.profile;
  const width = p.kind === 'circle' ? p.diameter : p.width;
  const depth = p.kind === 'circle' ? p.diameter : p.depth;
  const scale = 130 / Math.max(width, depth),
    w = width * scale,
    h = depth * scale;
  return (
    <svg
      className="product-installation-drawing"
      viewBox="0 0 260 175"
      role="img"
      aria-label={`Asennusaukko ${p.kind === 'circle' ? `halkaisija ${width}` : `${width} × ${depth}`} mm`}
    >
      {p.kind === 'circle' ? (
        <circle cx="130" cy="77" r={w / 2} />
      ) : (
        <rect x={130 - w / 2} y={77 - h / 2} width={w} height={h} />
      )}
      <path d="M118 77h24 M130 65v24" className="product-center" />
      <text x="130" y="165" textAnchor="middle">
        {p.kind === 'circle' ? `Ø ${width}` : `${width} × ${depth}`} mm
      </text>
    </svg>
  );
}
