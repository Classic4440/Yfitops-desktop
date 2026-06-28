import React, { useEffect, useState } from 'react';

const api = window.api;

const STEP_LABELS = ['Name', 'Proxy', 'Identity', 'Review'];

const emptyForm = {
  name: '',
  proxyId: '',
  seed: '',
  resolution: '',
  language: '',
  timezone: '',
  userAgent: '',
  startUrl: '',
};

// Quick-create wizard (Name -> Proxy -> Seed/identity -> Review/Launch).
// In edit mode it collapses into a single review form.
export default function ProfileWizard({ proxies, editing, notify, onClose, onSaved }) {
  const isEdit = Boolean(editing);
  const [step, setStep] = useState(isEdit ? 3 : 0);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      setForm({ ...emptyForm, ...editing, proxyId: editing.proxyId || '' });
    } else {
      // Pre-generate a seed for new profiles.
      api.profiles.generateSeed().then((seed) => setForm((f) => ({ ...f, seed })));
    }
  }, [isEdit, editing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const regenSeed = async () => {
    const seed = await api.profiles.generateSeed();
    setForm((f) => ({ ...f, seed }));
  };

  // Live emulation preview is computed by the main process from the current seed.
  useEffect(() => {
    let active = true;
    if (!form.seed) return;
    api.profiles
      .emulation({
        seed: form.seed,
        resolution: form.resolution,
        language: form.language,
        timezone: form.timezone,
        userAgent: form.userAgent,
      })
      .then((emu) => {
        if (active) setPreview(emu);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [form.seed, form.resolution, form.language, form.timezone, form.userAgent]);

  const canNext = () => {
    if (step === 0) return form.name.trim().length > 0;
    return true;
  };

  const save = async (launchAfter) => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        proxyId: form.proxyId || null,
        seed: form.seed,
        resolution: form.resolution || undefined,
        language: form.language || undefined,
        timezone: form.timezone || undefined,
        userAgent: form.userAgent || undefined,
        startUrl: form.startUrl || undefined,
      };
      let profile;
      if (isEdit) {
        profile = await api.profiles.update(editing.id, payload);
        notify('Profile updated', 'success');
      } else {
        profile = await api.profiles.create(payload);
        notify(`Profile "${profile.name}" created`, 'success');
      }
      if (launchAfter) {
        await api.profiles.launch(profile.id);
        notify(`Launched "${profile.name}"`, 'success');
      }
      await onSaved();
    } catch (err) {
      notify(err.message || String(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Edit Profile' : 'New Profile'}</h2>
        <p className="subtitle">
          {isEdit
            ? 'Update this profile’s proxy and emulation settings.'
            : 'Create an isolated testing environment in a few steps.'}
        </p>

        {!isEdit && (
          <>
            <div className="steps">
              {STEP_LABELS.map((_, i) => (
                <div key={i} className={`step ${i <= step ? 'active' : ''}`} />
              ))}
            </div>
            <div className="step-label">
              Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}
            </div>
          </>
        )}

        {/* Step 0: Name */}
        {(!isEdit ? step === 0 : false) && (
          <div className="field">
            <label>Profile name</label>
            <input
              autoFocus
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. US Desktop Tester"
            />
          </div>
        )}

        {/* Step 1: Proxy */}
        {(!isEdit ? step === 1 : false) && (
          <div className="field">
            <label>Assigned proxy</label>
            <select value={form.proxyId} onChange={set('proxyId')}>
              <option value="">No proxy (direct connection)</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.type}
                </option>
              ))}
            </select>
            {proxies.length === 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                No proxies yet. Add some in the Proxies tab, or continue without one.
              </p>
            )}
          </div>
        )}

        {/* Step 2: Identity (seed) */}
        {(!isEdit ? step === 2 : false) && (
          <div className="field">
            <label>Seed (deterministic identity)</label>
            <div className="row">
              <input value={form.seed} onChange={set('seed')} className="mono" />
              <button className="btn" type="button" onClick={regenSeed} style={{ flex: '0 0 auto' }}>
                ↻ Regenerate
              </button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              The same seed always produces the same emulation values.
            </p>
          </div>
        )}

        {/* Step 3 / edit: Full review + overrides */}
        {(isEdit || step === 3) && (
          <>
            {isEdit && (
              <div className="field">
                <label>Profile name</label>
                <input value={form.name} onChange={set('name')} />
              </div>
            )}
            {isEdit && (
              <div className="field">
                <label>Assigned proxy</label>
                <select value={form.proxyId} onChange={set('proxyId')}>
                  <option value="">No proxy (direct connection)</option>
                  {proxies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {p.type}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {isEdit && (
              <div className="field">
                <label>Seed</label>
                <div className="row">
                  <input value={form.seed} onChange={set('seed')} className="mono" />
                  <button
                    className="btn"
                    type="button"
                    onClick={regenSeed}
                    style={{ flex: '0 0 auto' }}
                  >
                    ↻
                  </button>
                </div>
              </div>
            )}

            <div className="field">
              <label>Optional overrides (leave blank to use seed-derived values)</label>
              <div className="row">
                <input
                  value={form.resolution}
                  onChange={set('resolution')}
                  placeholder="Resolution e.g. 1920x1080"
                />
                <input
                  value={form.language}
                  onChange={set('language')}
                  placeholder="Language e.g. en-US"
                />
              </div>
            </div>
            <div className="field">
              <div className="row">
                <input
                  value={form.timezone}
                  onChange={set('timezone')}
                  placeholder="Timezone e.g. Europe/London"
                />
                <input
                  value={form.startUrl}
                  onChange={set('startUrl')}
                  placeholder="Start URL (optional)"
                />
              </div>
            </div>
            <div className="field">
              <label>User agent override (optional)</label>
              <input value={form.userAgent} onChange={set('userAgent')} className="mono" />
            </div>

            {preview && (
              <div className="card" style={{ background: 'var(--bg)' }}>
                <div className="card-meta">
                  <strong>Effective emulation preview</strong>
                  <br />
                  Screen: <code>{preview.screen.width}×{preview.screen.height}</code> · Lang:{' '}
                  <code>{preview.language}</code> · TZ: <code>{preview.timezone}</code>
                  <br />
                  Cores: <code>{preview.hardwareConcurrency}</code> · Memory:{' '}
                  <code>{preview.deviceMemory}GB</code>
                  <br />
                  UA: <code style={{ wordBreak: 'break-all' }}>{preview.userAgent}</code>
                </div>
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {!isEdit && step > 0 && (
            <button className="btn" onClick={() => setStep((s) => s - 1)} disabled={saving}>
              Back
            </button>
          )}
          {!isEdit && step < 3 && (
            <button className="btn primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
              Next
            </button>
          )}
          {(isEdit || step === 3) && (
            <>
              <button className="btn" onClick={() => save(false)} disabled={saving}>
                {saving ? <span className="spinner" /> : isEdit ? 'Save' : 'Create'}
              </button>
              {!isEdit && (
                <button className="btn primary" onClick={() => save(true)} disabled={saving}>
                  Create & Launch
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
