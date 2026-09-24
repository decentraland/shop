import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { config } from '~/config'
import { Icon } from '~/components/Icon'
import { useProfile } from '~/hooks/useProfile'
import { t } from '~/intl/i18n'
import { capitalizeFirst } from '~/lib/text'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { formatPhotoDate } from '~/lib/dates'
import { track } from '~/lib/analytics'
import { jumpIn } from '~/lib/jump'
import { JumpInIcon } from '~/components/Icons/JumpInIcon'
import { fetchLiveScenes, sceneKey } from '~/lib/places'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import type { CatalogItem } from '~/lib/api'
import { fetchItemReel, reelKey, type ReelPhoto } from '~/lib/reel'
import * as S from './PhotoReel.styles'

// A stable empty array, so react-query's `undefined` default does not hand the component a new one on
// every render and restart its effects.
const EMPTY: ReelPhoto[] = []

/** Someone in a photo: whoever is wearing the item, or whoever took it. */
type Person = { address: string; name: string }

/** Their avatar face, falling back to their initial when no face is deployed. */
function Face({ person, size }: { person: Person; size: 'sm' | 'lg' }) {
  const { data } = useProfile(person.address)
  const face = data?.avatar?.snapshots?.face256
  // Some profiles point at a face that 404s — fall back rather than show a broken image.
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [face])
  const name = data?.name ? capitalizeFirst(data.name) : person.name

  return face && !broken ? (
    <S.Face data-size={size} src={face} alt="" loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <S.FaceLetter
      data-size={size}
      // The same colour the in-world client and the navbar give this person (ADR-292).
      style={{
        backgroundColor: getAvatarBackgroundColor(
          getDisplayName({
            name: data?.name ?? person.name,
            hasClaimedName: data?.hasClaimedName,
            ethAddress: person.address
          })
        )
      }}
      aria-hidden
    >
      {(name.trim()[0] || '?').toUpperCase()}
    </S.FaceLetter>
  )
}

/** Their profile name once it resolves, and the name the camera recorded until then. */
function PersonName({ person }: { person: Person }) {
  const { data } = useProfile(person.address)
  return <>{data?.name ? capitalizeFirst(data.name) : person.name}</>
}

// A single photo reads as a stray image rather than a strip, so the section waits for a second one.
const MIN_PHOTOS = 2

/** The item every reel event is about, in the same keys the rest of the funnel uses. */
function reelProps(item: Pick<CatalogItem, 'contractAddress' | 'itemId'>) {
  return { contract_address: item.contractAddress, item_id: item.itemId ?? null }
}

/**
 * Who is wearing the item, and who took the photo. Most of the time they are the same person — the
 * shopper is looking at someone's own picture of their own outfit — and the bar says so once.
 */
function creditsFor(photo: ReelPhoto): { wearer: Person; photographer: Person | null } {
  const photographer: Person = { address: photo.userAddress, name: photo.userName }
  if (!photo.wearerName) return { wearer: photographer, photographer: null }
  return { wearer: { address: photo.wearerAddress, name: photo.wearerName }, photographer }
}

/**
 * Photos taken in world by other people, wearing this item.
 *
 * A shopper looking at a flat render wants to know how it reads on a moving avatar next to other
 * avatars, which is the one thing the 3D preview cannot show.
 *
 * Deliberately NOT the card carousel: these are photographs, so they run edge to edge with no gutters
 * between them, and they are cropped to a portrait frame. The crop is not only styling — a camera reel
 * photo is a 16:9 landscape of a whole scene, and taking the middle of it is what brings the avatar up
 * to a size where the item can be seen at all.
 */
