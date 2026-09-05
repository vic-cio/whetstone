# The sandbox probe

This Course exists to be attacked. It is not under `fixtures/courses/`, because that folder
ships inside the app and is copied into a fresh library on first run.

Its one Mini-app tries everything a hostile activity would try: the network, storage, the
host's document, the window above it, a popup, and a script from somewhere else. It then
reports what it reached, through the one channel it is given.

The external script is built with a computed property name on purpose. The validator that
refuses a Mini-app with an external reference is one layer, and a Mini-app that got past it
must still reach nothing. This Course tests the layer underneath.
