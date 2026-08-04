import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '~/components/Button'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { ErrorNotice } from '~/components/ErrorNotice'
import { Icon } from '~/components/Icon'
import { OutfitCard } from '~/components/OutfitCard'
import { OutfitItemPicker } from '~/components/OutfitItemPicker'
import { OutfitPreview } from '~/components/OutfitPreview'
import { invalidateOutfitQueries, useOutfitCreatorAccess, useOutfitItems } from '~/hooks/useOutfits'
import { useSeo } from '~/hooks/useSeo'
import { track } from '~/lib/analytics'
import type { CatalogItem } from '~/lib/api'
import { BASE_FEMALE, BASE_MALE, type BodyShapeUrn } from '~/lib/bodyShape'
import { captureError } from '~/lib/monitoring'
import {
  DEFAULT_OUTFIT_GRADIENT,
  MAX_OUTFIT_ITEMS,
  MIN_OUTFIT_ITEMS,
  MAX_THUMBNAIL_BYTES,
  OutfitsError,
  deleteOutfit,
  fetchAllOutfits,
  fetchOutfit,
  isHexColor,
  outfitErrorKey,
  outfitGradient,
  outfitItemKey,
  outfitRadialGradient,
  parseOutfitImport,
  saveOutfit,
  thumbnailUrl,
  toggleOutfitItem,
  uploadThumbnail,
  type Outfit,
  type OutfitBodyShape,
  type OutfitDraft
} from '~/lib/outfits'
import { isWearable, outfitPreviewUrns, playingEmote } from '~/lib/outfit'
import { t } from '~/intl/i18n'
import { toast } from '~/store/toast'
import { useWallet } from '~/store/wallet'
import * as S from './OutfitStudio.styles'

// The outfit studio: a management list plus a one-page editor, for the addresses in the
// shop-outfit-creators flag variant. The client gate is COSMETIC — shop-server's OUTFIT_CREATORS
// allowlist is what actually refuses writes for everyone else.
export function OutfitStudio() {
  const { id } = useParams<{ id?: string }>()
  const { pathname } = useLocation()
  const session = useWallet(s => s.session)
  const signIn = useWallet(s => s.signIn)
  const access = useOutfitCreatorAccess()
  useSeo({ title: t('outfits.studio.title'), noindex: true })

  const mode = pathname.endsWith('/new') ? 'new' : id ? 'edit' : 'list'

  // Withheld until both the session and the flag have settled: deciding on the first reading is
  // what flashed the sign-in gate, then the not-available gate, on every refresh of the studio.
  if (access === 'pending') {
    return (
      <S.Gate aria-busy="true" data-testid="outfit-studio-loading">
        <span className="spinner" aria-hidden />
      </S.Gate>
    )
  }

  if (!session) {
    return (
      <S.Gate data-testid="outfit-studio-signin">
        <S.GateTitle>{t('outfits.studio.title')}</S.GateTitle>
        <p className="muted">{t('outfits.studio.signInPrompt')}</p>
        <Button variant="purple" onClick={() => signIn()}>
          {t('outfits.studio.signIn')}
        </Button>
      </S.Gate>
    )
  }

  if (access !== 'creator') {
    return (
      <S.Gate data-testid="outfit-studio-unavailable">
        <S.GateTitle>{t('outfits.studio.title')}</S.GateTitle>
        <p className="muted">{t('outfits.studio.notAvailable')}</p>
        <Button as={Link} to="/overview" variant="purple">
          {t('outfits.studio.backToShop')}
        </Button>
      </S.Gate>
    )
  }

  if (mode === 'list') return <StudioList />
  return <StudioEditor key={id ?? 'new'} outfitId={mode === 'edit' ? (id as string) : null} />
}

// A list row's artwork over its gradient, or the empty plate when the draft has none yet. Its own
// component so the URL is derived once and the row body stays a plain expression.
function RowThumb({ outfit }: { outfit: Outfit }) {
  const thumb = thumbnailUrl(outfit.thumbnailHash)
  if (!thumb) return <S.RowThumbEmpty aria-hidden />
  return (
    <S.RowThumb style={{ background: outfitGradient(outfit) }}>
      <img src={thumb} alt="" loading="lazy" />
    </S.RowThumb>
  )
}

