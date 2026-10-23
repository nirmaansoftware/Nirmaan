# Platform and Quality

FAIL when: a secret appears; a dependency or lockfile change is unexplained;
auth or input handling is weakened; headers or CSP in vercel.json change
without reason; a workflow has no top-level permissions:; pull_request_target
appears; ${{ github.event.* }} appears inside run:; a required check is
renamed, removed, path-filtered or made to skip; an action is not pinned by
SHA. performance-engineer: byte change of built pages not reported, an image
over about 200 KB without reason, a render-blocking or third-party script or
font, any LCP, CLS or Lighthouse number without a linked run. qa-engineer: the
launch-list items (docs/engineering/list.md) for a changed page are recorded.
sre: rollback path for anything that deploys.