export function PhotoReel({ item }: { item: Pick<CatalogItem, 'contractAddress' | 'itemId'> }) {
  const key = reelKey(item)
  // Nothing is rendered until the answer is in, and nothing is rendered if it is empty: a heading over
  // an empty rail would promise photos that do not exist.
  const { data: photos = EMPTY } = useQuery({
    queryKey: ['item-reel', key],
    queryFn: () => fetchItemReel(item),
    enabled: !!key,
    staleTime: 10 * 60_000,
    // A refetch reorders the set, and doing that under an open photo would swap it for another one.
    refetchOnWindowFocus: false
  })
  const rootRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  // Zoom lives here rather than in the photo because stepping to the next one has to drop it: staying
  // zoomed would land the shopper in the middle of a photo they have not seen whole.
  const [zoom, setZoom] = useState(false)
  const [origin, setOrigin] = useState('50% 50%')
  // Whether the open photo's full-size file has arrived. Until it does the thumbnail stands in for it,
  // so stepping never blanks the frame while a couple of hundred KB come down.
  const [fullSizeReady, setFullSizeReady] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  // Which of these scenes can still be visited. One read for the whole strip, and the link is simply
  // absent while it is in flight — an offer to go somewhere is not worth a loading state.
  const keys = useMemo(() => [...new Set(photos.map(p => sceneKey(p)).filter((k): k is string => !!k))], [photos])
  const { data: live } = useQuery({
    queryKey: ['live-scenes', keys],
    queryFn: () => fetchLiveScenes(keys),
    enabled: keys.length > 0,
    staleTime: 10 * 60_000
  })

  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const { scrollLeft, scrollWidth, clientWidth } = track
    setAtStart(scrollLeft <= 1)
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 1)
  }, [])

  useEffect(() => {
    measure()
    const track = trackRef.current
    if (!track) return
    track.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      track.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [measure, photos.length])

  const step = useCallback(
    (dir: 1 | -1) => {
      setZoom(false)
      setFullSizeReady(false)
      setOpen(o => (o === null ? o : (o + dir + photos.length) % photos.length))
    },
    [photos.length]
  )

  // Where the pointer is, as a percentage of the frame: the zoom grows from the spot that was clicked
  // and follows the pointer, so a shopper can walk over to the avatar instead of dragging the photo.
  function pointTo(e: React.MouseEvent<HTMLImageElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    setOrigin(`${((e.clientX - box.left) / box.width) * 100}% ${((e.clientY - box.top) / box.height) * 100}%`)
  }

  // A set that shrinks under an open photo (a new answer for the same item) leaves nothing to show at
  // that index: close rather than render a lightbox with no photo in it.
  useEffect(() => {
    if (open !== null && open >= photos.length) setOpen(null)
  }, [open, photos.length])

  // The dialog takes focus when it opens, so the keyboard lands inside it instead of on the page behind.
  const isOpen = open !== null
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus()
  }, [isOpen])

  // Both neighbours of the open photo are fetched while it is being looked at, so stepping reads them
  // from the browser's cache instead of paying for a round trip on the click.
  useEffect(() => {
    if (open === null) return

    for (const offset of [1, -1]) {
      const neighbour = photos[(open + offset + photos.length) % photos.length]
      const preload = new Image()
      preload.src = neighbour.url
    }
  }, [open, photos])

  // The open photo owns the arrow keys, so a shopper can walk the whole set without going back to the
  // strip for each one.
  useEffect(() => {
    if (open === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setZoom(false)
        setOpen(null)
      }
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step])

  // Counted once per item, when the strip is actually on screen: it sits below the fold, so a render
  // alone would count every visit to the page.
  const shown = photos.length >= MIN_PHOTOS
  const viewedFor = useRef<string | null>(null)
  useEffect(() => {
    const el = rootRef.current
    if (!shown || !el || !key || viewedFor.current === key || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        io.disconnect()
        viewedFor.current = key
        track('Shop Viewed Photo Reel', { ...reelProps(item), photo_count: photos.length })
      },
      { threshold: 0.5 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown, key, item, photos.length])

  if (!shown) return null

  function openPhoto(index: number) {
    const photo = photos[index]
    const scene = sceneKey(photo)
    setOpen(index)
    track('Shop Opened Reel Photo', {
      ...reelProps(item),
      photo_id: photo.id,
      photo_index: index,
      people: photo.people,
      can_jump_in: !!scene && !!live?.has(scene)
    })
  }

  async function jumpFrom(photo: ReelPhoto, index: number) {
    const outcome = await jumpIn({ position: photo.position, realm: photo.realm })
    track('Shop Jumped In From Reel', {
      ...reelProps(item),
      photo_id: photo.id,
      photo_index: index,
      position: photo.position || null,
      realm: photo.realm || null,
      outcome
    })
  }

  function closeLightbox() {
    setZoom(false)
    setFullSizeReady(false)
    setOpen(null)
  }

  function scrollByDir(dir: 1 | -1) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: dir * track.clientWidth * 0.7, behavior: 'smooth' })
  }

  const current: ReelPhoto | null = open === null ? null : photos[open]
  const credits = creditsFor(current ?? photos[0])
  const currentKey = current ? sceneKey(current) : null
  const currentLive = !!currentKey && !!live?.has(currentKey)

  return (
    <S.Root ref={rootRef} data-testid="photo-reel">
      <S.Head>
        <S.Title>{t('photoReel.title')}</S.Title>
        <S.Sub>{t('photoReel.subtitle')}</S.Sub>
      </S.Head>

      <S.Strip data-photo-strip>
        <S.Track
          ref={trackRef}
          data-testid="photo-reel-track"
          data-at-start={atStart || undefined}
          data-at-end={atEnd || undefined}
        >
          {photos.map((photo, i) => (
            <S.Tile
              key={photo.id}
              data-testid="photo-reel-shot"
              onClick={() => openPhoto(i)}
              aria-label={t('photoReel.openAria', { name: creditsFor(photo).wearer.name, place: photo.place })}
            >
              <S.Thumb src={photo.thumbnailUrl} alt="" loading="lazy" />
              {/* Plain text here: this sits inside the button that opens the photo, and links inside a
                  button are neither valid nor operable. The profile and the place links are in the
                  open photo. */}
              <S.Meta>
                <Face person={creditsFor(photo).wearer} size="sm" />
                <S.Names>
                  <S.Who data-size="sm">
                    <PersonName person={creditsFor(photo).wearer} />
                  </S.Who>
                  <S.Where>
                    {photo.place}
                    {formatPhotoDate(photo.dateTime) ? ` · ${formatPhotoDate(photo.dateTime)}` : ''}
                  </S.Where>
                </S.Names>
              </S.Meta>
            </S.Tile>
          ))}
        </S.Track>

        <S.Nav data-side="left" onClick={() => scrollByDir(-1)} aria-label={t('photoReel.prev')} disabled={atStart}>
          <img src={carouselArrow} alt="" aria-hidden />
        </S.Nav>
        <S.Nav data-side="right" onClick={() => scrollByDir(1)} aria-label={t('photoReel.next')} disabled={atEnd}>
          <img src={carouselArrow} alt="" aria-hidden />
        </S.Nav>
      </S.Strip>

      {current ? (
        <S.Lightbox onClick={closeLightbox} role="presentation" data-testid="photo-reel-lightbox">
          <S.Big
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={t('photoReel.title')}
            onClick={e => e.stopPropagation()}
          >
            <S.BigStage>
              {/* The thumbnail is already in the browser from the strip, so it paints immediately and
                  holds the frame until the full-size file lands on top of it. */}
              <S.BigThumb src={current.thumbnailUrl} alt="" aria-hidden data-hidden={fullSizeReady || undefined} />
              <S.BigImg
                key={current.id}
                src={current.url}
                alt=""
                data-zoom={zoom || undefined}
                data-ready={fullSizeReady || undefined}
                data-testid="photo-reel-image"
                style={{ transformOrigin: origin }}
                title={t(zoom ? 'photoReel.zoomOut' : 'photoReel.zoomIn')}
                onLoad={() => setFullSizeReady(true)}
                onMouseMove={e => zoom && pointTo(e)}
                onClick={e => {
                  pointTo(e)
                  setZoom(z => !z)
                }}
              />
              {photos.length > 1 ? (
                <>
                  <S.BigArrow data-side="left" onClick={() => step(-1)} aria-label={t('photoReel.prev')}>
                    <img src={carouselArrow} alt="" aria-hidden />
                  </S.BigArrow>
                  <S.BigArrow data-side="right" onClick={() => step(1)} aria-label={t('photoReel.next')}>
                    <img src={carouselArrow} alt="" aria-hidden />
                  </S.BigArrow>
                </>
              ) : null}
              <S.Close onClick={closeLightbox} aria-label={t('photoReel.close')} data-testid="photo-reel-close">
                <Icon name="close" size={16} />
              </S.Close>
            </S.BigStage>
            <S.BigBar>
              {/* The outfit is what the shopper came for, so the person wearing it leads and the one who
                  took the photo is a credit beside them — the same person, most of the time. */}
              <S.Credit>
                <S.CreditLink
                  href={`${config.profileUrl}/${credits.wearer.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="photo-reel-profile"
                >
                  <Face person={credits.wearer} size="lg" />
                  <S.CreditText>
                    <S.CreditLabel>{t('photoReel.wornBy')}</S.CreditLabel>
                    <S.CreditName>
                      <PersonName person={credits.wearer} />
                    </S.CreditName>
                  </S.CreditText>
                </S.CreditLink>

                {credits.photographer ? (
                  <S.PhotoBy
                    href={`${config.profileUrl}/${credits.photographer.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="photo-reel-photographer"
                  >
                    <S.CreditLabel>{t('photoReel.photoBy')}</S.CreditLabel>
                    <PersonName person={credits.photographer} />
                  </S.PhotoBy>
                ) : null}
              </S.Credit>

              <S.BigMeta>
                <S.Place>{current.place}</S.Place>
                <S.When>{formatPhotoDate(current.dateTime)}</S.When>
                <S.Counter>
                  {(open ?? 0) + 1}/{photos.length}
                </S.Counter>
                {currentLive ? (
                  <S.JumpIn
                    type="button"
                    onClick={() => void jumpFrom(current, open ?? 0)}
                    aria-label={t('photoReel.jumpIn')}
                    data-testid="photo-reel-jump"
                  >
                    {t('photoReel.jumpInCta')}
                    <JumpInIcon aria-hidden />
                  </S.JumpIn>
                ) : null}
              </S.BigMeta>
            </S.BigBar>
          </S.Big>
        </S.Lightbox>
      ) : null}
    </S.Root>
  )
}
