# Milestone Desk visual direction

## Two directions considered

1. **Evidence dossier.** Cool paper, cobalt annotations, rounded dossier edges and restrained inset surfaces. A continuous record connects delivery evidence, an explicit human decision and an unsent invoice. Suitable for freelancers reviewing actual project work.
2. **Precision workshop.** Steel, graphite and signal orange, using compact instrument-like controls. Appropriate for operational density, but it makes a freelancer’s acceptance decision feel more technical than it needs to be.

## Selected: evidence dossier

The first draft of this direction leaned toward cream paper and serif headings. That familiar editorial treatment did not distinguish the product. The chosen design instead uses a cool, sans-led workspace with a deep blue project rail and one characteristic element: a **provenance trace showing the actual state of evidence, human acceptance and invoice preparation**. Numbers indicate real sequential checkpoints. No fake progress or decorative data.

### Tokens and composition

- Cool light paper `#edf1f7`; white working surface `#ffffff`; ink `#17243e`; cobalt action `#2453ca`; amber pending `#8a5100`; teal confirmed `#166655`.
- Dark navy canvas `#101827`; layered surface `#182337`; pale ink `#eaf0ff`; periwinkle action `#aec4ff`; amber pending `#f3c77c`; mint confirmed `#9bddca`.
- Avenir Next for the interface where installed, with Trebuchet MS and system sans fallbacks. Strong geometric headings, plain body copy and tabular figures; no external font request.
- Project rail → project heading and compact totals → comparison table → selected milestone provenance → source and review columns → invoice receipt → journal.
- Left-aligned content, 8px spacing rhythm, 44px minimum action height, rounded section corners with fine inset edges. The trace is the memorable device; other surfaces remain quiet.
- Motion only responds to a person’s action. Reduced motion disables transitions. Status always has words as well as color.

### Appearance behavior

A synchronous local script sets the document theme before styles load. First visit follows system appearance; the visible toggle persists an explicit choice. System reset is offered through Connections. Theme changes preserve form edits, dialog state, grid selection and filters. Both palettes cover AG Grid, native controls, dialogs, errors, empty states and toasts.

### Verification

See `artifacts/design/design-qa.json` and `artifacts/gallery/` for the completed browser checks and final screenshots. Synthetic records only are used in test captures. The film shows existing, previously verified sandbox work and labels it as such; it never implies a new invoice was created during recording.

### References

- [AG Grid theming colors](https://www.ag-grid.com/javascript-data-grid/theming-colors/): native theme parameters applied to both palettes without replacing the grid.
