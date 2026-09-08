---
name: staging-a-lesson
description: How a Lesson is staged so somebody learns from it, with context before the rule, controlled practice before free use, and checks that catch the misconception rather than asking whether the reader understood.
---

# Staging a lesson

This is the part that is not about the file format. A Course that meets the schema, covers
every Objective and still teaches nobody anything is the ordinary failure, and it has a
shape: each idea explained once, briefly, followed by one question, moving on.

The shapes below are the standard ones from language teaching, where a lesson has to work in
an hour with no shared vocabulary to fall back on. They carry over because the problem is
the same: somebody has to go from not knowing a thing to using it unaided.

## The three shapes

**Present, practise, produce.** The default, and what most Lessons should be.

1. **Build the context first.** The situation the idea belongs to, before the idea. A rule
   presented cold is a rule to memorise; the same rule after the case that needs it is a
   rule that explains something the reader has already noticed.
2. **Model it.** One concrete instance, with real values, that the reader could copy.
3. **Check the concept.** See below: this is a question, not a paragraph.
4. **Show the form.** Now name it, write it out, and say what the parts are.
5. **State the rule**, in one sentence, once the reader has seen it work.
6. **Controlled practice.** A `try` block: the same shape as the model, with one thing
   changed. It cannot be got wrong by somebody who followed, and getting it wrong is how
   they find out they did not.
7. **Free use.** The Tasks in the Test: the reader chooses the approach, and nothing on the
   page tells them which one applies.

**Test, teach, test.** The alternative, and the one this app almost never uses. A Module
*opens* with a short Test, so the reader finds out what they cannot do yet, then the Lessons
fill exactly that in, then a second Test uses it freely. A Module is not required to end
with its only Test, and a Course where every Module has one Test at the end has never
diagnosed anything. Use this shape at least once in a long Course, on material the reader
plausibly half-knows already.

**Task first.** For a subject where doing comes before naming: set a real, open task, let
the reader attempt it, then teach the ideas the attempt needed. Expensive to write well and
worth it for a whole final Module.

## Controlled practice and free use are different instruments

The format already gives you both, and they are not two difficulty levels of the same thing.

| | `try` in a Lesson | Task in a Test |
|---|---|---|
| When | Immediately after the idea | After the whole Module |
| Recorded | Never | Always |
| Prompted | Yes: the reader knows what it is about | No: they choose the approach |
| Point | Did I follow? | Can I do this unaided? |

So a Try is not decoration and not a quota. Write one where a reader could plausibly have
followed the words and missed the point, and write none where they could not. Two or three
in one Lesson is normal for a hard idea.

## Check the concept, not the comprehension

The worst question in teaching is "does that make sense?", and its written form is a Try
that restates the sentence above it.

A concept check aims at the one thing that has to be true in the reader's head, and it is
answerable only by somebody who has it. Take a lesson on a past continuous interrupted by a
past simple, "I was crossing the road when I was hit by a car":

- **Bad:** "Which tense is used first?" — answerable by looking up two lines.
- **Good:** "What was I doing just before the car hit me?" — answerable only if you know the
  first action was already in progress, which is the whole idea.

**The wrong options are the lesson.** Every distractor in a multiple-choice question is a
misconception somebody actually has, and each one should be the answer a reader arrives at
by making one specific mistake. Four options that are obviously wrong to anybody who read
the page test reading, not understanding. If you cannot name the mistake a distractor
represents, delete it and write a `numeric` or `accepted-answers` question instead.

## Explaining a wrong answer

An `explanation` is read by somebody who has just got it wrong, and its job is to let them
see where they went, not to state the right answer at them.

- Say what the answer they gave would be right for. That names their misconception without
  telling them they hold one.
- Then the one step that turns it into the right answer.
- Nothing else. No praise, no "don't worry", no restatement of the whole rule.

An explanation that reads "The answer is 6 because f'(x) = 2x" has told somebody who wrote 9
nothing at all about why they wrote 9.

## Instructions

A prompt is an instruction and is written like one: direct, present tense, one thing per
sentence, and short. "What we are going to do here is take the pattern and..." is three
words of instruction wrapped in nine of throat-clearing.

Say what the reader is producing and in what form, so the question cannot be misread as
asking for something else. Where the Task takes work outside the app, say how long it should
take, because an open-ended instruction with no size on it is the one people abandon.

## Vary the assessment, not just the difficulty

A Test made entirely of multiple choice measures recognition, which is the easiest thing to
have and the least of what the reader wants. Across one Test, mix questions the reader
recognises an answer to with questions they have to produce an answer for: a number they
calculate, an ordering they build, a pattern they write that your assertions run. The Depth
scale is about how hard the thinking is; this is about whether they can produce the thing at
all, and the two are independent.
