import { useEffect, useRef } from 'react'

import { Answer } from './Answer'
import { Prose } from './Prose'
import type { LessonView } from '../main/study'
import type { Resource } from '../shared/format'

/**
 * A Lesson. Prose, with the fixed block set in the order the Constructor wrote it.
 *
 * Nothing here is recorded. A Try answers in place and produces no Attempt, and the page
 * earns its tick when the user reaches the end of it.
 */
export function Lesson({
  slug,
  lesson,
  resources,
  moduleTitle,
  onReachedEnd,
}: {
  slug: string
  lesson: LessonView
  resources: Record<string, Resource>
  moduleTitle: string
  onReachedEnd: () => void
}): React.JSX.Element {
  const end = useRef<HTMLDivElement>(null)
  const reported = useRef<string>('')

  useEffect(() => {
    const target = end.current
    if (!target) return
    const observer = new IntersectionObserver((entries) => {
      // Reaching the end of the Lesson is the whole condition. It fires once per Lesson,
      // and the main process ignores it if the user has ticked or unticked this page
      // themselves, so it can never overrule a deliberate choice.
      if (entries.some((entry) => entry.isIntersecting) && reported.current !== lesson.id) {
        reported.current = lesson.id
        onReachedEnd()
      }
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [lesson.id, onReachedEnd])

  return (
    <>
      <div className="head">
        <div>
          <h1 className="title">{lesson.title}</h1>
          <p className="sub">
            {moduleTitle}
            {lesson.minutes === undefined ? '' : ` / ${lesson.minutes} min`}
          </p>
        </div>
      </div>

      {lesson.blocks.map((block, index) => {
        switch (block.block) {
          case 'prose':
            return <Prose key={index} markdown={block.markdown} />

          case 'callout':
            return (
              <div key={index} className="pull">
                <b>{block.kind}.</b> {block.markdown}
              </div>
            )

          case 'diagram':
            return (
              <figure key={index} className="figure">
                <img src={`whetstone-course://${slug}/${block.src}`} alt={block.alt} />
                {block.alt !== '' && <figcaption>{block.alt}</figcaption>}
              </figure>
            )

          case 'try':
            return (
              <div key={index} className="panel">
                <div className="prow">
                  <span className="ptype">Try it</span>
                </div>
                <p className="q">{block.question.prompt}</p>
                <Answer
                  question={block.question}
                  send={(given) => window.whetstone.tries.answer(slug, lesson.id, block.question.id, given)}
                />
              </div>
            )

          case 'app':
            return (
              <div key={index} className="panel later">
                <span className="ptype">Activity</span>
                <p>“{block.id}” is an interactive activity, which arrives with the next release.</p>
              </div>
            )

          case 'resource': {
            const resource = resources[block.id]
            if (!resource) return null
            return (
              <a key={index} className="res" href={resource.url} target="_blank" rel="noreferrer">
                <span className="ptype">{resource.type}</span>
                <b>{resource.title}</b>
                <span>{resource.why}</span>
              </a>
            )
          }
        }
      })}

      <div className="lend" ref={end}>
        End of lesson
      </div>
    </>
  )
}
