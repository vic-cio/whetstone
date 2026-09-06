---
id: les-the-knight-fork
title: The knight fork
module: mod-1
objectives:
  - obj-fork
  - obj-play-fork
minutes: 8
---

A fork is one move that attacks two pieces at once. Your opponent can answer one attack. The other one stands, and you take it next move.

The knight is the best forking piece on the board. It attacks eight squares at once, it jumps over anything in the way, and no piece can block a knight. A rook or a bishop can be shut out with one pawn. A knight cannot.

Look for a square that touches two enemy pieces. Then ask whether your knight can reach that square in one move.

## A fork, move by move

Step through this. The board below shows the same position after each move.

:::app{id=fork-walkthrough height=560}
:::

The check is what makes this work. Your opponent must answer a check before anything else, so the queen has to stand and wait, and by then it is lost.

A fork without a check is much weaker. Your opponent picks the piece they want to keep, moves it, and gives up the other one. That is a fair trade for them if the two pieces are worth the same.

:::try{id=try-why-the-check}
{
  "kind": "multiple-choice",
  "prompt": "Why does a fork that gives check win material more often than a fork that does not?",
  "options": [
    "A check must be answered first, so the second piece has no time to move",
    "A king is worth more than a queen",
    "A knight cannot be captured while it gives check",
    "Check ends the game"
  ],
  "answer": [0],
  "explanation": "A check takes the choice away. Your opponent cannot save the other piece, because the rules make them deal with the king first."
}
:::

## Reading a fork before you play it

Two habits find nearly every knight fork.

1. Look at the enemy king first. A fork with check is the one that wins.
2. Find the squares from which a knight attacks the king. There are always eight of them.
3. Check which of those squares your knight can reach in one move.
4. Of those, take the square that also attacks something worth having.

The Test asks you to play one on the board.
