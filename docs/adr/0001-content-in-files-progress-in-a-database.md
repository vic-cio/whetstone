---
status: accepted
---

# Course content lives in plain files; progress lives in a database

A Course represents months of the user's time, and the app that renders it is a personal project that may break, be rewritten, or be abandoned. So Course content (the manifest, Lessons, Tasks, Resources, and generated Mini-apps) is written as plain readable files in a per-Course folder, and only the user's Attempts and markings go into a database. Content therefore survives the app, can be read and edited without it, and can be shared later; deleting the folder plus its progress rows deletes the Course completely.

## Considered options

Putting everything in the database was the alternative. It gives simpler queries and a single file to back up. It was rejected because it makes the content unreadable without the app, undiffable, and impossible for an agent to edit directly, which the "add a Rung later" flow needs.

## Consequences

Deletion now touches two stores, so it must be built as one atomic action from the start rather than added later. Progress rows reference content by stable ids in the files, so those ids must never be rewritten by a regeneration.
