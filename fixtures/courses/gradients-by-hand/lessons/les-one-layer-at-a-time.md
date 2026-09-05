---
id: les-one-layer-at-a-time
title: One layer at a time
module: mod-3
objectives: [obj-backprop]
minutes: 14
---

A two-layer network is a composition of four operations. Differentiate them in reverse
and the gradient falls out one factor at a time.

:::diagram{src=diagrams/two-layer.svg}
The forward pass runs left to right, and the gradient returns along the same path in reverse.
:::

:::callout{kind=warning}
Keep track of shapes. Most backprop bugs are a transpose in the wrong place, not a
misunderstanding of the maths.
:::
