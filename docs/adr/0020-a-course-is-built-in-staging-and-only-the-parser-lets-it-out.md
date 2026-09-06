---
status: accepted
---

# A Course is built in staging, and only the parser lets it out

A Course is a folder, and the library is a folder of folders. So a Constructor writing straight into the library would put a half-written Course in front of the reader for the minutes it takes to write one, and would leave a broken one there for good when the run failed. The reader would see a Course appear, drawn as a red error block, and there would be nothing useful to do about it.

So a Run writes into a staging folder in the app's data directory, outside the library. The Course being written is not listed and cannot be opened, not for a moment. When the Run finishes, the app parses the folder. A folder the parser accepts is copied to a hidden name beside the library and renamed into place, because a rename inside one folder is atomic and a copy is not. A folder the parser refuses goes back to the same session with the errors, at most three times.

The gate is the parser and nothing else. It is already the thing standing between an agent's output and the reader, it already names the file and the field, and a second opinion beside it would be a second thing to keep in step with it.

## Considered options

**Writing into the library and hiding an unfinished Course with a marker file.** Rejected. That makes every reader of the library know about a state that only exists during a build, and a crash mid-build leaves the marker behind and the Course invisible for ever.

**One attempt, and a failed build is a failed build.** Rejected. The usual failure is a missing field or a bad id, it goes away in one turn, and the outcome this avoids is a ten-minute build dying on a typo.

**Repairing until it parses.** Rejected. Without a cap, a Course that is wrong in a way the Run cannot see spends until the budget stops it. Three is enough for a typo and short enough to be honest about a real failure.

**Letting the Constructor write the toolkit.** Rejected, and this is the subtle one. A Course pins the toolkit it was built against (`docs/adr/0014`), and the one thing that would quietly break that pin is an agent writing its own idea of the toolkit into the folder. So the app copies `toolkit/` into staging before the Run starts and tells the Constructor the version string to record and not to touch the folder.

## Consequences

The library only ever holds Courses that parse. `courses/` gains no state of its own: no marker files, no in-progress rows, nothing to clean up after a crash.

A failed build leaves its staging folder where it is, named, so it can be opened and read. It stays until the next build replaces it. Cancelling kills the process and bins the folder, and there is no resume: a Run costs minutes rather than hours, and a resumable half-Course is state to get wrong for very little.

The Brief's folder and the staging folder are the same folder. That is what lets a file attached in the conversation be something the build can read: it goes into `.brief/`, the Constructor is told to read it and to cite every link in `resources.json`, and the app removes `.brief/` before the move, so a shared Course carries none of the material it was built from.

Because the app picks the folder name from the Course's own id and takes the first free one, two Courses about one idea can both exist. Naming is the app's bookkeeping, and a Run should not have to spend a turn on it.