function StudioList() {
  const session = useWallet(s => s.session)
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<Outfit | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const {
    data: outfits = [],
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ['outfits-all'],
    enabled: !!session,
    staleTime: 30_000,
    queryFn: () => fetchAllOutfits(session!.identity)
  })

  async function mutate(outfit: Outfit, action: 'unpublish' | 'delete') {
    if (!session) return
    setBusyId(outfit.id)
    try {
      if (action === 'delete') {
        await deleteOutfit(outfit.id, session.identity)
        toast.success(t('outfits.studio.deleted'))
      } else {
        await saveOutfit({ ...toDraft(outfit), published: false }, session.identity, 'update')
        toast.success(t('outfits.studio.unpublished'))
      }
      invalidateOutfitQueries(queryClient)
    } catch (e) {
      if (!(e instanceof OutfitsError)) captureError(e, { flow: `outfit-${action}` })
      toast.error(t(e instanceof OutfitsError ? outfitErrorKey(e.code) : 'outfits.errors.generic'))
    } finally {
      setBusyId(null)
      setConfirming(null)
    }
  }

  return (
    <S.Root data-testid="outfit-studio-list">
      <S.Head>
        <S.Title>{t('outfits.studio.myOutfits')}</S.Title>
        <Button as={Link} to="/outfits/new" variant="purple" data-testid="outfit-studio-new">
          {t('outfits.studio.new')}
        </Button>
      </S.Head>

      {isLoading ? (
        <S.List aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <S.RowSkeleton key={i} className="skeleton" aria-hidden />
          ))}
        </S.List>
      ) : isError ? (
        <S.Gate>
          <ErrorNotice message={t('outfits.errors.generic')} />
          <Button variant="purple" onClick={() => void refetch()}>
            {t('outfits.detail.retry')}
          </Button>
        </S.Gate>
      ) : outfits.length === 0 ? (
        <p className="muted">{t('outfits.studio.empty')}</p>
      ) : (
        <S.List>
          {outfits.map(outfit => (
            <S.Row key={outfit.id} data-testid="outfit-studio-row" data-published={outfit.published || undefined}>
              <RowThumb outfit={outfit} />
              <S.RowInfo>
                <S.RowName>{outfit.name || t('outfits.studio.untitled')}</S.RowName>
                <S.RowMeta>
                  <S.StateChip data-state={outfit.published ? 'published' : 'draft'}>
                    {outfit.published ? t('outfits.studio.publishedState') : t('outfits.studio.draft')}
                  </S.StateChip>
                  {t('outfits.card.items', { count: outfit.items.length })}
                </S.RowMeta>
              </S.RowInfo>
              <S.RowActions>
                {outfit.published ? (
                  <Button as={Link} to={`/items/outfits/${outfit.id}`} variant="ghost" size="sm">
                    {t('outfits.studio.view')}
                  </Button>
                ) : null}
                <Button
                  as={Link}
                  to={`/outfits/${outfit.id}/edit`}
                  variant="outline"
                  size="sm"
                  data-testid="outfit-studio-edit"
                >
                  {t('outfits.studio.edit')}
                </Button>
                <S.RowDelete
                  type="button"
                  data-testid="outfit-studio-delete"
                  aria-label={t('outfits.studio.confirmDelete')}
                  disabled={busyId === outfit.id}
                  onClick={() => setConfirming(outfit)}
                >
                  <Icon name="trash" size={18} />
                </S.RowDelete>
              </S.RowActions>
            </S.Row>
          ))}
        </S.List>
      )}

      {confirming ? (
        <S.ConfirmModal
          role="dialog"
          aria-modal="true"
          aria-label={t('outfits.studio.deleteTitle')}
          data-testid="outfit-studio-confirm"
        >
          <S.ConfirmScrim onClick={() => setConfirming(null)} />
          <S.ConfirmPanel>
            <S.ConfirmTitle>{t('outfits.studio.deleteTitle')}</S.ConfirmTitle>
            <p className="muted">{t('outfits.studio.deleteBody')}</p>
            <S.ConfirmActions>
              {/* Unpublish is the gentler default for a live outfit; delete is the irreversible path. */}
              {confirming.published ? (
                <Button
                  variant="purple"
                  data-testid="outfit-studio-confirm-unpublish"
                  disabled={busyId === confirming.id}
                  onClick={() => void mutate(confirming, 'unpublish')}
                >
                  {t('outfits.studio.unpublish')}
                </Button>
              ) : null}
              <Button
                variant={confirming.published ? 'outline' : 'purple'}
                data-testid="outfit-studio-confirm-delete"
                disabled={busyId === confirming.id}
                onClick={() => void mutate(confirming, 'delete')}
              >
                {t('outfits.studio.confirmDelete')}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                {t('outfits.studio.cancel')}
              </Button>
            </S.ConfirmActions>
          </S.ConfirmPanel>
        </S.ConfirmModal>
      ) : null}
    </S.Root>
  )
}

