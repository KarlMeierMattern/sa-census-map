import { useEffect, useState } from 'react'

export const HELP_STORAGE_KEY = 'sa-mosaic-help-v1'

export function hasSeenHelp() {
  try {
    return localStorage.getItem(HELP_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markHelpSeen() {
  try {
    localStorage.setItem(HELP_STORAGE_KEY, '1')
  } catch {
    // ignore quota / private mode
  }
}

type QuickHelpProps = {
  open: boolean
  mobile: boolean
  onClose: () => void
}

const DEMO_FILTERS = [
  { id: 'language', label: 'Language mix' },
  { id: 'group', label: 'Population group' },
  { id: 'religion', label: 'Religion' },
] as const

export function QuickHelp({ open, mobile, onClose }: QuickHelpProps) {
  const [step, setStep] = useState(0)
  const [demoFilter, setDemoFilter] = useState<(typeof DEMO_FILTERS)[number]['id']>('language')

  useEffect(() => {
    if (open) {
      setStep(0)
      setDemoFilter('language')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const lastStep = 3

  function finish() {
    markHelpSeen()
    onClose()
  }

  function next() {
    if (step >= lastStep) finish()
    else setStep((current) => current + 1)
  }

  return (
    <>
      <button type="button" className="help-scrim" aria-label="Close quick help" onClick={finish} />
      <div
        className={`help-dialog${mobile ? ' mobile' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        aria-describedby="help-body"
      >
        <button type="button" className="help-close" onClick={finish} aria-label="Close quick help">
          ×
        </button>

        <p className="help-kicker">Quick tour</p>
        <h2 id="help-title" className="help-title">
          {step === 0 && 'A census mosaic of South Africa'}
          {step === 1 && 'Tap anywhere on the map'}
          {step === 2 && 'Pick what you want to see'}
          {step === 3 && 'Zoom changes the detail'}
        </h2>
        <div id="help-body" className="help-body">
          {step === 0 && (
            <p>
              Colours show how people identify across provinces and municipalities — language, population
              group, religion, and more. Data comes from Stats SA census releases (2011 and 2022).
            </p>
          )}
          {step === 1 && (
            <>
              <p>Click or tap a province or municipality to open a side panel with percentages and counts.</p>
              <div className="help-demo-map" aria-hidden="true">
                <span className="help-demo-region help-demo-region-a" />
                <span className="help-demo-region help-demo-region-b" />
                <span className="help-demo-region help-demo-region-c" />
                <span className="help-demo-tap">Tap</span>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <p>
                Use the filters in the main card to change what the map colours represent. Try one here:
              </p>
              <div className="help-demo-filters" role="group" aria-label="Example filters">
                {DEMO_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={demoFilter === item.id ? 'active' : ''}
                    onClick={() => setDemoFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="help-demo-caption">
                {demoFilter === 'language' &&
                  'See which household languages are most common in each area.'}
                {demoFilter === 'group' && 'See population group shares at province level.'}
                {demoFilter === 'religion' && 'See religious affiliation at province level.'}
              </p>
              <p className="help-note">
                Some views (property, education, power, and others) only appear when you zoom in to
                municipalities.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <p>
                At country view you see <strong>provinces</strong>. Zoom in and the map switches to{' '}
                <strong>municipalities</strong> with finer-grained stats.
              </p>
              <div className="help-zoom-ladder" aria-hidden="true">
                <div>
                  <span className="help-zoom-label">Zoomed out</span>
                  <span className="help-zoom-chip">9 provinces</span>
                </div>
                <span className="help-zoom-arrow">↓</span>
                <div>
                  <span className="help-zoom-label">Zoomed in</span>
                  <span className="help-zoom-chip">Municipalities</span>
                </div>
              </div>
              <p className="help-note">
                Search for a town or language in the panel, or pinch to zoom on mobile. You can reopen
                this tour anytime with the <span className="help-inline-icon">?</span> button.
              </p>
            </>
          )}
        </div>

        <div className="help-progress" aria-hidden="true">
          {Array.from({ length: lastStep + 1 }, (_, index) => (
            <span key={index} className={index === step ? 'active' : index < step ? 'done' : ''} />
          ))}
        </div>

        <div className="help-actions">
          {step > 0 ? (
            <button type="button" className="help-back" onClick={() => setStep((current) => current - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className="help-back" onClick={finish}>
              Skip tour
            </button>
          )}
          <button type="button" className="help-next" onClick={next}>
            {step >= lastStep ? 'Start exploring' : 'Next'}
          </button>
        </div>
      </div>
    </>
  )
}

type HelpButtonProps = {
  onClick: () => void
  className?: string
}

export function HelpButton({ onClick, className = '' }: HelpButtonProps) {
  return (
    <button
      type="button"
      className={`help-trigger${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label="Open quick help tour"
      title="Quick help"
    >
      ?
    </button>
  )
}
