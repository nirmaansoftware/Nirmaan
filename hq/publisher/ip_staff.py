"""Print IP Nirmaan's staff for hq as JSON: one entry per department that holds a skill with a level.

Run with ip-nirmaan's virtualenv from the ip-nirmaan checkout:
    .venv/bin/python <this file>
Reads the organization (nirmaan.company.build_organization) and capability/levels.json.
The IP org has hundreds of generated roles, so hq groups them by department (the unit
two levels down, e.g. design.rtl) and lists the department's skills that have a level entry.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

from nirmaan.company import build_organization


def main() -> int:
    org = build_organization()
    data = json.loads(Path("capability/levels.json").read_text(encoding="utf-8"))
    entries = data.get("skills", {})
    items = entries.items() if isinstance(entries, dict) else entries
    levels = {skill: info.get("level", "none") for skill, info in items}

    depts: dict[str, dict] = defaultdict(lambda: {"skills": set(), "roles": 0})
    for role in org.roles.values():
        held = [s for s in role.skills if s in levels]
        if not held:
            continue
        dept = ".".join(role.unit.split(".")[:2])
        depts[dept]["skills"].update(held)
        depts[dept]["roles"] += 1

    out = []
    for dept, info in sorted(depts.items()):
        unit = org.units.get(dept)
        top = org.units.get(dept.split(".")[0])
        out.append({
            "org": "ip",
            "id": dept,
            "title": unit.name if unit else dept,
            "team": (top.name if top else dept.split(".")[0]) + f" · {info['roles']} roles",
            "skills": [{"id": s, "level": levels[s]} for s in sorted(info["skills"])],
        })
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
