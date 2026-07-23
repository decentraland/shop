import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '~/components/Icon'
import { useWallet } from '~/store/wallet'
import { useStore } from '~/hooks/useStore'
import {
  draftFromStore,
  isValidLink,
  saveStore,
  templateHash,
  LINK_PREFIX,
  LINK_TYPES,
  type LinkType,
  type StoreDraft
} from '~/lib/store'
import { COVER_TEMPLATES } from '~/lib/creator-covers'
import { toast } from '~/store/toast'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import { ErrorNotice } from '~/components/ErrorNotice'
import * as S from './StoreSettings.styles'

const MAX_COVER_BYTES = 1_000_000 // 1 MB, same cap as the classic marketplace.

const EMPTY_DRAFT: StoreDraft = {
  cover: '',
  coverName: '',
  coverHash: '',
  description: '',
  links: { website: '', twitter: '', discord: '', facebook: '' }
}

function mb(bytes: number): string {
  return `${(bytes / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}MB`
}

// The creator store editor (/store-settings). Reachable from the pen on the creator hero; edits the
// cover, description and social links, then deploys the store entity (see lib/store.saveStore). Only
// the signed-in creator edits their OWN store, so everything is scoped to session.address.
export function StoreSettings() {
  useSeo({ title: t('seo.storeSettings.title'), noindex: true })
  const { session, signIn } = useWallet()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const address = session?.address
  const { data: store, isLoading } = useStore(address)

  const [draft, setDraft] = useState<StoreDraft>(EMPTY_DRAFT)
  const [base, setBase] = useState<StoreDraft>(EMPTY_DRAFT)
  const [coverSize, setCoverSize] = useState<number>()
  const [saving, setSaving] = useState(false)
  // The custom (uploaded, non-template) cover, remembered so it stays as a re-selectable tile even
  // after the user clicks a template. Set on upload and when loading a saved store whose cover isn't
  // a template. Its `hash` (when known, from a saved store) lets us keep the tile selected across the
  // template-hash resolution and re-select it precisely.
  const [customCover, setCustomCover] = useState<{ url: string; name: string; hash: string } | null>(null)
  // Content hash of each template (keyed by template name), resolved once. Lets us re-select the
  // template a saved store used: the deploy keeps only the content hash, not the filename, so we
  // match the loaded cover's hash against these instead of comparing file names.
  const [templateHashes, setTemplateHashes] = useState<Record<string, string>>({})
  const fileInput = useRef<HTMLInputElement>(null)

  // Seed the form once the store loads (and whenever it changes underneath us). `base` is the
  // clean baseline we diff against for the dirty check and the Revert button. A loaded cover is
  // remembered as the custom tile too — if it later turns out to be a template (hash match), the
  // reconcile effect below drops it, so it never doubles up.
  useEffect(() => {
    if (store) {
      const seeded = draftFromStore(store)
      setDraft(seeded)
      setBase(seeded)
      setCoverSize(undefined)
      setCustomCover(seeded.cover ? { url: seeded.cover, name: seeded.coverName, hash: seeded.coverHash } : null)
    }
  }, [store])

  // Resolve each template's content hash once so we can tell which template (if any) a saved store's
  // cover is. Runs in the background; until it resolves, a saved template just shows as a custom tile.
  useEffect(() => {
    let cancelled = false
    Promise.all(COVER_TEMPLATES.map(async tpl => [tpl.name, await templateHash(tpl.url)] as const))
      .then(pairs => {
        if (!cancelled) setTemplateHashes(Object.fromEntries(pairs))
      })
      .catch(() => {
        /* hashing failed → templates just won't auto-select; upload/pick still work */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Which template tile is selected: the one just picked this session (coverName matches), or — after
  // a reload — the one whose content hash matches the saved cover's hash.
  const selectedTemplate = useMemo(() => {
    const byName = COVER_TEMPLATES.find(tpl => draft.coverName === `cover/${tpl.name}`)
    if (byName) return byName.name
    const byHash = draft.coverHash
      ? COVER_TEMPLATES.find(tpl => templateHashes[tpl.name] === draft.coverHash)
      : undefined
    return byHash?.name
  }, [draft.coverName, draft.coverHash, templateHashes])

  // A saved cover we optimistically kept as the custom tile might actually be a template. Once the
  // template hashes resolve, drop the custom tile if its hash matches one — otherwise it would show
  // both as the template AND as a custom upload.
  useEffect(() => {
    if (customCover?.hash && COVER_TEMPLATES.some(tpl => templateHashes[tpl.name] === customCover.hash)) {
      setCustomCover(null)
    }
  }, [templateHashes, customCover])

  const oversize = coverSize !== undefined && coverSize > MAX_COVER_BYTES
  const linkErrors = useMemo(() => LINK_TYPES.filter(type => !isValidLink(type, draft.links[type])), [draft.links])
  const hasErrors = oversize || linkErrors.length > 0
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(base), [draft, base])
  const canSave = dirty && !hasErrors && !saving

  // Warn before leaving with unsaved changes (matches the marketplace's beforeunload guard).
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  if (!session) {
    return (
      <S.Root data-signin aria-label={t('storeSettings.title')}>
        <S.Title>{t('storeSettings.title')}</S.Title>
        <p className="muted">{t('storeSettings.signInPrompt')}</p>
        <S.SignInBtn variant="purple" onClick={signIn}>
          {t('storeSettings.signIn')}
        </S.SignInBtn>
      </S.Root>
    )
  }

  function pickTemplate(name: string, url: string) {
    setCoverSize(undefined)
    // coverHash is cleared: selection now matches by coverName until the next save round-trip.
    setDraft(d => ({ ...d, cover: url, coverName: `cover/${name}`, coverHash: '' }))
  }

  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return
    setCoverSize(file.size)
    const name = `cover/${file.name}`
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      // Remember the upload so it stays a re-selectable tile even after picking a template.
      setCustomCover({ url, name, hash: '' })
      setDraft(d => ({ ...d, cover: url, coverName: name, coverHash: '' }))
    }
    reader.readAsDataURL(file)
  }

  // Re-select the remembered custom cover (e.g. after having clicked a template).
  function pickCustom() {
    if (!customCover) return
    setCoverSize(undefined)
    setDraft(d => ({ ...d, cover: customCover.url, coverName: customCover.name, coverHash: customCover.hash }))
  }

  function setLink(type: LinkType, handle: string) {
    // Store the FULL url (prefix + handle), stripping spaces. Empty handle clears the link.
    const value = handle ? (LINK_PREFIX[type] + handle).replace(/\s/g, '') : ''
    setDraft(d => ({ ...d, links: { ...d.links, [type]: value } }))
  }

  // Website is edited as a whole https URL; the socials are edited as bare handles (prefix hidden).
  function linkInputValue(type: LinkType): string {
    const value = draft.links[type]
    return type === 'website' ? value : value.replace(LINK_PREFIX[type], '')
  }

  async function save() {
    if (!address || !session) return
    setSaving(true)
    try {
      await saveStore(address, draft, session.identity)
      // Mark clean before navigating away so the unsaved-changes guard doesn't fire on the redirect.
      setBase(draft)
      setCoverSize(undefined)
      // Refresh the cached store so the creator page shows the new cover/description immediately.
      await qc.invalidateQueries({ queryKey: ['store', address.toLowerCase()] })
      toast.success(t('storeSettings.saved'))
      navigate(`/assets/creator/${address}`)
    } catch {
      toast.error(t('storeSettings.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <S.Root aria-label={t('storeSettings.title')}>
      <S.Head>
        <S.Heading>
          {address ? (
            <S.Back
              to={`/assets/creator/${address}`}
              title={t('storeSettings.back')}
              aria-label={t('storeSettings.back')}
            >
              <Icon name="arrow-left" />
            </S.Back>
          ) : null}
          <S.Title>{t('storeSettings.title')}</S.Title>
        </S.Heading>
        {address ? (
          <S.Guest href={`/assets/creator/${address}`} target="_blank" rel="noopener noreferrer">
            {t('storeSettings.seeAsGuest')}
            <Icon name="external-link" />
          </S.Guest>
        ) : null}
      </S.Head>

      {isLoading ? (
        <S.Loading size="large" label={t('storeSettings.loading')} />
      ) : (
        <>
          <div className="field">
            <span className="field__label">{t('storeSettings.cover')}</span>
            <S.Picker role="group" aria-label={t('storeSettings.cover')}>
              {COVER_TEMPLATES.map(tpl => {
                const selected = selectedTemplate === tpl.name
                return (
                  <S.Tile
                    key={tpl.name}
                    type="button"
                    data-testid="cover-picker-tile"
                    data-selected={selected}
                    aria-pressed={selected}
                    onClick={() => pickTemplate(tpl.name, tpl.url)}
                  >
                    <img src={tpl.url} alt="" loading="lazy" />
                  </S.Tile>
                )
              })}

              {/* The custom (uploaded) cover tile. Stays around once uploaded so it can be re-selected
                  after clicking a template; it's marked selected only while it's the active cover.
                  A saved template is matched above by hash (and dropped from customCover), so it never
                  doubles up here. */}
              {customCover ? (
                <S.Tile
                  type="button"
                  data-testid="cover-picker-tile"
                  data-variant="custom"
                  data-selected={!selectedTemplate}
                  aria-pressed={!selectedTemplate}
                  onClick={pickCustom}
                >
                  <img src={customCover.url} alt="" />
                </S.Tile>
              ) : null}

              <S.Tile
                type="button"
                data-testid="cover-picker-tile"
                data-variant="upload"
                onClick={() => fileInput.current?.click()}
              >
                <Icon name="upload" />
                <span>{t('storeSettings.upload')}</span>
              </S.Tile>
              <S.FileInput
                ref={fileInput}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                data-testid="cover-picker-input"
                onChange={onUpload}
              />
            </S.Picker>
            {oversize ? (
              <ErrorNotice
                message={t('storeSettings.sizeError', { max: mb(MAX_COVER_BYTES), current: mb(coverSize) })}
              />
            ) : null}
          </div>

          <label className="field">
            <span className="field__label">{t('storeSettings.description')}</span>
            <textarea
              value={draft.description}
              rows={4}
              disabled={saving}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            />
          </label>

          <label className="field">
            <span className="field__label">{t('storeSettings.website')}</span>
            <input
              type="url"
              value={draft.links.website}
              placeholder={LINK_PREFIX.website}
              disabled={saving}
              onChange={e =>
                setDraft(d => ({ ...d, links: { ...d.links, website: e.target.value.replace(/\s/g, '') } }))
              }
            />
            {!isValidLink('website', draft.links.website) ? (
              <ErrorNotice message={t('storeSettings.linkError', { value: LINK_PREFIX.website })} />
            ) : null}
          </label>

          {(['twitter', 'discord', 'facebook'] as const).map(type => (
            <label className="field" key={type}>
              <span className="field__label">{t(`storeSettings.${type}`)}</span>
              <S.Prefixed>
                <S.Prefix>{LINK_PREFIX[type]}</S.Prefix>
                <input
                  type="text"
                  value={linkInputValue(type)}
                  disabled={saving}
                  onChange={e => setLink(type, e.target.value)}
                />
              </S.Prefixed>
            </label>
          ))}

          <S.Actions>
            <S.SaveBtn
              variant="purple"
              data-testid="store-settings-save"
              onClick={() => void save()}
              disabled={!canSave}
            >
              {saving ? t('storeSettings.saving') : t('storeSettings.save')}
            </S.SaveBtn>
          </S.Actions>
        </>
      )}
    </S.Root>
  )
}

export default StoreSettings
