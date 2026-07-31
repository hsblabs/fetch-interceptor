---
title: Code quality hardening tickets
status: in-progress
date: 2026-08-01
---

# Code quality hardening tickets

## Completion criteria

- Observation failures never alter the original fetch/XHR outcome or invoke `onError` as a transport failure.
- Every representable XHR terminal success produces a standard `Response` without throwing.
- Startup and shutdown keep registry state and installed global adapters consistent on failure.
- Public types exclude runtime-only details and make invalid transport/reason combinations unrepresentable.
- Production behavior has one implementation path, naming is explicit, pure normalization is separated from global I/O, and public JSDoc ships in declarations.
- Unit, type, build, Node E2E, and browser E2E checks pass.

## Tracer tickets

- [ ] QH-1: Add public-interface regressions for consumed fetch responses, XHR no-body/status-0 responses, callback failures, and failed startup.
- [ ] QH-2: Make response observation safe and normalize XHR no-body/status-0 responses. Blocked by QH-1.
- [ ] QH-3: Make lifecycle transitions transactional and model transport failures as a discriminated union. Blocked by QH-1.
- [ ] QH-4: Remove duplicate handler paths, separate XHR normalization, tighten exports and naming, and preserve useful public JSDoc. Blocked by QH-2 and QH-3.
- [ ] QH-5: Run declaration, unit, type, build, Node E2E, and browser E2E verification. Blocked by QH-1 through QH-4.
