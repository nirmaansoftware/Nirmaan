# Pricing principles · IMPLEMENTED (as policy)

1. **Price the solution, not the hours.** Estimate effort to check the price,
   but price by the value and risk of the problem solved.
2. **Every proposal carries an internal estimate:** hours plus human, AI/API,
   infrastructure and other costs. The OS computes gross profit and margin
   before sending, and warns if a price loses money on its own estimate.
3. **Scope is explicit both ways:** in scope and out of scope, listed.
4. **Payment follows progress.** The default is on approval / at staging review /
   on final delivery. Percentages must total exactly 100%, and each amount is
   computed so they always sum to the price.
5. **Validity dates** on every proposal. Expired proposals can't be approved.
6. **Recurring plans are optional** and only offered for real ongoing work.
7. **No discounts without a scope change.** Reduce scope instead.
8. **Capacity before price.** Fixed-price work is not proposed past delivery
   capacity; capacity is checked when a lead moves from QUALIFIED to PROPOSAL
   ([lead-to-project.md](../operations/lead-to-project.md)). A queue that stays
   full triggers a price review. The limits are internal.
9. **Every new offer states its tax treatment**, confirmed with a chartered
   accountant before its first invoice.

Public price anchors are published in `website/src/_data/pricing.json`. Rate
cards, target margins and estimates are internal and live in the OS, not in
this public repository. (Corrected 2026-10-18, D8 in the
[market learnings decisions](../strategy/market-learnings-decisions.md).)
