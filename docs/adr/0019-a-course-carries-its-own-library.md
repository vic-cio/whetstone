---
status: accepted
---

# A Course carries its own library, and the host offers no Services

A Mini-app is one `index.html` with everything inline (docs/adr/0005). That is right for a widget and wrong for a body of code. A chess Course needs a move generator and a board, and it needs the same ones in the Lesson's walkthrough and in the Test's position. With one file per app there are two ways to do that and both are bad: paste the code into every app, where the copies drift, or put it in the toolkit, where it becomes the app's opinion about chess and every other Course carries it.

So a Course gets a folder of its own. `course.json` lists files under `library`, they live in `lib/`, and the host inlines them into every Mini-app in that Course, in the order the Course listed. The toolkit is first, then the library, then the app.

Three things follow from that order. A library file may use the toolkit. An app may use both. The toolkit can be read without knowing either, which is what keeps it the same in every Course.

The toolkit and a library answer different questions. The toolkit is how a Mini-app plugs in: the bridge, the answer button, the height, the theme, the widgets that every subject needs. It is the same in every Course and it is versioned and pinned (docs/adr/0014). A library is what one Course is about. Nothing in the app knows what is in it, nothing validates it beyond the file being there, and no other Course sees it.

This replaces ADR-0018, which put chess rules in the host behind a declared Service. That was wrong twice over. It made the app know a subject, so the next Course that wanted physics or music theory would have had to wait for a release. And it was not even necessary: a sealed frame runs JavaScript, so it can carry a move generator and search it, and doing that in the frame is better than doing it in the main process, where a slow search freezes the whole window instead of one widget.

## Considered options

**A Service the host answers**, which is what ADR-0018 did. Rejected above. The idea returns the day a Mini-app needs something a sealed frame genuinely cannot do, such as a real engine binary or a file the learner picked. Nothing needs that today, and a permission system with nothing to permit is weight with no user.

**Every Mini-app declaring which library files it wants**, rather than the Course declaring once. Rejected. A declaration is worth its cost when it is a permission, and a Course's own code inside its own sandbox is not a permission: the app is already carrying the file either way. Per-app lists would only be bookkeeping to get wrong.

**Inlining everything in `lib/` with no list at all.** Rejected because order matters and a folder has none. The list is the order.

## Consequences

Whetstone contains no chess. The board, the rules, the opponent, and the look of the board are all in `fixtures/courses/forks-and-pins/lib/`, and a Constructor that wants a different board writes a different one without touching the app or waiting for a release.

A library is inlined, so it is subject to everything the sealed frame already is: no network, no storage, an opaque origin, and `postMessage` as the only way out. A Course cannot reach another Course's library, and the sealed-frame test checks that in the real runtime.

A bad library file breaks every activity in that Course at once rather than one of them. The parser refuses a name that is a path, a name that is not `.js` or `.css`, and a name with no file behind it, so that failure lands when the Course is read rather than when a learner presses something.

The app now carries no way for a Mini-app to reach the host beyond reporting an answer. That is the point, and it is also the thing to revisit first if a Course ever needs more.
