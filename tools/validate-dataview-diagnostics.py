#!/usr/bin/env python3
import json
import math
import sys
from collections import defaultdict
from pathlib import Path


ALLOWED_EVIDENCE_CLASSES = {"observed", "simulated", "reconciled"}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate-dataview-diagnostics.py DIAGNOSTICS.json", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    data = json.loads(path.read_text(encoding="utf-8"))
    errors: list[str] = []

    if data.get("schema") != "aoe-sim.dataview-node-diagnostics/v1":
        errors.append(f"unexpected schema: {data.get('schema')!r}")

    parser = record(data.get("parser"))
    gameplay = record(data.get("gameplay"))
    reconstruction = record(data.get("reconstruction"))
    synthetic = record(data.get("synthetic"))
    snapshots = list_value(reconstruction.get("snapshots"))
    checks = list_value(data.get("checks"))

    for check in checks:
        row = record(check)
        if not row.get("passed"):
            errors.append(f"failed Node check: {row.get('name')}: {row.get('detail')}")

    if parser.get("players", 0) < 2:
        errors.append("parser player count is too low")
    if parser.get("inputs", 0) <= 0 or parser.get("map_events", 0) <= 0:
        errors.append("parser did not expose inputs/map events")
    if parser.get("observed_actor_keys", 0) <= 0:
        errors.append("parser did not expose observed actor keys")

    counts = record(gameplay.get("counts"))
    if gameplay.get("schema") != "aoe-sim.dataview-gameplay-timeline/v1":
        errors.append(f"unexpected gameplay schema: {gameplay.get('schema')!r}")
    if gameplay.get("units", 0) != counts.get("timeline_units"):
        errors.append("gameplay unit count does not match timeline_units")
    if counts.get("positioned_observed_actor_births", 0) <= 0:
        errors.append("no positioned observed actors were materialized")

    if reconstruction.get("schema") != "aoe-sim.dataview-diagnostics/v1":
        errors.append(f"unexpected reconstruction schema: {reconstruction.get('schema')!r}")
    if not snapshots:
        errors.append("no reconstruction snapshots")

    dimension = parser.get("map_dimension", 0)
    last_lifecycle_filtered = -1
    saw_stale_or_lifecycle = False
    saw_combat = False

    for snapshot in sorted(snapshots, key=lambda row: row.get("seconds", 0)):
        seconds = number(snapshot.get("seconds"))
        diagnostics = record(snapshot.get("diagnostics"))
        assignments = list_value(snapshot.get("assignments"))
        marker_groups = list_value(snapshot.get("marker_groups"))
        rendered_assignments = [record(row) for row in assignments if record(row).get("map_rendered")]

        if diagnostics.get("assignments") != len(assignments):
            errors.append(f"t={seconds}: assignments count mismatch")
        if diagnostics.get("mapRendered") != len(rendered_assignments):
            errors.append(f"t={seconds}: mapRendered count mismatch")
        if diagnostics.get("markerGroups") != len(marker_groups):
            errors.append(f"t={seconds}: markerGroups count mismatch")

        for assignment in assignments:
            row = record(assignment)
            evidence_class = row.get("evidence_class")
            if evidence_class not in ALLOWED_EVIDENCE_CLASSES:
                errors.append(f"t={seconds}: invalid evidence class {evidence_class!r}")
            if row.get("map_rendered"):
                position = record(row.get("position"))
                x = number(position.get("x"), math.nan)
                y = number(position.get("y"), math.nan)
                if not math.isfinite(x) or not math.isfinite(y):
                    errors.append(f"t={seconds}: rendered assignment has non-finite position")
                elif x == 0 and y == 0:
                    errors.append(f"t={seconds}: rendered assignment fabricated at map origin")
                elif dimension and (x < 0 or y < 0 or x > dimension or y > dimension):
                    errors.append(f"t={seconds}: rendered assignment outside map bounds")
                if row.get("visible_until") is not None and seconds >= number(row.get("visible_until")):
                    errors.append(f"t={seconds}: assignment remains visible after visible_until")

        for group in marker_groups:
            row = record(group)
            if row.get("stack_count", 0) != len(list_value(row.get("stack_member_ids"))):
                errors.append(f"t={seconds}: stack member count mismatch")
            if row.get("stack_layout_count", 0) <= 0:
                errors.append(f"t={seconds}: invalid stack layout count")
            if len(list_value(row.get("stack_layout_item_counts"))) != row.get("stack_layout_count", 0):
                errors.append(f"t={seconds}: stack layout item counts do not cover the row")
            layout = record(row.get("layout_at_fit_scale"))
            if not rect_is_valid(record(layout.get("sprite_rect"))):
                errors.append(f"t={seconds}: invalid stack sprite rectangle")
            if row.get("stack_count", 0) > 1 and not rect_is_valid(record(layout.get("count_rect"))):
                errors.append(f"t={seconds}: stacked marker is missing a count rectangle")
            if not rect_is_valid(record(layout.get("footprint_rect"))):
                errors.append(f"t={seconds}: invalid stack footprint rectangle")

        if diagnostics.get("lifecycleFiltered", 0) < last_lifecycle_filtered:
            errors.append(f"t={seconds}: lifecycleFiltered decreased across sorted snapshots")
        last_lifecycle_filtered = diagnostics.get("lifecycleFiltered", 0)

        if diagnostics.get("lifecycleFiltered", 0) > 0 or diagnostics.get("stalePositionFiltered", 0) > 0:
            saw_stale_or_lifecycle = True
        sprite_counts = record(diagnostics.get("spriteCounts"))
        activity_counts = record(diagnostics.get("activityCounts"))
        if any(sprite_counts.get(key, 0) > 0 for key in ("archer", "spear", "swordsman", "camel", "knight", "scout")):
            saw_combat = True
        if activity_counts.get("attack", 0) > 0:
            saw_combat = True

        positions_to_types: dict[str, set[str]] = defaultdict(set)
        for group in marker_groups:
            row = record(group)
            positions_to_types[str(record(row.get("position")))].add(str(row.get("stack_unit_type_key")))
        actual_mixed = sum(1 for types in positions_to_types.values() if len(types) > 1)
        if actual_mixed < diagnostics.get("mixedPositionGroups", 0):
            errors.append(f"t={seconds}: mixed-position diagnostic exceeds grouped evidence")

    if not saw_stale_or_lifecycle:
        errors.append("no snapshot shows stale or lifecycle removal behavior")
    if not saw_combat:
        errors.append("no snapshot shows combat-capable sprites or attack activity")

    parity = record(reconstruction.get("parity"))
    if not parity.get("deterministic"):
        errors.append("seek parity is not deterministic")
    for row in list_value(parity.get("parity")):
        if record(row).get("repeatCount", 0) > 1 and not record(row).get("deterministic"):
            errors.append(f"nondeterministic repeated seek at {record(row).get('seconds')}")

    if not synthetic.get("passed"):
        errors.append("synthetic exact-type grouping fixture failed")
    synthetic_groups = list_value(synthetic.get("marker_groups"))
    if len(synthetic_groups) != 3:
        errors.append("synthetic mixed grouping did not produce three exact-type markers")
    if synthetic.get("expected_stack_counts") != [7, 12, 123]:
        errors.append("synthetic mixed grouping did not cover one-, two-, and three-digit counts")
    if synthetic.get("footprint_intersection_count") != 0:
        errors.append("synthetic mixed grouping footprints intersect")
    layout_items = [record(item) for item in list_value(synthetic.get("layout_items_at_fit_scale"))]
    if sorted(record(item).get("count_digits", 0) for item in layout_items) != [1, 2, 3]:
        errors.append("synthetic mixed grouping count digits are not 1, 2, and 3")
    for left_index in range(len(layout_items)):
        for right_index in range(left_index + 1, len(layout_items)):
            left = record(layout_items[left_index].get("footprint_rect"))
            right = record(layout_items[right_index].get("footprint_rect"))
            if rects_intersect(left, right):
                errors.append(f"synthetic footprints intersect: {left_index}/{right_index}")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(
        "dataview diagnostics ok: "
        f"{len(snapshots)} snapshots, {gameplay.get('units', 0)} timeline units, "
        f"{counts.get('positioned_observed_actor_births', 0)} positioned observed actors"
    )
    return 0


def record(value):
    return value if isinstance(value, dict) else {}


def list_value(value):
    return value if isinstance(value, list) else []


def number(value, fallback=0):
    return value if isinstance(value, (int, float)) and math.isfinite(value) else fallback


def rect_is_valid(rect) -> bool:
    width = number(rect.get("width"), math.nan)
    height = number(rect.get("height"), math.nan)
    left = number(rect.get("left"), math.nan)
    right = number(rect.get("right"), math.nan)
    top = number(rect.get("top"), math.nan)
    bottom = number(rect.get("bottom"), math.nan)
    return (
        math.isfinite(width)
        and math.isfinite(height)
        and math.isfinite(left)
        and math.isfinite(right)
        and math.isfinite(top)
        and math.isfinite(bottom)
        and width > 0
        and height > 0
        and left <= right
        and top <= bottom
    )


def rects_intersect(left, right) -> bool:
    return (
        rect_is_valid(left)
        and rect_is_valid(right)
        and left["left"] < right["right"]
        and right["left"] < left["right"]
        and left["top"] < right["bottom"]
        and right["top"] < left["bottom"]
    )


if __name__ == "__main__":
    raise SystemExit(main())
