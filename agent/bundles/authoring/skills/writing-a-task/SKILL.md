---
name: writing-a-task
description: How to write a Whetstone Task, the six kinds the app answers by itself, and when a question is allowed to need a model.
---

# Writing a Task

A Task is one assessable prompt. It belongs to exactly one Objective and carries a Depth
and a Check, and those two are independent axes. Nothing about the Depth tells you the
Check.

**Depth**: `recall`, `apply`, `construct`, `transfer`, `project`. How demanding the
thinking is.

**Check**: `deterministic`, `model`, `rubric`. How the answer is judged. This field alone
decides whether the Task works offline and whether it costs the reader money.

`depth: transfer` with `check: deterministic` is a good Task and you should write several.

## The six deterministic kinds

The app answers all six itself, instantly, offline, at no cost.

**multiple-choice.** `answer` is an array of indices, so it does more than one right option.

```json
{
  "id": "tsk-which-factor-vanishes", "objective": "obj-chain-rule",
  "depth": "apply", "check": "deterministic", "kind": "multiple-choice",
  "prompt": "Which factor drives the gradient toward zero?",
  "options": ["The learning rate", "The derivative of the activation", "The batch size"],
  "answer": [1],
  "explanation": "One sentence on why. Shown after the answer, right or wrong."
}
```

**accepted-answers.** A closed set of strings. The comparison folds case, spacing and
punctuation, so an answer that *is* punctuation survives only because you listed it.

```json
{ "kind": "accepted-answers", "accepted": ["negative", "-", "minus", "less than zero"] }
```

If you cannot write the list down and believe it is complete, this is the wrong kind. Use
`multiple-choice`, or `check: model`. Marking a right answer wrong is the worst thing the
app can do to somebody, and it is worse than asking a narrower question.

**numeric.** A number with a tolerance, and units if they matter.

```json
{ "kind": "numeric", "answer": 0.25, "tolerance": 0.01, "units": "per layer" }
```

**ordering.** A list to put in order. `answer` is the correct permutation as indices.

```json
{ "kind": "ordering", "items": ["Forward pass", "Loss", "Backward pass", "Update"], "answer": [0, 1, 2, 3] }
```

**app-result.** A Mini-app emits a result and the app compares it with `answer`. The
Mini-app never decides whether it is right.

```json
{ "kind": "app-result", "app": "slope-explorer", "answer": { "x": 3.2 } }
```

**assertions-pass.** A Mini-app runs your assertions against what the reader wrote. The
Task passes only on the assertions you declare.

```json
{ "kind": "assertions-pass", "app": "gradient-editor", "assertions": ["returns 6x for 3x^2", "handles a constant"] }
```

## When a Task may need a model

**check: model**, kind `short-answer`. For a question whose answer genuinely has many
valid forms. You write an `answerGuide` saying what a right answer must contain and what
does not count. Be specific about the near-misses.

```json
{
  "check": "model", "kind": "short-answer",
  "prompt": "In one phrase: why does a long chain of factors below one make the gradient vanish?",
  "answerGuide": "The answer has to join two things: that each layer contributes a factor to a product, and that a product of factors below one falls toward zero as the chain grows. Do not accept an answer that only names the symptom, such as \"the gradient gets small\".",
  "explanation": "Each layer contributes a factor. Factors below one compound downward."
}
```

**check: rubric**, kind `submission`. For work the reader produces outside the app. It
carries `accepts`, the file types it takes, and a `rubric` of criteria the reader sees
before starting.

```json
{
  "check": "rubric", "kind": "submission", "depth": "project",
  "accepts": [".py", ".ipynb"],
  "rubric": [
    { "id": "cri-derives-by-hand", "criterion": "Derives the gradient by hand before coding it, and the two agree." }
  ]
}
```

A criterion the reader can satisfy by restating the prompt is a bad criterion.

## The count

When the Course is finished, count the Tasks whose Check is not `deterministic`. More than
roughly one in five means you reached for a model where a comparison would have done. Go
back and make more of them verifiable.
