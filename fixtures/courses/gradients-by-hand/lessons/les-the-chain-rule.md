---
id: les-the-chain-rule
title: The chain rule
module: mod-2
objectives: [obj-chain-rule]
minutes: 8
---

When a function is built from other functions, its rate of change is the product of
the rates at each layer. That is the whole idea, and every neural network trains on it.

:::callout{kind=insight}
Backpropagation is the chain rule applied in reverse order, once per layer, reusing
what it already computed.
:::

Each layer contributes one factor. Multiply the factors and you have the gradient for
the whole composition.

:::try{id=try-inner-derivative}
:::
