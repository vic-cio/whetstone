---
status: accepted
---

# A Course verifies itself, and the app tracks one tick per Lesson

Victor's aim is education software that feels organic, with complexity emerging from the material, rather than a strict tutor-and-pupil dynamic. Two decisions follow. First, the Constructor's job is to make Tasks a machine can check, and the deterministic vocabulary is wide enough to carry real difficulty: an accepted-answer set is how Duolingo verifies a translation, and assertions run inside a Mini-app are how a coding course verifies working code. A model is reached for only when an answer genuinely has many valid forms, and the Constructor is told to go back and rewrite if more than roughly a fifth of its Tasks need one. Second, the app shows one tick per Lesson and nothing else. It fills when the user finishes a Lesson and the user can set or clear it by hand, which also replaces the separate "I already know this" control since they were the same idea twice. There is no ability estimate, no per-Objective state, and no counters for attempts, streaks, or spend, because a running score is the pupil dynamic in numeric form and a counter is the same instinct in smaller print.

## Considered options

Three things were drafted and cut in turn: a mastery estimate as an exponentially weighted mean weighted by Depth, a spaced-repetition queue with doubling intervals, and then a coarser four-state signal per Objective with a dashboard to show it. The dashboard went with them, and the home screen is now a course library. Both are defensible teaching tools and both make the app the authority on how well the user is doing and when they should study. Each is a defensible teaching tool, and each makes the app the authority on how well the user is doing. That is the thing being avoided, so the miss queue became a plain list of what is still wrong, reachable only from inside a Course, and the review session became a random draw over covered ground.

## Consequences

Attempts are still recorded in full, with Objective, Depth, and Check, because that record costs nothing now and cannot be reconstructed later, so a richer view remains possible if one is ever wanted. The Constructor's prompt carries the verifiability rule as its first instruction, and the Mini-app becomes the main vehicle for difficulty rather than the escape hatch it was in the earlier draft.
