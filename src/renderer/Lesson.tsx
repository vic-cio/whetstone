import { useEffect, useRef } from 'react'

import { Answer } from './Answer'
import { MiniApp } from './MiniApp'
import { Prose, Run } from './Prose'
import { parseInline } from '../shared/markdown'
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
              // The text goes through the inline parser like any other prose. It was
              // dropped in raw before, so a callout could hold neither bold nor code nor a
              // link, and maths is what finally made that visible.
              <div key={index} className="pull">
                <b>{block.kind}.</b> <Run inline={parseInline(block.markdown)} />
              </div>
            )

          case 'diagram':
            return (
              <figure key={index} className="figure">
                <img src={`whetstone-course://${slug}/${block.src}`} alt={block.alt} />
                {block.alt !== '' && (
                  <figcaption>
                    <Run inline={parseInline(block.alt)} />
                  </figcaption>
                )}
              </figure>
            )

          case 'try':
            return (
              <div key={index} className="panel">
                <div className="prow">
                  <span className="ptype">Try it</span>
                </div>
                {/*
                  Course text is prose everywhere it appears, and a Try's prompt is Course
                  text. It was the one prompt in the app that skipped the parser, so a Try
                  could hold neither code nor bold nor maths while the Task beside it could.
                */}
                <p className="q"><Run inline={parseInline(block.question.prompt)} /></p>
                <Answer
                  question={block.question}
                  slug={slug}
                  send={(given) => window.whetstone.tries.answer(slug, lesson.id, block.question.id, given)}
                />
              </div>
            )

          // An `app` block is a demonstration. It answers nothing, because a Lesson
          // records nothing; a Lesson asks its questions through a `try` block.
          case 'app':
            return (
              <div key={index} className="panel">
                <div className="prow">
                  <span className="ptype">Activity</span>
                </div>
                <MiniApp slug={slug} appId={block.id} {...(block.height === undefined ? {} : { height: block.height })} />
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
