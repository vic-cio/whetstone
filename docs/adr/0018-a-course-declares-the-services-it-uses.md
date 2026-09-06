---
status: accepted
---

# A Course declares the Services it uses, and the host answers nothing else

A Mini-app is one `index.html` with everything inline, no network, and no second script (docs/adr/0005). That is right for a widget and wrong for a body of rules. A chess Course needs legal moves, check, and mate. Every chess Course would carry its own move generator, each one wrong in a different way, and each one would have to be tested by the person reading the Course.

So the app grows a second kind of thing a Mini-app can use. The toolkit is code the frame runs. A Service is a question the host answers. `Kit.ask(name, request)` sends the question over the channel that already carries an answer, and the main process replies.

Three rules hold.

- A Course declares its Services in `course.json`, the way it declares its toolkit version. The host answers nothing a Course did not declare.
- A Course names a capability and a version, never a path. Nothing in a Course folder can point at the rest of the machine.
- A Service is offline, pure, and shared. It reads a request and returns a value, and it holds no state between calls.

The version is a major number, and it is a promise. A Course pinned to chess 1 keeps working while chess 1 gains operations. Chess 2 would be a different promise, and the parser refuses the pairing rather than letting a Course break at the moment a learner presses something.

## Considered options

**A Course points at a program on the machine.** Rejected outright. A Course is content an agent wrote and a person may have been sent. A path in it is a way into the rest of the machine, and no amount of checking a path makes that a good idea.

**A Mini-app carries the rules itself, as a second file.** Rejected. It breaks the one-file rule that makes a Mini-app checkable, and it puts the same code in every Course, where nothing tests it.

**No Services, and the Constructor scripts everything.** This still works and is still the right answer for a scripted position. It does not reach a Course where the learner plays freely, which is most of what makes a chess Course worth doing.

## Consequences

The first Service is chess: legal moves, castling, en passant, promotion, check, checkmate, stalemate, standard notation, and an opponent that searches three moves ahead. It is written once, in `src/shared/chess.ts`, and checked by counting every sequence of legal moves in the standard test positions.

A Service runs in the main process, so a slow one is a frozen window. The chess opponent's depth is capped for that reason, and any Service added later carries the same obligation.

A stronger engine can be put behind the same boundary without touching a single Course. That is the point of naming a capability rather than a program: what a Course asked for is "chess", and what answers is the app's business.
