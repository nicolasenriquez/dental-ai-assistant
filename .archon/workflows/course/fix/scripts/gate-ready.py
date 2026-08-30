"""The readiness join: did any review actually say this change is ready?

Two paths reach here and exactly one of them ran:

- the first review said ready, and the correction loop was skipped;
- the first review refused, and the last correction round's fresh review
  certified the fix.

`if_skipped: false` is what makes those distinguishable — a skipped producer
reads false rather than empty, so "never ran" cannot be mistaken for "ran and
refused". Exhausting the correction bound lands here too, and lands as a
refusal: the run fails with the PR still draft and its findings attached.
"""

import os
import sys

review_ready = os.environ.get("INPUTS_REVIEW_READY", "false")
correction_ready = os.environ.get("INPUTS_CORRECTION_READY", "false")

if review_ready == "true" or correction_ready == "true":
    print('{"gate":"ready"}')
    sys.exit(0)

print(
    "no review returned ready — the PR stays draft with its findings attached. "
    f"(first review ready={review_ready}, last correction ready={correction_ready})",
    file=sys.stderr,
)
sys.exit(1)
