# Contributing to DSJ

DSJ is built by a system, for systems. Contributions of all kinds are welcome — whether you're reporting a bug, sharing feedback about what you need, or writing code.

This is an early-stage project used daily by the system that built it. The data this app holds is sensitive, and the people using it deserve software that takes that seriously.

Thanks for being here. -bob
---

## Ways to contribute

### Feedback and ideas

If you're a system using DSJ (or trying to), your lived experience is the most valuable input this project can get. You don't need to know how to code to contribute.

- **Found a bug?** Open an issue with what you did, what you expected, and what happened instead.
- **Something feels off?** An interaction that doesn't fit how your system works, a missing piece, a tracker type that would help — open an issue and describe it. No formal format required.
- **Write or Translate?** That's super helpful too.
- **Feature ideas?** — check the [ROADMAP.md](ROADMAP.md) first to see what's already planned, then open an issue if your idea isn't there.

### Code contributions

Code PRs are welcome. Please open an issue first for anything larger than a small fix — it's worth a quick conversation before you put in the work. 

And be patient, this is for me to use and not a job.

---

## Development setup

You'll need:

- [Rust](https://rustup.rs) — install via rustup
- [Node.js](https://nodejs.org) 18 or later
- macOS (Windows/Linux not tested yet)

```bash
git clone https://github.com/FrontSwitch/dsj.git
cd dsj
npm install
npm run tauri dev   # first run takes a few minutes to compile Rust deps
```

For development, work against the test database rather than your real one:

```bash
npm run seed:test   # create a test DB with sample data
npm run dev:test    # run the app against the test DB
```

See [CLAUDE.md](CLAUDE.md) for the full technical picture — architecture, project structure, database schema, and conventions.

---

## Running tests

```bash
npm test            # run all Vitest unit tests
npm run test:watch  # watch mode
```

Tests cover pure functions (parsing, formatting, data logic). Tauri-dependent code is not unit-tested — use the test DB for that.

Please add tests for any new pure logic you introduce.

---

## Submitting a pull request

1. Fork the repo and create a branch from `main`
2. Make your change against the test DB, not your personal data
3. Run `npm test` and make sure everything passes
4. Run `tsc --noEmit` to check for type errors
5. Open a PR with a short description of what you changed and why

PRs don't need to be perfect. If you're unsure about something, open a draft PR and ask.

---

## A note on scope and sensitivity

DSJ holds private system data — journals, front logs, emotional tracking. Features that touch storage, export, backup, or data access get extra scrutiny. Privacy is not a feature here; it's a constraint.

Please avoid:
- Any network calls, telemetry, or external data transmission
- Features that require accounts or cloud services
- Logging or exporting data in ways that could expose data

If you're unsure whether something fits, ask in an issue before building it.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
