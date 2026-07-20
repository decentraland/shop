import defaultCover from '~/assets/creator-covers/default-cover.jpeg'
import { useStore } from '~/hooks/useStore'
import './collection-hero.css'

// The banner at the top of a collection page: the creator's store cover image with the collection
// name centered over it (Figma "COLLECTION NAME"). The cover is the SAME image as the creator's
// storefront hero — it comes from the creator's store entity (useStore), keyed by the collection's
// creator address. Degrades gracefully: no store cover → the bundled default cover; the name is
// always shown (the page resolves it before rendering, falling back to a generic title).
export function CollectionHero({ name, creator }: { name: string; creator?: string }) {
  // useStore short-circuits when address is undefined, so an unknown creator just yields the default
  // cover — no wasted fetch.
  const { data: store } = useStore(creator)
  const cover = store?.cover || defaultCover

  return (
    <section className="collection-hero" data-testid="collection-hero" aria-label={name}>
      <div className="collection-hero__cover">
        <img className="collection-hero__cover-img" src={cover} alt="" loading="eager" />
        <div className="collection-hero__scrim" aria-hidden />
      </div>
      <h1 className="collection-hero__title" data-testid="collection-hero-title">
        {name}
      </h1>
    </section>
  )
}

export default CollectionHero
