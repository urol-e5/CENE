# Scientific interpretation & caveats

This document expands the framing shown throughout the site. It is transcribed
from the manuscript **“Multi-Layered Epigenetic Regulation in Three Reef-Building
Corals.”** Read it before drawing conclusions from any figure or table here.

## What the interactions are — and are not

Every edge on this site is a **prediction**, supported to varying degrees by:

- **Sequence complementarity** — miRanda (v3.3) predicts thermodynamically
  plausible miRNA:target duplexes (strict seed, score ≥ 100, energy ≤ −20 kcal/mol),
  across CDS, 5′UTR, and 3′UTR (cnidarian miRNAs bind with near-full
  complementarity, plant-like, so CDS binding is biologically relevant); and/or
- **Expression coexpression** — Pearson correlation on RPM-normalized counts.

They are **not** experimentally validated regulatory relationships. Predicted
binding does not establish functional targeting, and correlation does not establish
causation.

## Statistical caveats (do not skip)

- **n = 5 biological replicates per species.** All correlations rest on five points.
- **Pairwise correlations are unstable at n = 5**; a few samples drive each value.
- **Unadjusted p-values.** Interactions were prioritized by correlation magnitude
  (|r| ≈ 0.88 at p < 0.05, n = 5), not multiple-testing-corrected significance.
  Benjamini-Hochberg across all pairwise tests would demand |r| > 0.99 — so raw
  p-values were used deliberately, and false positives are expected.
- **Positive coexpression is common and ambiguous.** Most predicted interactions
  are *positively* correlated, which is contrary to canonical miRNA repression. This
  may reflect co-regulation, indirect loops, or non-canonical stabilizing effects
  rather than direct repression.

## ceRNA relationships are inferred

A candidate ceRNA is a lncRNA that (a) is predicted to bind a miRNA, (b) is
negatively coexpressed with that miRNA, and (c) is positively coexpressed with the
miRNA's mRNA target(s) — a signature *consistent with* sequestration and indirect
derepression. This is an inference, not a demonstration. The TNRC6 example
(ptuh-mir-novel-4, two lncRNA sponges) is presented as a hypothesis.

## Cross-species comparison

Genome-assembly quality varies substantially among the three species (see the
Methods view). This affects transcript discovery and target prediction, so absolute
counts are not strictly comparable. **Sequence conservation does not imply conserved
regulatory function** — miR-100 is the headline example: its target coexpression is
almost entirely negative in *A. pulchra* and *P. tuahiniensis* but almost entirely
positive in *P. evermanni*.

## Epi-miRNAs

miRNAs predicted to target epigenetic-machinery transcripts are reported as putative
**epi-miRNAs** — the first such description in cnidarians. Roughly half of the 66
target pairs are positively coexpressed (unexpected under canonical repression); the
DNA-methylation-machinery targets (TET3, MBD, PRDM14) are the exception, all showing
canonical negative coexpression.

## Language conventions used on the site

We use: *predicted to target*, *putatively interacts*, *consistent with*,
*candidate ceRNA*, *hypothesized regulatory relationship*. We avoid *proves*,
*controls*, and *causes* — none of the relationships here are established
experimentally.

## Bottom line

Treat every network edge as a **hypothesis for future experimental testing**. The
value of this resource is in prioritizing candidates and revealing cross-layer
structure, not in asserting mechanism.