const THUMB_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function emptyDraft(): OutfitDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    thumbnailHash: '',
    items: [],
    bodyShape: 'unisex',
    // Seeded with the brand gradient rather than blank: the colors are a publish requirement, and a
    // sensible starting pair is friendlier than two empty swatches.
    gradientFrom: DEFAULT_OUTFIT_GRADIENT.from,
    gradientTo: DEFAULT_OUTFIT_GRADIENT.to,
    published: false
  }
}

function toDraft(outfit: Outfit): OutfitDraft {
  return {
    id: outfit.id,
    name: outfit.name,
    thumbnailHash: outfit.thumbnailHash,
    items: outfit.items,
    bodyShape: outfit.bodyShape,
    gradientFrom: outfit.gradientFrom,
    gradientTo: outfit.gradientTo,
    published: outfit.published
  }
}

function readStoredDraft(key: string): OutfitDraft | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as OutfitDraft) : null
  } catch {
    return null
  }
}

function StudioEditor({ outfitId }: { outfitId: string | null }) {
  const isNew = outfitId === null
  const storageKey = `outfit-draft:${outfitId ?? 'new'}`
  const session = useWallet(s => s.session)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Unsaved-work guard: the draft autosaves to sessionStorage on every change and restores here.
  // It only needs to survive full-page teardowns (refresh, the account-switch reload), where
  // React never runs effect cleanups — deliberate in-app navigation unmounts the editor and the
  // cleanup below discards the draft, so coming back starts fresh. beforeunload covers tab-close.
  const [restored] = useState(() => readStoredDraft(storageKey))
  const [draft, setDraft] = useState<OutfitDraft | null>(() => restored ?? (isNew ? emptyDraft() : null))
  const [dirty, setDirty] = useState(!!restored)

  const {
    data: record,
    isLoading: recordLoading,
    isError: recordError,
    refetch
  } = useQuery({
    queryKey: ['outfit', outfitId, true],
    enabled: !isNew && !!session,
    staleTime: 0,
    queryFn: () => fetchOutfit(outfitId as string, session!.identity)
  })

  // Seed from the server unless a restored (newer, unsaved) draft already took the slot.
  useEffect(() => {
    if (!record) return
    setDraft(prev => prev ?? toDraft(record))
  }, [record])

  function update(patch: Partial<OutfitDraft>) {
    setDraft(prev => (prev ? { ...prev, ...patch } : prev))
    setDirty(true)
  }

  useEffect(() => {
    if (!draft || !dirty) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft))
    } catch {
      /* storage full/unavailable — the guard is best-effort */
    }
  }, [draft, dirty, storageKey])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => () => sessionStorage.removeItem(storageKey), [storageKey])

  const resolution = useOutfitItems(draft ?? undefined)
  const selectedKeys = useMemo(() => new Set((draft?.items ?? []).map(outfitItemKey)), [draft])

  // Guarded on the RESULT of the toggle, not on the current count: at capacity, picking an item
  // whose avatar slot is already taken SWAPS rather than grows, and refusing that would make a full
  // outfit unable to change its hat without deleting something first.
  const nextItems = (item: CatalogItem) => toggleOutfitItem(draft?.items ?? [], item, resolution.byKey)
  const canPick = (item: CatalogItem) => !!item.itemId && nextItems(item).length <= MAX_OUTFIT_ITEMS

  function pick(item: CatalogItem) {
    if (!draft || !canPick(item)) return
    update({ items: nextItems(item) })
  }

  // Thumbnail: pre-validate type/size for friendlier errors than the server's, preview through an
  // object URL immediately, and only put the hash on the draft once the upload lands.
  const [thumbLocal, setThumbLocal] = useState<string | null>(null)
  const thumbLocalRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  // Set in the body, not just initialized: StrictMode's mount→cleanup→mount cycle would otherwise
  // leave the ref false forever and silently drop every save's success path in dev.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const [thumbBusy, setThumbBusy] = useState(false)
  const [thumbError, setThumbError] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  // Session-only presentation extras from an imported preview link; never part of the record.
  const [importColors, setImportColors] = useState<{ skin?: string; hair?: string; eyes?: string }>()
  useEffect(
    () => () => {
      if (thumbLocalRef.current) URL.revokeObjectURL(thumbLocalRef.current)
    },
    []
  )

  function applyImport() {
    const parsed = parseOutfitImport(importText)
    if (!parsed) {
      setImportError(t('outfits.studio.importError'))
      return
    }
    setImportError(null)
    setImportText('')
    setImportColors(parsed.colors)
    update({ items: parsed.items, ...(parsed.bodyShape ? { bodyShape: parsed.bodyShape } : {}) })
    toast.success(t('outfits.studio.importSuccess', { count: parsed.items.length }))
  }

  async function onThumbFile(file: File | undefined) {
    if (!file || !session) return
    setThumbError(null)
    if (!THUMB_TYPES.includes(file.type)) {
      setThumbError(t('outfits.errors.unsupportedType'))
      return
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      setThumbError(t('outfits.errors.tooLarge'))
      return
    }
    if (thumbLocalRef.current) URL.revokeObjectURL(thumbLocalRef.current)
    const url = URL.createObjectURL(file)
    thumbLocalRef.current = url
    setThumbLocal(url)
    setThumbBusy(true)
    try {
      const hash = await uploadThumbnail(file, session.identity)
      update({ thumbnailHash: hash })
    } catch (e) {
      if (!(e instanceof OutfitsError)) captureError(e, { flow: 'outfit-thumbnail' })
      setThumbError(t(e instanceof OutfitsError ? outfitErrorKey(e.code) : 'outfits.errors.generic'))
      if (thumbLocalRef.current) {
        URL.revokeObjectURL(thumbLocalRef.current)
        thumbLocalRef.current = null
      }
      setThumbLocal(null)
    } finally {
      setThumbBusy(false)
    }
  }

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const nameValid = !!draft && draft.name.trim().length > 0 && draft.name.length <= 60
  // Mirrors shop-server's isPublishable, gradient stops included (a transparent thumbnail with no
  // backdrop has nothing to sit on).
  const gradientValid = !!draft && isHexColor(draft.gradientFrom) && isHexColor(draft.gradientTo)
  // Client-only rule — the server can't check categories, it has no catalog access: a set of emotes is
  // not a look, so publishing needs at least one wearable. An item that hasn't resolved counts as one,
  // so a catalog outage can never silently block a publish.
  const hasWearable =
    !!draft &&
    draft.items.some(ref => {
      const item = resolution.byKey.get(outfitItemKey(ref))
      return !item || isWearable(item)
    })
  const canPublish =
    !!draft &&
    nameValid &&
    !!draft.thumbnailHash &&
    gradientValid &&
    hasWearable &&
    draft.items.length >= MIN_OUTFIT_ITEMS &&
    draft.items.length <= MAX_OUTFIT_ITEMS

  async function save(published: boolean) {
    if (!session || !draft || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await saveOutfit({ ...draft, published }, session.identity, isNew ? 'create' : 'update')
      if (!mountedRef.current) return
      sessionStorage.removeItem(storageKey)
      setDraft(toDraft(saved))
      setDirty(false)
      invalidateOutfitQueries(queryClient)
      if (published && !draft.published) {
        track('Shop Outfit Published', { outfit_id: saved.id, item_count: saved.items.length })
        toast.success(t('outfits.studio.publishedToast'))
      } else {
        toast.success(t('outfits.studio.saved'))
      }
      if (isNew) {
        // The parent keys StudioEditor on the route id, so leaving /new REMOUNTS the editor against
        // the saved id. Seed its record query with the row we are already holding: without this the
        // fresh mount finds an empty cache, refetches (staleTime 0) and shows the loading gate — a
        // spinner over a record that never left the client.
        queryClient.setQueryData(['outfit', saved.id, true], saved)
        navigate(`/outfits/${saved.id}/edit`, { replace: true })
      }
    } catch (e) {
      // Form state is preserved on ANY failure — a revoked allowlist mid-session must not eat work.
      if (!(e instanceof OutfitsError)) captureError(e, { flow: 'outfit-save' })
      setSaveError(t(e instanceof OutfitsError ? outfitErrorKey(e.code) : 'outfits.errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  const resolvedItems = useMemo(
    () =>
      (draft?.items ?? [])
        .map(ref => resolution.byKey.get(outfitItemKey(ref)))
        .filter((item): item is CatalogItem => !!item),
    [draft, resolution.byKey]
  )
  const urns = useMemo(() => outfitPreviewUrns(resolvedItems), [resolvedItems])
  const playingKey = useMemo(() => {
    const emote = playingEmote(resolvedItems)
    if (!emote?.itemId) return null
    return outfitItemKey({ contractAddress: emote.contractAddress, itemId: emote.itemId })
  }, [resolvedItems])
  const mannequin: BodyShapeUrn | undefined =
    draft?.bodyShape === 'female' ? BASE_FEMALE : draft?.bodyShape === 'male' ? BASE_MALE : undefined

  if (!session) return null

  if (!draft) {
    if (recordError) {
      return (
        <S.Gate>
          <ErrorNotice message={t('outfits.errors.generic')} />
          <Button variant="purple" onClick={() => void refetch()}>
            {t('outfits.detail.retry')}
          </Button>
        </S.Gate>
      )
    }
    if (!recordLoading && record === null) {
      return (
        <S.Gate data-testid="outfit-studio-missing">
          <p className="muted">{t('outfits.errors.notFound')}</p>
          <Button as={Link} to="/outfits/manage" variant="purple">
            {t('outfits.studio.myOutfits')}
          </Button>
        </S.Gate>
      )
    }
    return (
      <S.Gate aria-busy="true">
        <span className="spinner" aria-hidden />
      </S.Gate>
    )
  }

  const thumbSrc = thumbLocal ?? thumbnailUrl(draft.thumbnailHash)

  // The draft dressed as a full record, for the real OutfitCard below.
  const cardPreview: Outfit = { ...draft, authorAddress: session?.address ?? '', createdAt: 0, updatedAt: 0 }
  const totalCredits = draft.items.reduce(
    (sum, ref) => sum + (resolution.byKey.get(outfitItemKey(ref))?.priceCredits ?? 0),
    0
  )

  return (
    <S.Root data-testid="outfit-studio-editor">
      <S.Head>
        <S.Back to="/outfits/manage" aria-label={t('outfits.studio.myOutfits')} data-testid="outfit-studio-back">
          <Icon name="arrow-left" size={18} />
        </S.Back>
        <S.Title>{isNew ? t('outfits.studio.new') : t('outfits.studio.editTitle')}</S.Title>
        <S.StateChip data-state={draft.published ? 'published' : 'draft'}>
          {draft.published ? t('outfits.studio.publishedState') : t('outfits.studio.draft')}
        </S.StateChip>
      </S.Head>

      <S.Grid>
        <S.Side>
          {/* Live backdrop behind the mannequin — the same radial glow the detail page composites
              the look over, from the two colors the creator is choosing. */}
          <S.PreviewBox data-testid="outfit-studio-preview" style={{ background: outfitRadialGradient(draft) }}>
            <OutfitPreview
              id="outfit-studio-preview-frame"
              profile="default"
              bodyShape={mannequin}
              urns={urns}
              skin={importColors?.skin}
              hair={importColors?.hair}
              eyes={importColors?.eyes}
              enabled={!resolution.isLoading}
            />
            {urns.length === 0 && !resolution.isLoading ? (
              <S.PreviewEmpty className="muted">{t('outfits.studio.previewEmpty')}</S.PreviewEmpty>
            ) : null}
          </S.PreviewBox>

          <S.Field>
            <S.Label as="span">{t('outfits.studio.bodyShape')}</S.Label>
            <S.Shapes role="group" aria-label={t('outfits.studio.bodyShape')}>
              {(['unisex', 'male', 'female'] as OutfitBodyShape[]).map(shape => (
                <S.ShapeBtn
                  key={shape}
                  type="button"
                  data-selected={draft.bodyShape === shape || undefined}
                  onClick={() => update({ bodyShape: shape })}
                >
                  {t(`outfits.studio.shape.${shape}`)}
                </S.ShapeBtn>
              ))}
            </S.Shapes>
          </S.Field>

          <S.Field>
            <S.Label as="span">{t('outfits.studio.gradient')}</S.Label>
            <S.Gradient>
              {(['gradientFrom', 'gradientTo'] as const).map(field => (
                <S.ColorField key={field}>
                  <S.ColorInput
                    type="color"
                    value={isHexColor(draft[field]) ? draft[field] : DEFAULT_OUTFIT_GRADIENT.from}
                    aria-label={t(
                      field === 'gradientFrom' ? 'outfits.studio.gradientTop' : 'outfits.studio.gradientBottom'
                    )}
                    data-testid={field === 'gradientFrom' ? 'outfit-studio-gradient-from' : 'outfit-studio-gradient-to'}
                    onChange={e => update({ [field]: e.target.value.toLowerCase() })}
                  />
                  <S.ColorMeta>
                    <span>
                      {t(field === 'gradientFrom' ? 'outfits.studio.gradientTop' : 'outfits.studio.gradientBottom')}
                    </span>
                    {/* Hex text entry so a creator can paste an exact brand color, not just eyeball
                        the OS picker. Kept in sync with the swatch above (same draft field). */}
                    <S.HexInput
                      value={draft[field]}
                      maxLength={7}
                      spellCheck={false}
                      placeholder="#000000"
                      aria-label={t(
                        field === 'gradientFrom' ? 'outfits.studio.gradientTopHex' : 'outfits.studio.gradientBottomHex'
                      )}
                      data-invalid={!isHexColor(draft[field]) || undefined}
                      onChange={e => {
                        const next = e.target.value.trim().toLowerCase()
                        update({ [field]: next.startsWith('#') || next === '' ? next : `#${next}` })
                      }}
                    />
                  </S.ColorMeta>
                </S.ColorField>
              ))}
            </S.Gradient>
            <p className="muted small">{t('outfits.studio.gradientHint')}</p>
          </S.Field>

          <S.Field>
            <S.Label as="span">{t('outfits.studio.thumbnail')}</S.Label>
            {thumbSrc ? (
              <S.ThumbPreview data-busy={thumbBusy || undefined}>
                <img src={thumbSrc} alt="" />
              </S.ThumbPreview>
            ) : null}
            <S.UploadBtn as="label" variant="outline" size="sm" data-busy={thumbBusy || undefined}>
              {thumbBusy ? t('outfits.studio.uploading') : t('outfits.studio.upload')}
              <input
                type="file"
                accept={THUMB_TYPES.join(',')}
                hidden
                disabled={thumbBusy}
                onChange={e => void onThumbFile(e.target.files?.[0])}
                data-testid="outfit-studio-thumb-input"
              />
            </S.UploadBtn>
            <p className="muted small">{t('outfits.studio.thumbnailHint')}</p>
            <ErrorNotice message={thumbError} testId="outfit-studio-thumb-error" />
          </S.Field>

          {/* The REAL published card — same component, hover animations included, with the live
              total. Clicks are disarmed in capture (nothing to navigate to or add while drafting). */}
          <S.Field>
            <S.Label as="span">{t('outfits.studio.cardPreview')}</S.Label>
            <S.CardPreview
              data-testid="outfit-studio-card-preview"
              onClickCapture={e => {
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              <OutfitCard outfit={cardPreview} resolution={resolution} />
            </S.CardPreview>
          </S.Field>
        </S.Side>

        <S.Form>
          {/* Paste the avatar editor's preview link: its collections-v2 urns become the outfit's
              items, the base-avatar urn picks the body shape, and the skin/hair/eye colors dress the
              mannequin for this session (the record stores no colors). */}
          <S.Field>
            <S.Label htmlFor="outfit-import">{t('outfits.studio.import')}</S.Label>
            <S.ImportRow>
              <S.NameInput
                id="outfit-import"
                value={importText}
                spellCheck={false}
                placeholder={t('outfits.studio.importPlaceholder')}
                onChange={e => setImportText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') applyImport()
                }}
                data-testid="outfit-studio-import"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={applyImport}
                disabled={importText.trim() === ''}
                data-testid="outfit-studio-import-apply"
              >
                {t('outfits.studio.importApply')}
              </Button>
            </S.ImportRow>
            <p className="muted small">{t('outfits.studio.importHint')}</p>
            <ErrorNotice message={importError} testId="outfit-studio-import-error" />
          </S.Field>

          <S.Field>
            <S.Label htmlFor="outfit-name">{t('outfits.studio.name')}</S.Label>
            <S.NameInput
              id="outfit-name"
              value={draft.name}
              maxLength={60}
              placeholder={t('outfits.studio.namePlaceholder')}
              onChange={e => update({ name: e.target.value })}
              data-testid="outfit-studio-name"
            />
          </S.Field>

          <S.Field>
            <S.Label as="span">
              {t('outfits.studio.items')} ({draft.items.length}/{MAX_OUTFIT_ITEMS})
            </S.Label>
            {draft.items.length === 0 ? (
              <p className="muted small">{t('outfits.studio.noItems')}</p>
            ) : (
              <S.Selected>
                {draft.items.map(ref => {
                  const key = outfitItemKey(ref)
                  const item = resolution.byKey.get(key)
                  return (
                    <S.SelectedRow key={key} data-testid="outfit-studio-selected" data-missing={!item || undefined}>
                      {item ? (
                        <S.SelThumb src={item.thumbnail} alt="" />
                      ) : (
                        <S.SelThumbEmpty className={resolution.isLoading ? 'skeleton' : undefined} aria-hidden />
                      )}
                      <S.SelName className={item ? undefined : 'muted'}>
                        {item ? item.name : resolution.isLoading ? '…' : t('outfits.card.unavailable')}
                      </S.SelName>
                      {key === playingKey ? (
                        <S.SelHint data-testid="outfit-studio-plays-in-preview">
                          {t('outfits.studio.playsInPreview')}
                        </S.SelHint>
                      ) : null}
                      {item ? (
                        <S.SelPrice>
                          <CurrencyIcon size={12} />
                          {item.priceCredits.toLocaleString()}
                        </S.SelPrice>
                      ) : null}
                      <S.SelRemove
                        type="button"
                        aria-label={t('outfits.studio.remove')}
                        title={t('outfits.studio.remove')}
                        onClick={() => update({ items: draft.items.filter(r => outfitItemKey(r) !== key) })}
                      >
                        <Icon name="trash" size={16} />
                      </S.SelRemove>
                    </S.SelectedRow>
                  )
                })}
              </S.Selected>
            )}
            {draft.items.length > 0 ? (
              <S.SelTotal data-testid="outfit-studio-total">
                <span>{t('outfits.detail.totalPrice')}</span>
                <S.SelTotalValue>
                  <CurrencyIcon size={14} />
                  {totalCredits.toLocaleString()}
                </S.SelTotalValue>
              </S.SelTotal>
            ) : null}
            {draft.items.length >= MAX_OUTFIT_ITEMS ? (
              <p className="muted small">{t('outfits.studio.maxItems')}</p>
            ) : null}
          </S.Field>

          <OutfitItemPicker selectedKeys={selectedKeys} onPick={pick} canPick={canPick} />
        </S.Form>
      </S.Grid>

      <S.SaveBar data-testid="outfit-studio-savebar">
        <ErrorNotice message={saveError} testId="outfit-studio-save-error" />
        {!nameValid ? (
          <p className="muted small">{t('outfits.studio.needName')}</p>
        ) : !canPublish && !draft.published ? (
          <p className="muted small" data-testid="outfit-studio-publish-hint">
            {/* The wearable rule is ours alone, so name it — "not publishable" would read as a bug. */}
            {!hasWearable && draft.items.length > 0
              ? t('outfits.studio.needsWearable')
              : t('outfits.errors.notPublishable')}
          </p>
        ) : null}
        <S.SaveActions>
          <Button
            variant="outline"
            data-testid="outfit-studio-save"
            disabled={saving || !nameValid}
            onClick={() => void save(draft.published)}
          >
            {saving ? t('outfits.studio.saving') : t('outfits.studio.saveDraft')}
          </Button>
          {draft.published ? (
            <Button
              variant="purple"
              data-testid="outfit-studio-unpublish"
              disabled={saving}
              onClick={() => void save(false)}
            >
              {t('outfits.studio.unpublish')}
            </Button>
          ) : (
            <Button
              variant="purple"
              data-testid="outfit-studio-publish"
              disabled={saving || !canPublish}
              onClick={() => void save(true)}
            >
              {t('outfits.studio.publish')}
            </Button>
          )}
        </S.SaveActions>
      </S.SaveBar>
    </S.Root>
  )
}

export default OutfitStudio
