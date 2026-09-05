---
status: accepted
---

# The interface uses hairline editorial structure with a dark rail, not soft cards

Victor rejected a first design round in his own words as "bubbly inoffensive big tech slop" while keeping its warm stone and amber palette, so the visual direction is defined by what it refuses: border radius is zero, structure comes from hairline rules rather than bordered floating cards, and display type is a compressed grotesque set large and tight against small monospace labels. He then chose the most restrained of three sharper variants and asked for the sidebar to be darker, so the rail is a warm dark grey and the only dark surface in the light theme.

## Consequences

The visual contract lives in `docs/design-reference.html` rather than in prose, and new screens are checked against it. shadcn/ui components are restyled to these tokens rather than used as shipped, since their defaults are the rounded look that was rejected. Fonts are self-hosted because the offline requirement means the app must render correctly with no network.
