import { useId, useState } from 'react'
import { Icon } from '~/components/Icon'
import { t } from '~/intl/i18n'
import * as S from './Faq.styles'

/**
 * The "Learn More About Credits" accordion. Both the migration tool and the credits page render this;
 * only the skin differs (see Faq.styles).
 *
 * Rows open INDEPENDENTLY rather than one-at-a-time. Nothing in the design says which, and independent is
 * the forgiving reading: someone comparing two answers ("do I receive Credits?" against "can I change the
 * price later?") does not have their first answer yanked away by opening the second. It also matches the
 * project's existing collapsible (CategoryFilter), where clicking an open header is what closes it.
 *
 * The questions and answers arrive as i18n KEYS, not text: the copy belongs to the locale files, and each
 * page owns its own list, so this component never has to know which FAQ it is showing.
 */
export type FaqEntry = {
  /** i18n key for the question — the visible label of the toggle. */
  question: string
  /** i18n key for the answer. Each newline in the string starts a new PARAGRAPH (see S.Answer). */
  answer: string
}

export function Faq({
  title,
  entries,
  tone = 'light',
  className
}: {
  /** i18n key for the section heading. */
  title: string
  entries: readonly FaqEntry[]
  /** 'on-dark' is the outlined skin the credits hero backdrop needs. */
  tone?: 'light' | 'on-dark'
  className?: string
}) {
  // A row is open when its key is in the set. The set (not an index) so the list can be reordered or
  // extended without silently opening a different question.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const baseId = useId()

  function toggle(key: string) {
    setOpen(current => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  return (
    <S.Root className={className} data-tone={tone} data-testid="faq">
      <S.Title data-testid="faq-title">{t(title)}</S.Title>
      <S.List>
        {entries.map(entry => {
          const isOpen = open.has(entry.question)
          const panelId = `${baseId}-panel-${entry.question}`
          const headerId = `${baseId}-header-${entry.question}`
          return (
            <S.Item key={entry.question} data-open={isOpen} data-testid="faq-item">
              <S.Header
                type="button"
                onClick={() => toggle(entry.question)}
                id={headerId}
                aria-expanded={isOpen}
                /* Only while the panel exists: the answer is unmounted when closed, and aria-controls
                   pointing at an absent id is a dangling reference. aria-expanded alone carries the state. */
                aria-controls={isOpen ? panelId : undefined}
                data-open={isOpen}
                data-testid="faq-question"
              >
                <S.Question>{t(entry.question)}</S.Question>
                {/* Decorative: the button already announces its own state through aria-expanded, so a
                    labelled icon would have the screen reader say it twice. */}
                <S.Chevron data-open={isOpen} aria-hidden>
                  <Icon name="chevron-up-line" size={36} />
                </S.Chevron>
              </S.Header>
              {/* Unmounted while closed rather than hidden: an answer that stays in the DOM is still found
                  by in-page search and read by a screen reader walking the page, which makes a collapsed
                  FAQ a wall of text to anyone not using the toggles. */}
              {isOpen && (
                /* The question names the region: a role="region" with no accessible name is skipped as a
                   landmark, so the answer would not be reachable by landmark navigation. */
                <S.Answer id={panelId} role="region" aria-labelledby={headerId} data-testid="faq-answer">
                  {/* One paragraph per authored line, so consecutive sentences get real space between
                      them instead of sitting on stacked lines. Splitting on the newline rather than on
                      "." keeps the copy one translatable string and can't mis-split an abbreviation or
                      a price. */}
                  {t(entry.answer)
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean)
                    .map(line => (
                      <p key={line}>{line}</p>
                    ))}
                </S.Answer>
              )}
            </S.Item>
          )
        })}
      </S.List>
    </S.Root>
  )
}
