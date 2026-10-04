import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Eye,
  EyeOff,
  LockKeyhole,
  UnlockKeyhole,
  Trash2,
  FlipHorizontal2,
  ScanLine,
  ImagePlus,
} from 'lucide-react';
import type { CadClient } from '../cad/client';
import type { FaceTarget, SectionResult } from '../cad/protocol';
import { bounds, uid, type Project, type Vec3, type Body } from '../model/project';
import {
  sectionFrame,
  sectionAxis,
  sectionPosition,
  positionSection,
  type Section,
} from '../model/sections';
import {
  calibrateImage,
  referenceImageSchema,
  type ReferenceImage,
} from '../model/referenceImages';
import { sketchFrame } from '../model/sketch';
import { importTexture } from '../storage/textures';
import type { CameraCommand } from '../viewport/types';
import { parseLength } from '../model/units';

export function useWorkspaceViews(
  project: Project,
  bodies: Body[],
  cad: CadClient,
  busy: boolean,
  onCommit: (project: Project, message: string) => Promise<boolean>,
  onError: (message: string) => void,
  onCamera: (command: CameraCommand) => void,
  onDrawing: (sectionId: string) => void,
) {
  const [panel, setPanel] = useState<'section' | 'image'>();
  const [sectionDraft, setSectionDraft] = useState<Section>();
  const [sectionPick, setSectionPick] = useState(false);
  const [calibration, setCalibration] = useState<{ id: string; points: [number, number][] }>();
  const [imageDraft, setImageDraft] = useState<ReferenceImage>();
  const [imageId, setImageId] = useState<string>();
  const [length, setLength] = useState('1000');
  const [result, setResult] = useState<{ key: string; data: SectionResult }>();
  const [capError, setCapError] = useState('');
  const [loading, setLoading] = useState(false);
  const live = useRef(project);
  live.current = project;
  const input = useRef<HTMLInputElement>(null);
  const active = project.sections?.find((s) => s.id === project.settings.activeSectionId);
  const section = sectionDraft?.id === active?.id ? sectionDraft : active;
  const referenceImages = useMemo(
    () => project.referenceImages?.map((i) => (i.id === imageDraft?.id ? imageDraft : i)),
    [project.referenceImages, imageDraft],
  );
  const selectedImage = referenceImages?.find((i) => i.id === imageId) ?? referenceImages?.[0];
  const box = useMemo(() => bounds(bodies), [bodies]);
  const center = box.min.map((n, i) => (n + box.max[i]) / 2) as Vec3;
  const extent = Math.max(100, ...box.max.map((n, i) => n - box.min[i]));
  const geometryKey = useMemo(
    () => JSON.stringify(bodies.map((b) => [b.id, b.feature, b.origin, b.purpose])),
    [bodies],
  );
  const key = section ? JSON.stringify([section.frame, section.flipped, geometryKey]) : '';
  useEffect(() => {
    setSectionDraft(undefined);
    setImageDraft(undefined);
    setSectionPick(false);
    setCalibration(undefined);
  }, [project.id]);
  useEffect(() => {
    let valid = true;
    setCapError('');
    if (!section) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void cad
        .section(bodies, section)
        .then((data) => {
          if (valid) {
            setResult({ key, data });
            setLoading(false);
          }
        })
        .catch((e) => {
          if (valid) {
            setCapError(e.message);
            setLoading(false);
          }
        });
    }, 180);
    return () => {
      valid = false;
      clearTimeout(timer);
    };
  }, [key, cad]);
  const saveSection = async (next: Section) => {
    setSectionDraft(next);
    const p = live.current;
    await onCommit(
      { ...p, sections: (p.sections ?? []).map((s) => (s.id === next.id ? next : s)) },
      'Poikkileikkaus päivitetty.',
    );
    setSectionDraft(undefined);
  };
  const addSection = async (frame = sectionFrame('y', center)) => {
    const p = live.current,
      index = p.sections?.length ?? 0,
      name = String.fromCharCode(65 + (index % 26));
    const next: Section = {
      id: uid(),
      name: `${name}–${name}`,
      frame,
      flipped: false,
      dimensions: [],
    };
    await onCommit(
      {
        ...p,
        sections: [...(p.sections ?? []), next],
        settings: { ...p.settings, activeSectionId: next.id },
      },
      'Poikkileikkaus lisätty.',
    );
  };
  const chooseSection = (id?: string) => {
    setSectionDraft(undefined);
    setSectionPick(false);
    const p = live.current;
    void onCommit(
      { ...p, settings: { ...p.settings, activeSectionId: id } },
      id ? 'Poikkileikkaus käytössä.' : 'Koko malli näkyvissä.',
    );
  };
  const saveImage = async (next: ReferenceImage) => {
    const p = live.current;
    setImageDraft(next);
    await onCommit(
      {
        ...p,
        referenceImages: (p.referenceImages ?? []).map((i) => (i.id === next.id ? next : i)),
      },
      'Pohjakuva päivitetty.',
    );
    setImageDraft(undefined);
  };
  const imageView = (image: ReferenceImage) =>
    onCamera({
      id: performance.now(),
      type: 'frame',
      frame: image.frame,
      width: image.width,
      height: image.height,
    });
  const addImage = async (file: File) => {
    const projectId = live.current.id;
    try {
      const { id, asset } = await importTexture(file);
      if (live.current.id !== projectId) return;
      const image = referenceImageSchema.parse({
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, ''),
        assetId: id,
        frame: sectionFrame('z', [0, 0, 0]),
        width: 6000,
        height: (6000 * asset.height) / asset.width,
      });
      const p = live.current;
      if (
        await onCommit(
          {
            ...p,
            assets: { ...p.assets, [id]: asset },
            referenceImages: [...(p.referenceImages ?? []), image],
          },
          'Pohjakuva lisätty. Määritä mittakaava kahdella pisteellä.',
        )
      ) {
        setImageId(image.id);
        imageView(image);
        setCalibration({ id: image.id, points: [] });
      }
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const open = (value: 'section' | 'image') => {
    setPanel(panel === value ? undefined : value);
    setSectionPick(false);
    setCalibration(undefined);
  };
  const sectionControls = panel === 'section';
  const ui = panel && (
    <aside
      className="workspace-view-panel"
      aria-label={panel === 'section' ? 'Poikkileikkaus' : 'Pohjakuvat'}
    >
      <header>
        <strong>{panel === 'section' ? 'Poikkileikkaus' : 'Pohjakuvat'}</strong>
        <button
          aria-label="Sulje näkymän asetukset"
          onClick={() => {
            setPanel(undefined);
            setSectionPick(false);
            setCalibration(undefined);
          }}
        >
          <X size={17} />
        </button>
      </header>
      {panel === 'section' ? (
        <>
          <label>
            Leikkaus
            <select
              aria-label="Tallennettu leikkaus"
              value={active?.id ?? ''}
              disabled={busy}
              onChange={(e) => chooseSection(e.target.value || undefined)}
            >
              <option value="">Koko malli</option>
              {project.sections?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} onClick={() => void addSection()}>
            <ScanLine size={16} /> Uusi leikkaus
          </button>
          {section && (
            <>
              <label>
                Nimi
                <input
                  key={section.id + section.name}
                  aria-label="Leikkauksen nimi"
                  defaultValue={section.name}
                  maxLength={120}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value.trim() !== section.name)
                      void saveSection({ ...section, name: e.target.value.trim() });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
              <div className="workspace-button-row" aria-label="Leikkaustaso">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <button
                    key={axis}
                    aria-pressed={sectionAxis(section) === ['x', 'y', 'z'].indexOf(axis)}
                    disabled={busy}
                    onClick={() =>
                      void saveSection({
                        ...section,
                        frame: sectionFrame(axis, section.frame.origin),
                      })
                    }
                  >
                    {axis.toUpperCase()}
                  </button>
                ))}
                <button aria-pressed={sectionPick} onClick={() => setSectionPick(!sectionPick)}>
                  Pinnasta
                </button>
              </div>
              <p>
                {sectionPick
                  ? 'Valitse mallista tasainen pinta.'
                  : 'Vedä tason nuolesta tai anna sijainti.'}
              </p>
              <label>
                {sectionAxis(section) === undefined
                  ? 'Etäisyys origosta'
                  : `${['X', 'Y', 'Z'][sectionAxis(section)!]}-sijainti`}{' '}
                · mm
                <input
                  key={section.id + sectionPosition(section).toFixed(4)}
                  aria-label="Leikkaustason sijainti"
                  defaultValue={Number(sectionPosition(section).toFixed(2))}
                  onBlur={(e) => {
                    try {
                      const n = parseLength(e.target.value, true, true);
                      if (n !== sectionPosition(section))
                        void saveSection(positionSection(section, n));
                    } catch (err) {
                      onError((err as Error).message);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
              <input
                aria-label="Siirrä leikkaustasoa"
                type="range"
                min={
                  sectionPosition({ ...section, frame: { ...section.frame, origin: center } }) -
                  extent / 2
                }
                max={
                  sectionPosition({ ...section, frame: { ...section.frame, origin: center } }) +
                  extent / 2
                }
                step={1}
                value={sectionPosition(section)}
                disabled={busy}
                onChange={(e) => setSectionDraft(positionSection(section, Number(e.target.value)))}
                onPointerUp={() => {
                  if (sectionDraft) void saveSection(sectionDraft);
                }}
                onKeyUp={() => {
                  if (sectionDraft) void saveSection(sectionDraft);
                }}
              />
              <button
                disabled={busy}
                onClick={() => void saveSection({ ...section, flipped: !section.flipped })}
              >
                <FlipHorizontal2 size={16} /> Vaihda katselusuunta
              </button>
              <button onClick={() => onDrawing(section.id)}>Avaa leikkaus mittakuvaan</button>
              <div className="workspace-button-row">
                <button disabled={busy} onClick={() => chooseSection()}>
                  Näytä koko malli
                </button>
                <button
                  aria-label="Poista leikkaus"
                  disabled={busy}
                  onClick={() => {
                    const p = live.current;
                    setSectionDraft(undefined);
                    void onCommit(
                      {
                        ...p,
                        sections: p.sections?.filter((s) => s.id !== section.id),
                        settings: { ...p.settings, activeSectionId: undefined },
                      },
                      'Poikkileikkaus poistettu.',
                    );
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {loading && <p role="status">Lasketaan leikkauspintoja…</p>}
              {capError && <p role="alert">{capError} Leikkauspintojen täyttö ei ole valmis.</p>}
            </>
          )}
        </>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void addImage(file);
            }}
          />
          {!calibration && (
            <button disabled={busy} onClick={() => input.current?.click()}>
              <ImagePlus size={16} /> Lisää pohja- tai julkisivukuva
            </button>
          )}
          {selectedImage ? (
            <>
              {calibration?.id !== selectedImage.id && (
                <>
                  <label>
                    Kuva
                    <select
                      aria-label="Valittu pohjakuva"
                      value={selectedImage.id}
                      onChange={(e) => {
                        setImageId(e.target.value);
                        setCalibration(undefined);
                      }}
                    >
                      {referenceImages?.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nimi
                    <input
                      key={selectedImage.id + selectedImage.name}
                      defaultValue={selectedImage.name}
                      maxLength={120}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== selectedImage.name)
                          void saveImage({ ...selectedImage, name: e.target.value.trim() });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  </label>
                  <div className="workspace-button-row">
                    <button onClick={() => imageView(selectedImage)}>Katso kohtisuoraan</button>
                    <button
                      aria-label={selectedImage.hidden ? 'Näytä pohjakuva' : 'Piilota pohjakuva'}
                      disabled={busy}
                      onClick={() =>
                        void saveImage({ ...selectedImage, hidden: !selectedImage.hidden })
                      }
                    >
                      {selectedImage.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      aria-label={selectedImage.locked ? 'Vapauta pohjakuva' : 'Lukitse pohjakuva'}
                      disabled={busy}
                      onClick={() =>
                        void saveImage({ ...selectedImage, locked: !selectedImage.locked })
                      }
                    >
                      {selectedImage.locked ? (
                        <LockKeyhole size={16} />
                      ) : (
                        <UnlockKeyhole size={16} />
                      )}
                    </button>
                  </div>
                  <fieldset disabled={selectedImage.locked || busy}>
                    <label>
                      Kuvan taso
                      <select
                        aria-label="Pohjakuvan taso"
                        value={
                          Math.abs(selectedImage.frame.normal[2]) > 0.9
                            ? 'z'
                            : Math.abs(selectedImage.frame.normal[0]) > 0.9
                              ? 'x'
                              : 'y'
                        }
                        onChange={(e) => {
                          const next = {
                            ...selectedImage,
                            frame: sectionFrame(
                              e.target.value as 'x' | 'y' | 'z',
                              selectedImage.frame.origin,
                            ),
                          };
                          void saveImage(next);
                          imageView(next);
                        }}
                      >
                        <option value="z">Pohjakuva · XY</option>
                        <option value="y">Julkisivu · XZ</option>
                        <option value="x">Pääty · YZ</option>
                      </select>
                    </label>
                    <div className="workspace-coordinate-row">
                      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                        <label key={axis}>
                          {axis} · mm
                          <input
                            key={selectedImage.id + selectedImage.frame.origin[i]}
                            aria-label={`Pohjakuvan ${axis}`}
                            defaultValue={selectedImage.frame.origin[i]}
                            onBlur={(e) => {
                              try {
                                const origin = [...selectedImage.frame.origin] as Vec3;
                                origin[i] = parseLength(e.target.value, true, true);
                                if (origin[i] !== selectedImage.frame.origin[i])
                                  void saveImage({
                                    ...selectedImage,
                                    frame: { ...selectedImage.frame, origin },
                                  });
                              } catch (err) {
                                onError((err as Error).message);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    Näkyvyys · {Math.round(selectedImage.opacity * 100)} %
                    <input
                      aria-label="Pohjakuvan näkyvyys"
                      type="range"
                      min={5}
                      max={100}
                      value={selectedImage.opacity * 100}
                      onChange={(e) =>
                        setImageDraft({ ...selectedImage, opacity: Number(e.target.value) / 100 })
                      }
                      onPointerUp={() => {
                        if (imageDraft) void saveImage(imageDraft);
                      }}
                      onKeyUp={() => {
                        if (imageDraft) void saveImage(imageDraft);
                      }}
                    />
                  </label>
                </>
              )}
              {calibration?.id === selectedImage.id ? (
                <div className="calibration-step">
                  <p>
                    {calibration.points.length < 2
                      ? `Valitse kuvasta ${calibration.points.length === 0 ? 'tunnetun mitan alku' : 'mitan loppu'}.`
                      : 'Anna pisteiden todellinen etäisyys.'}
                  </p>
                  {calibration.points.length === 2 && (
                    <>
                      <label>
                        Tunnettu mitta · mm
                        <input
                          aria-label="Pohjakuvan tunnettu mitta"
                          value={length}
                          onChange={(e) => setLength(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={busy || calibration.points.length !== 2}
                        onClick={() => {
                          try {
                            const next = calibrateImage(
                              selectedImage,
                              calibration.points[0],
                              calibration.points[1],
                              parseLength(length),
                            );
                            void saveImage(next);
                            setCalibration(undefined);
                            imageView(next);
                          } catch (err) {
                            onError((err as Error).message);
                          }
                        }}
                      >
                        Aseta mittakaava
                      </button>
                    </>
                  )}
                  <button onClick={() => setCalibration(undefined)}>Peru kalibrointi</button>
                </div>
              ) : (
                <>
                  <p>
                    {selectedImage.calibrated
                      ? `Mittakaava asetettu${selectedImage.locked ? ' · kuva lukittu' : ''}.`
                      : 'Mittakaavaa ei ole vielä asetettu.'}
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setCalibration({ id: selectedImage.id, points: [] });
                      imageView(selectedImage);
                    }}
                  >
                    Kalibroi kahdella pisteellä
                  </button>
                </>
              )}
              {!calibration && (
                <button
                  disabled={busy}
                  onClick={() => {
                    const p = live.current;
                    void onCommit(
                      {
                        ...p,
                        referenceImages: p.referenceImages?.filter(
                          (i) => i.id !== selectedImage.id,
                        ),
                      },
                      'Pohjakuva poistettu.',
                    );
                    setCalibration(undefined);
                  }}
                >
                  <Trash2 size={16} /> Poista kuva
                </button>
              )}
            </>
          ) : (
            <p>
              Lisää PNG-, JPEG- tai WebP-kuva. Valitse kaksi pistettä ja syötä tunnettu mitta. Voit
              mallintaa kuvan päällä.
            </p>
          )}
        </>
      )}
    </aside>
  );
  return {
    panel,
    open,
    ui,
    section,
    disableSection: () => chooseSection(),
    sectionResult: result?.key === key ? result.data : undefined,
    sectionControls,
    sectionExtent: extent,
    sectionPick,
    referenceImages,
    calibration,
    onWorkspaceCancel: () => {
      setSectionDraft(undefined);
      setSectionPick(false);
      setCalibration(undefined);
    },
    onCalibrationPoint: (point: [number, number]) =>
      setCalibration((c) =>
        c ? { ...c, points: c.points.length >= 2 ? [point] : [...c.points, point] } : c,
      ),
    onSectionPick: (target: FaceTarget) => {
      setSectionPick(false);
      if (section)
        void saveSection({ ...section, frame: sketchFrame(target.point, target.normal) });
    },
    onSectionMove: (next: Section, commit: boolean) => {
      if (commit) void saveSection(next);
      else setSectionDraft(next);
    },
  };
}
