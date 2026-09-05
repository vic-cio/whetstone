---
id: les-one-layer-at-a-time
title: One layer at a time
module: mod-3
objectives: [obj-backprop]
minutes: 14
---

A two-layer network is a composition of four operations. Differentiate them in reverse
and the gradient falls out one factor at a time.

:::callout{kind=warning}
Keep track of shapes. Most backprop bugs are a transpose in the wrong place, not a
misunderstanding of the maths.
:::
