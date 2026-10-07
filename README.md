# Vibration Alert Triage

## What this is

A personal portfolio project on designing for model uncertainty in vibration alert triage. It explores how a technician can judge a machine-health alert quickly when the model behind it is not always sure, or not always right. All data is entirely fictional.

## What it shows

- **Alert queue**: alerts sorted by severity, then confidence, then newest, with filters kept in the URL and keyboard triage (j/k to move, a to acknowledge, d to dismiss).
- **Alert detail with trend chart**: 48 hours of vibration against labelled warning and critical limits, with a written description and a data table for screen readers.
- **Confidence in plain words**: a Low, Medium or High band plus the number, and what the model is unsure about, phrased as tendencies rather than rules.
- **"Sensor went quiet"**: the trend stops at the last reading, and the screen says the missing data is not a healthy machine.
- **"Model was wrong"**: a dismissal with that reason is shown as a correction recorded as feedback, not as a failure.

## Design decisions

### Red, amber and green mean machine health only

TODO

### Confidence in plain words, not colour

TODO

### Missing data never reads as healthy

TODO

### "Model was wrong" is a correction, not a failure

TODO

### Sort order: severity, then confidence, then newest

The queue sorts by **severity**, then **model confidence** (highest first), then **newest**.

Trade-off: a low-confidence critical alert ranks above a high-confidence warning, and an older high-confidence alert ranks above a fresh, less certain one. Severity goes first so the most dangerous possibility is always at the top; a technician can then use the confidence band and the evidence line to decide quickly whether it is real. A single combined risk score (severity × confidence) was considered and rejected because it hides why an alert ranks where it does.

## How to run it

Requires Node 24 (see `.nvmrc`).

```sh
npm ci        # install the exact pinned dependencies
npm run dev   # start the app at http://localhost:5173/
npm test      # run the tests (watch mode; npm run test:run for a single run)
```

## Accessibility

Passes an automated axe audit with zero violations, plus automated keyboard tests. Light mode only. Not yet tested with a screen reader.

## Known limits

- Mock data only: an in-memory mock API, no real backend.
- No login or user accounts.
- No dark theme.
- Desktop first: narrow screens work, but the layout is designed for desktop.

## Screenshots

TODO

## About the data

All sites, machines and names in this project are fictional. Any resemblance to real facilities or people is coincidental. Built with [Claude Code](https://claude.com/claude-code).
