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

Written out, for $f(x) = g(h(x))$:

$$
\frac{df}{dx} = \frac{dg}{dh} \cdot \frac{dh}{dx}
$$

Each layer contributes one factor. Multiply the factors and you have the gradient for
the whole composition.

| Layer | What it contributes | Evaluated at |
| --- | --- | --- |
| Outer, $g$ | $dg/dh$ | $h(x)$, not $x$ |
| Inner, $h$ | $dh/dx$ | $x$ |

The right-hand column is where most mistakes live: the outer derivative is evaluated at
the inner function's output, not at the input you started with.

:::try{id=try-inner-derivative}
{
  "kind": "multiple-choice",
  "prompt": "Differentiate f(x) = sin(3x^2).",
  "options": ["6x cos(3x^2)", "cos(3x^2)", "6x sin(3x^2)", "3x^2 cos(x)"],
  "answer": [0],
  "explanation": "Outer derivative cos(3x^2), inner derivative 6x, multiplied."
}
:::
