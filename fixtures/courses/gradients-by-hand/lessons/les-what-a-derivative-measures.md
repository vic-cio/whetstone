---
id: les-what-a-derivative-measures
title: What a derivative measures
module: mod-1
objectives: [obj-derivative]
minutes: 6
---

A derivative answers one question: if I nudge the input a little, how much does the
output move? Everything else about calculus is bookkeeping around that question.

:::callout{kind=insight}
The derivative at a point is the slope of the line that hugs the curve there.
Steeper line, larger derivative.
:::

:::app{id=slope-explorer height=320}
:::

Drag the point along the curve above and watch the slope readout. Where the curve
flattens out, the slope approaches zero, and that is exactly where training stalls.

:::try{id=try-slope-sign}
{
  "kind": "accepted-answers",
  "prompt": "In one word: what is the sign of the derivative where the curve is falling?",
  "accepted": ["negative", "minus"],
  "explanation": "A falling curve loses height as the input grows, so the slope is below zero."
}
:::

:::resource{id=res-3b1b-chain-rule}
:::
