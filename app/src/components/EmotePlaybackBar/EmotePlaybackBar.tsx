import { EmoteControls } from '~/components/LazyEmoteControls'
import * as S from './EmotePlaybackBar.styles'

/**
 * Playback for an emote playing in a preview — play/pause and a scrubber. ui2 provides the controls
 * themselves; this is the shop's bar around them, so an emote looks the same wherever it plays.
 *
 * Anchors itself to the bottom of the nearest positioned ancestor: mount it inside the preview's own
 * container, and only once the preview iframe exists (the ui2 controls bind to it by id and throw if it
 * doesn't).
 */
export function EmotePlaybackBar({
  previewId,
  testId = 'emote-controls'
}: {
  /** The preview iframe's DOM id — what the controls drive. */
  previewId: string
  testId?: string
}) {
  return (
    <S.Bar data-preview-controls data-testid={testId}>
      <EmoteControls wearablePreviewId={previewId} hideFrameInput />
    </S.Bar>
  )
}
