import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageScroll } from '@/app/AppShell';
import { useSettings } from '@/app/providers/SettingsProvider';
import { useRepositories } from '@/app/providers/RepositoryProvider';
import { APP_CONFIG } from '@/config/app-config';
import { APP_FLAGS } from '@/features/content/ContentProvider';
import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import { resetScope } from '@/services/storage/corrupted-store-recovery';
import { getDatabase } from '@/services/storage/db';
import { PrivateThreeDSection } from './PrivateThreeDSection';

/**
 * Settings and About.
 *
 * Sound defaults to off because audio must never be required to learn. The
 * timed challenge is off by default and clearly labelled as speed practice.
 * Installation guidance is plain text — there is no fake install prompt, because
 * Safari does not offer the universal install prompt other browsers do.
 */
export default function SettingsView() {
  const { settings, update, reset } = useSettings();
  const { repositories, storageUnavailable } = useRepositories();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <PageScroll>
      <div className="stack stack--loose" style={{ maxWidth: '48rem' }}>
        <div className="stack stack--tight">
          <h1>Settings and about</h1>
          <p className="prose">Everything here is stored on this device only.</p>
        </div>

        <section className="surface stack" aria-labelledby="display-heading">
          <h2 id="display-heading">Display and input</h2>

          <div className="switch-row">
            <div className="switch-row__text">
              <p className="switch-row__title">Reduce motion</p>
              <p className="switch-row__description">
                Removes viewport animation when zooming to a structure. Your device setting is
                always respected regardless of this.
              </p>
            </div>
            <Switch
              checked={settings.reduce_motion}
              label="Reduce motion"
              onChange={(value) => void update({ reduce_motion: value })}
            />
          </div>

          <div className="switch-row">
            <div className="switch-row__text">
              <p className="switch-row__title">Apple Pencil precision</p>
              <p className="switch-row__description">
                Drops the forgiving tap margin for Pencil input, so a precise tap lands exactly where
                you put it.
              </p>
            </div>
            <Switch
              checked={settings.pencil_precision_mode}
              label="Apple Pencil precision"
              onChange={(value) => void update({ pencil_precision_mode: value })}
            />
          </div>

          <div className="switch-row">
            <div className="switch-row__text">
              <p className="switch-row__title">Show labels in Explore</p>
              <p className="switch-row__description">
                Region labels are always hidden during a quiz.
              </p>
            </div>
            <Switch
              checked={settings.labels_visible_explore}
              label="Show labels in Explore"
              onChange={(value) => void update({ labels_visible_explore: value })}
            />
          </div>
        </section>

        <section className="surface stack" aria-labelledby="practice-heading">
          <h2 id="practice-heading">Practice</h2>

          <div className="switch-row">
            <div className="switch-row__text">
              <p className="switch-row__title">Sound</p>
              <p className="switch-row__description">
                Off by default. Every part of Muscle Atlas works fully without sound.
              </p>
            </div>
            <Switch
              checked={settings.sound_enabled}
              label="Sound"
              onChange={(value) => void update({ sound_enabled: value })}
            />
          </div>

          <div className="switch-row">
            <div className="switch-row__text">
              <p className="switch-row__title">Timed challenge (speed practice)</p>
              <p className="switch-row__description">
                Optional. A timer measures speed, not learning, and running out of time records a
                skip rather than a wrong answer. Leave this off unless you want it.
              </p>
            </div>
            <Switch
              checked={settings.timed_challenge_enabled}
              label="Timed challenge"
              onChange={(value) => void update({ timed_challenge_enabled: value })}
            />
          </div>

          <div className="switch-row">
            <div className="switch-row__text">
              <p className="switch-row__title">Scheduled review</p>
              <p className="switch-row__description">
                When on, missed and hinted structures come back sooner than ones recalled unaided.
              </p>
            </div>
            <Switch
              checked={settings.scheduled_review_enabled}
              label="Scheduled review"
              onChange={(value) => void update({ scheduled_review_enabled: value })}
            />
          </div>
        </section>

        <section className="surface stack" aria-labelledby="install-heading">
          <h2 id="install-heading">Installing on iPad</h2>
          <p className="prose">{APP_CONFIG.installInstructions}</p>
          <p className="prose" style={{ fontSize: '0.875rem' }}>
            Installation is entirely optional. Everything works in an ordinary browser tab, and
            there is no install prompt because Safari does not provide the kind other browsers do.
          </p>
          <p className="prose" style={{ fontSize: '0.875rem' }}>
            Once opened at least once while online, the app shell and the current content pack are
            cached and the app works with no connection.
          </p>
        </section>

        <section className="surface stack" aria-labelledby="data-heading">
          <h2 id="data-heading">Stored data</h2>
          <p className="prose">
            Progress, round history, settings and the record of downloaded content. No personal
            identity data is collected, because there are no accounts.
          </p>
          {storageUnavailable ? (
            <p className="notice notice--warning" role="status">
              Local storage is unavailable in this browsing mode, so nothing will persist after you
              close the tab.
            </p>
          ) : null}
          {notice === null ? null : <p className="notice notice--info">{notice}</p>}

          <div className="choice-group">
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('Reset all settings to their defaults?')) {
                  void reset().then(() => setNotice('Settings reset to defaults.'));
                }
              }}
            >
              <Icon name="reset" size={18} />
              <span>Reset settings</span>
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (
                  window.confirm(
                    'Erase ALL local Muscle Atlas data, including learning progress? This cannot be undone.',
                  )
                ) {
                  void resetScope(getDatabase(), 'all').then(() =>
                    setNotice('All local data erased.'),
                  );
                }
              }}
            >
              Erase everything
            </Button>
          </div>
          <p className="muted" style={{ fontSize: '0.875rem' }}>
            {repositories.sessions.storageProblem === null
              ? 'Round history is stored locally.'
              : 'Round history cannot be stored in this browsing mode.'}
          </p>
        </section>

        {APP_FLAGS.ENABLE_DEBUG_TOOLS ? (
          <section className="surface stack" aria-labelledby="developer-heading">
            <h2 id="developer-heading">Developer</h2>
            <p className="prose">
              Content validation, storage inspection and hit-region tools. Available in
              development builds only, and stripped from release bundles.
            </p>
            <p>
              <Link className="btn btn--secondary" to="/settings/developer">
                Open developer tools
              </Link>
            </p>
          </section>
        ) : null}

        <PrivateThreeDSection />

        <section className="surface stack" aria-labelledby="about-heading">
          <h2 id="about-heading">About</h2>
          <p className="prose">{APP_CONFIG.disclaimer}</p>
          <p>
            <Link className="btn btn--secondary" to="/settings/credits">
              Credits, licences and content status
            </Link>
          </p>
        </section>
      </div>
    </PageScroll>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="btn btn--secondary btn--small"
      style={{ minWidth: '5.5rem' }}
      onClick={() => onChange(!checked)}
    >
      {checked ? 'On' : 'Off'}
    </button>
  );
}
