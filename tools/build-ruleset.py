#!/usr/bin/env python3
"""Build the AoE Sim rules contract from a local Genie DAT install.

The generated JSON is a derived, deterministic engine contract. It records IDs,
facts, and provenance from the installed DAT without bundling the raw DAT or
machine-local source paths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter, defaultdict
from dataclasses import fields, is_dataclass
from pathlib import Path
from typing import Any

try:
    from genieutils.datfile import DatFile
except ModuleNotFoundError as error:  # pragma: no cover - exercised in operator environment.
    raise SystemExit(
        "tools/build-ruleset.py requires genieutils. Run with "
        "/tmp/aoe-genie-env/bin/python or install the pinned genieutils parser."
    ) from error


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DAT = Path(
    "/home/carlos/snap/steam/common/.local/share/Steam/steamapps/common/AoE2DE/"
    "resources/_common/dat/empires2_x2_p1.dat"
)
DEFAULT_LOCALIZATION = Path(
    "/home/carlos/snap/steam/common/.local/share/Steam/steamapps/common/AoE2DE/"
    "resources/en/strings/key-value/key-value-strings-utf8.txt"
)
DEFAULT_APPMANIFEST = Path("/home/carlos/snap/steam/common/.local/share/Steam/steamapps/appmanifest_813780.acf")
DEFAULT_SCENARIO = REPO_ROOT / "public/fixtures/glade-120x120.scenario.json"
DEFAULT_OUTPUT = REPO_ROOT / "public/rules/ruleset-current.json"
DEFAULT_REPORT = REPO_ROOT / "public/rules/ruleset-current.report.json"
DEFAULT_SCENARIO_COVERAGE = REPO_ROOT / "public/rules/glade-120x120.coverage.json"

EXPECTED_DAT_SHA256 = "ce3530df36cf0b333a9751cb0ff94460fe904f811feecec8ae9794701622b4cf"
EXPECTED_LOCALIZATION_SHA256 = "fa8bc9c0c90cd17e0cfce85db0b9a75c8a6cc67ab580932e86dbaad41df9ae4e"
EXPECTED_STEAM_BUILD_ID = "24094652"
GENIEUTILS_PINNED_COMMIT = "e1ff9db0b11442587b96f1a65ffdb972cff2d9fc"
REPLAY_BUILD_VERSION = 180059
REPLAY_GAME_VERSION = "VER 9.4"
REPLAY_SAVE_VERSION = 68
FIXED_POINT_SCALE = 1000
STEP_MS = 50

UNIT_TYPE_NAMES = {
    10: "eye-candy",
    15: "trees",
    20: "flag",
    30: "dead-fish",
    40: "bird",
    50: "combatant",
    60: "projectile",
    70: "creatable",
    80: "building",
    90: "aoe-trees",
}
KNOWN_EFFECT_COMMAND_TYPES = {
    0: "attribute-set",
    1: "resource-modify",
    2: "enable-disable-unit",
    3: "unit-upgrade",
    4: "attribute-add",
    5: "attribute-multiply",
    6: "resource-multiply",
    7: "resource-set",
    8: "team-bonus",
    10: "tech-cost-modify",
    12: "tech-time-modify",
    15: "tech-enable-disable",
    18: "unknown-legacy-18",
    26: "unknown-legacy-26",
    40: "civilization-bonus",
    101: "tech-tree-unit-availability",
    102: "tech-tree-research-availability",
    103: "tech-tree-building-availability",
    200: "de-effect-200",
    201: "de-effect-201",
    202: "de-effect-202",
    204: "de-effect-204",
    255: "terminator-or-sentinel",
}
ATTRIBUTE_NAMES = {
    0: "hit-points",
    1: "line-of-sight",
    2: "garrison-capacity",
    3: "size-x",
    4: "size-y",
    5: "movement-speed",
    8: "armor-vector",
    9: "attack-vector",
    10: "reload-time",
    12: "max-range",
    13: "work-rate",
    19: "population",
    22: "min-range",
    23: "displayed-range",
    50: "training-location",
    100: "resource-cost-food",
    101: "train-time",
    102: "total-projectiles",
    103: "projectile-unit",
    104: "resource-cost-wood",
    105: "resource-cost-gold",
    106: "resource-cost-stone",
}
RESOURCE_TYPE_NAMES = {
    0: "food",
    1: "wood",
    2: "stone",
    3: "gold",
    4: "population-headroom",
    6: "current-age",
    11: "population",
    20: "faith",
    35: "bonus-population",
    36: "food-decay",
    91: "trade-goods",
    92: "relic-gold",
}

UNIT_BASE_NESTED_FIELDS = {
    "resource_storages",
    "damage_graphics",
    "dead_fish",
    "bird",
    "type_50",
    "projectile",
    "creatable",
    "building",
}
UNIT_BASE_FIELD_GROUPS = {
    "identity": [
        "type",
        "id",
        "language_dll_name",
        "language_dll_creation",
        "class_",
        "name",
        "base_id",
        "copy_id",
        "civilization",
    ],
    "movement": [
        "speed",
        "terrain_restriction",
        "fly_mode",
        "hill_mode",
        "interaction_mode",
        "old_attack_reaction",
    ],
    "collision": [
        "collision_size_x",
        "collision_size_y",
        "collision_size_z",
        "clearance_size",
        "obstruction_type",
        "obstruction_class",
        "outline_size_x",
        "outline_size_y",
        "outline_size_z",
    ],
    "economy": [
        "resource_capacity",
        "resource_decay",
        "resource_gather_group",
        "enable_auto_gather",
        "recyclable",
        "resource_storages",
    ],
    "combat": ["type_50", "blast_defense_level", "combat_level", "trait"],
    "projectile": ["projectile"],
    "production": ["creatable"],
    "building": ["building"],
}
EXTRACTED_UNIT_BASE_FIELDS = {
    field_name
    for group_fields in UNIT_BASE_FIELD_GROUPS.values()
    for field_name in group_fields
    if field_name not in UNIT_BASE_NESTED_FIELDS
}


def main() -> None:
    args = parse_args()
    require_file(args.dat, "DAT")
    require_file(args.localization, "localization")
    require_file(args.appmanifest, "appmanifest")
    require_file(args.scenario, "scenario")

    dat_sha = file_sha256(args.dat)
    localization_sha = file_sha256(args.localization)
    appmanifest_sha = file_sha256(args.appmanifest)
    extractor_sha = file_sha256(Path(__file__))
    genie_datfile_module = Path(sys.modules[DatFile.__module__].__file__ or "datfile.py")
    genie_datfile_sha = file_sha256(genie_datfile_module)
    scenario_sha = file_sha256(args.scenario)

    if dat_sha != EXPECTED_DAT_SHA256:
        raise SystemExit(f"DAT hash changed: expected {EXPECTED_DAT_SHA256}, got {dat_sha}")
    if localization_sha != EXPECTED_LOCALIZATION_SHA256:
        raise SystemExit(f"localization hash changed: expected {EXPECTED_LOCALIZATION_SHA256}, got {localization_sha}")

    appmanifest = parse_appmanifest(args.appmanifest.read_text(encoding="utf-8", errors="replace"))
    steam_build_id = appmanifest.get("buildid")
    if steam_build_id != EXPECTED_STEAM_BUILD_ID:
        raise SystemExit(f"Steam build ID changed: expected {EXPECTED_STEAM_BUILD_ID}, got {steam_build_id}")

    strings = load_localization(args.localization)
    dat = DatFile.parse(args.dat)
    context = SourceContext(
        dat_path=args.dat,
        localization_path=args.localization,
        appmanifest_path=args.appmanifest,
        scenario_path=args.scenario,
        dat_sha=dat_sha,
        localization_sha=localization_sha,
        appmanifest_sha=appmanifest_sha,
        extractor_sha=extractor_sha,
        genie_datfile_sha=genie_datfile_sha,
        genie_datfile_module=genie_datfile_module,
        appmanifest=appmanifest,
        scenario_sha=scenario_sha,
    )

    ruleset = build_ruleset(dat, strings, context)
    semantic_hash = sha256_text(stable_json(ruleset))
    ruleset["provenance"]["generatedArtifact"]["sha256"] = f"sha256:{semantic_hash}"
    artifact_text = stable_json(ruleset) + "\n"
    artifact_sha = sha256_text(artifact_text)
    artifact_size = len(artifact_text.encode("utf-8"))

    report = build_report(dat, ruleset, context, semantic_hash, artifact_sha, artifact_size)
    scenario = json.loads(args.scenario.read_text(encoding="utf-8"))
    coverage = build_scenario_coverage(scenario, ruleset, context, artifact_sha)

    assert_no_path_leaks(ruleset, "ruleset")
    assert_no_path_leaks(report, "report")
    assert_no_path_leaks(coverage, "scenario coverage")

    args.out.write_text(artifact_text, encoding="utf-8")
    args.report.write_text(stable_json(report) + "\n", encoding="utf-8")
    args.scenario_coverage.write_text(stable_json(coverage) + "\n", encoding="utf-8")
    print_summary(report, coverage)


class SourceContext:
    def __init__(
        self,
        *,
        dat_path: Path,
        localization_path: Path,
        appmanifest_path: Path,
        scenario_path: Path,
        dat_sha: str,
        localization_sha: str,
        appmanifest_sha: str,
        extractor_sha: str,
        genie_datfile_sha: str,
        genie_datfile_module: Path,
        appmanifest: dict[str, str],
        scenario_sha: str,
    ) -> None:
        self.dat_path = dat_path
        self.localization_path = localization_path
        self.appmanifest_path = appmanifest_path
        self.scenario_path = scenario_path
        self.dat_sha = dat_sha
        self.localization_sha = localization_sha
        self.appmanifest_sha = appmanifest_sha
        self.extractor_sha = extractor_sha
        self.genie_datfile_sha = genie_datfile_sha
        self.genie_datfile_module = genie_datfile_module
        self.appmanifest = appmanifest
        self.scenario_sha = scenario_sha


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build deterministic DAT-derived AoE Sim rules artifacts.")
    parser.add_argument("--dat", type=Path, default=DEFAULT_DAT)
    parser.add_argument("--localization", type=Path, default=DEFAULT_LOCALIZATION)
    parser.add_argument("--appmanifest", type=Path, default=DEFAULT_APPMANIFEST)
    parser.add_argument("--scenario", type=Path, default=DEFAULT_SCENARIO)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--scenario-coverage", type=Path, default=DEFAULT_SCENARIO_COVERAGE)
    return parser.parse_args()


def build_ruleset(dat: Any, strings: dict[int, str], context: SourceContext) -> dict[str, Any]:
    units = build_unit_records(dat, strings)
    terrains = build_terrain_records(dat, strings)
    terrain_restrictions = build_terrain_restrictions(dat)
    technologies = build_technology_records(dat, strings)
    effects = build_effect_records(dat)
    civilizations = build_civilization_records(dat, strings)
    tech_tree = build_tech_tree(dat.tech_tree)
    diagnostics = build_ruleset_diagnostics(dat, units)

    return drop_empty({
        "schemaVersion": "aoe-sim.ruleset.v1",
        "rulesetId": "aoe2de-current-24094652-dat-ce3530df",
        "displayName": "AoE II DE current DAT rules approximation",
        "sourceBuild": "steam-build-24094652",
        "fidelity": build_fidelity(context),
        "fixedPointScale": FIXED_POINT_SCALE,
        "stepMs": STEP_MS,
        "datVersion": dat.version,
        "engineContract": {
            "identity": "numeric-dat-ids",
            "labelPolicy": "Localization strings are labels only; numeric DAT IDs are identity.",
            "effectPolicy": "All raw effect commands are preserved; semantic interpretation is milestone-scoped.",
        },
        "terrain": terrains,
        "terrainRestrictions": terrain_restrictions,
        "units": units,
        "technologies": technologies,
        "effects": effects,
        "civilizations": civilizations,
        "techTree": tech_tree,
        "entityIndex": build_entity_index(units),
        "diagnostics": diagnostics,
        "provenance": build_provenance(context),
    })


def build_fidelity(context: SourceContext) -> dict[str, Any]:
    return {
        "status": "current-rules-approximation",
        "reason": (
            "Replay internal build 180059 is not proven to map exactly to Steam build "
            f"{context.appmanifest.get('buildid')}; temporal depot evidence is retained only as audit context."
        ),
        "replayEvidence": {
            "embeddedBuildVersion": REPLAY_BUILD_VERSION,
            "gameVersion": REPLAY_GAME_VERSION,
            "saveVersion": REPLAY_SAVE_VERSION,
            "recordingWindow": "around 2026-08-19/20",
        },
        "sourceEvidence": {
            "steamAppId": numeric_string(context.appmanifest.get("appid")),
            "steamBuildId": context.appmanifest.get("buildid"),
            "steamLastUpdatedUnix": numeric_string(context.appmanifest.get("LastUpdated")),
            "appmanifestMtimeUtc": mtime_utc(context.appmanifest_path),
            "datMtimeUtc": mtime_utc(context.dat_path),
        },
        "auditNotes": [
            "Steam depot cache evidence brackets the replay with manifests from 2026-08-18 and 2026-08-24.",
            "No authoritative internal replay build to Steam build mapping has been proven.",
            "DAT file mtime is retained as source audit context, not as exact-build proof.",
        ],
        "unsupportedClaim": (
            "This artifact does not claim exact AoE II DE engine parity or exact replay-build parity."
        ),
    }


def build_provenance(context: SourceContext) -> dict[str, Any]:
    return {
        "dat": artifact_reference(context.dat_path, context.dat_sha),
        "localization": artifact_reference(context.localization_path, context.localization_sha),
        "appmanifest": {
            **artifact_reference(context.appmanifest_path, context.appmanifest_sha),
            "steamAppId": numeric_string(context.appmanifest.get("appid")),
            "steamBuildId": context.appmanifest.get("buildid"),
            "steamLastUpdatedUnix": numeric_string(context.appmanifest.get("LastUpdated")),
            "mtimeUtc": mtime_utc(context.appmanifest_path),
        },
        "parser": {
            "id": "genieutils.datfile",
            "sha256": f"sha256:{context.genie_datfile_sha}",
            "sizeBytes": context.genie_datfile_module.stat().st_size,
            "project": "genieutils",
            "commit": GENIEUTILS_PINNED_COMMIT,
            "module": context.genie_datfile_module.name,
            "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        },
        "extractor": {
            "id": "tools/build-ruleset.py",
            "sha256": f"sha256:{context.extractor_sha}",
            "sizeBytes": Path(__file__).stat().st_size,
        },
        "generatedArtifact": {
            "id": "aoe2de-current-24094652-dat-ce3530df",
            "sha256": "sha256:self-excluded",
        },
    }


def build_terrain_records(dat: Any, strings: dict[int, str]) -> list[dict[str, Any]]:
    records = []
    for terrain_id, terrain in enumerate(dat.terrain_block.terrains):
        color = tuple_to_list(getattr(terrain, "colors", (0, 0, 0)))
        record = drop_empty({
            "id": terrain_id,
            "kind": slug(localized_name(strings, getattr(terrain, "string_id", None), getattr(terrain, "name", None))),
            "labels": {
                "localizedName": localized_name(strings, getattr(terrain, "string_id", None), getattr(terrain, "name", None)),
                "internalName": getattr(terrain, "name", None),
                "secondaryName": getattr(terrain, "name_2", None),
                "languageDllName": maybe_int(getattr(terrain, "string_id", None)),
            },
            "color": rgb_to_hex(color),
            "rgb": color,
            "passable": bool(getattr(terrain, "enabled", 0) and not bool(getattr(terrain, "is_water", 0))),
            "passability": {
                "source": "terrain-restriction-matrix",
                "note": "Actual movement/building passability is unit terrain-restriction dependent.",
            },
            "raw": pick_fields(terrain, [
                "enabled",
                "random",
                "is_water",
                "hide_in_editor",
                "slp",
                "sound_id",
                "wwise_sound_id",
                "wwise_sound_stop_id",
                "blend_priority",
                "blend_type",
                "passable_terrain",
                "impassable_terrain",
                "is_animated",
                "animation_frames",
                "pause_frames",
                "interval",
                "pause_between_loops",
                "frame",
                "draw_frame",
                "animate_last",
                "frame_changed",
                "drawn",
                "terrain_to_draw",
                "terrain_dimensions",
                "terrain_unit_masked_density",
                "terrain_unit_id",
                "terrain_unit_density",
                "terrain_unit_centering",
                "number_of_terrain_units_used",
                "phantom",
            ]),
            "frameData": clean_json(getattr(terrain, "frame_data", None)),
        })
        records.append(record)
    return records


def build_terrain_restrictions(dat: Any) -> list[dict[str, Any]]:
    records = []
    for restriction_id, restriction in enumerate(dat.terrain_restrictions):
        multipliers = [clean_number(value) for value in restriction.passable_buildable_dmg_multiplier]
        records.append({
            "id": restriction_id,
            "passableBuildableDamageMultiplier": multipliers,
            "passableTerrainIds": [
                terrain_id for terrain_id, value in enumerate(multipliers) if isinstance(value, (int, float)) and value > 0
            ],
            "blockedTerrainIds": [
                terrain_id for terrain_id, value in enumerate(multipliers) if isinstance(value, (int, float)) and value <= 0
            ],
            "terrainPassGraphics": [clean_json(item) for item in restriction.terrain_pass_graphics],
        })
    return records


def build_unit_records(dat: Any, strings: dict[int, str]) -> list[dict[str, Any]]:
    max_units = max(len(civ.units) for civ in dat.civs)
    records = []
    for unit_id in range(max_units):
        selected = first_unit_by_id(dat, unit_id)
        if selected is None:
            continue
        source_civ_id, unit = selected
        labels = unit_labels(unit, strings, unit_id)
        record = drop_empty({
            "id": unit_id,
            "kind": slug(labels["localizedName"]),
            "label": labels["localizedName"],
            "labels": labels,
            "sourceCivId": source_civ_id,
            "type": maybe_int(getattr(unit, "type", None)),
            "typeName": UNIT_TYPE_NAMES.get(getattr(unit, "type", None), f"type-{getattr(unit, 'type', 'unknown')}"),
            "classId": maybe_int(getattr(unit, "class_", None)),
            "baseId": maybe_int(getattr(unit, "base_id", None)),
            "copyId": maybe_int(getattr(unit, "copy_id", None)),
            "maxHp": max(0, clean_number(getattr(unit, "hit_points", None)) or 0),
            "speedFpPerSecond": speed_fp_per_second(unit),
            "radiusTiles": radius_tiles(unit),
            "token": renderer_token(unit, labels["localizedName"]),
            "movement": unit_movement(unit),
            "collision": unit_collision(unit),
            "economy": unit_economy(unit),
            "combat": unit_combat(unit),
            "projectile": unit_projectile(unit),
            "production": unit_production(unit),
            "building": unit_building(unit),
            "resourceStorages": [clean_json(storage) for storage in getattr(unit, "resource_storages", [])],
            "damageGraphics": [clean_json(graphic) for graphic in getattr(unit, "damage_graphics", [])],
            "rawBase": raw_base_fields(unit),
        })
        records.append(record)
    return records


def first_unit_by_id(dat: Any, unit_id: int) -> tuple[int, Any] | None:
    for civ_id, civ in enumerate(dat.civs):
        if unit_id < len(civ.units) and civ.units[unit_id] is not None:
            return civ_id, civ.units[unit_id]
    return None


def unit_labels(unit: Any, strings: dict[int, str], unit_id: int) -> dict[str, Any]:
    language_key = getattr(unit, "language_dll_name", None)
    internal_name = getattr(unit, "name", None)
    fallback = internal_name or f"Unit {unit_id}"
    return drop_empty({
        "localizedName": localized_name(strings, language_key, fallback),
        "internalName": internal_name,
        "languageDllName": maybe_int(language_key),
        "languageDllCreation": maybe_int(getattr(unit, "language_dll_creation", None)),
        "languageDllHelp": maybe_int(getattr(unit, "language_dll_help", None)),
        "languageDllHotkeyText": maybe_int(getattr(unit, "language_dll_hotkey_text", None)),
    })


def unit_movement(unit: Any) -> dict[str, Any]:
    return drop_empty({
        "speed": clean_number(getattr(unit, "speed", None)),
        "speedFpPerSecond": speed_fp_per_second(unit),
        "terrainRestriction": maybe_int(getattr(unit, "terrain_restriction", None)),
        "flyMode": maybe_int(getattr(unit, "fly_mode", None)),
        "hillMode": maybe_int(getattr(unit, "hill_mode", None)),
        "interactionMode": maybe_int(getattr(unit, "interaction_mode", None)),
        "turning": clean_json(getattr(unit, "dead_fish", None)),
    })


def unit_collision(unit: Any) -> dict[str, Any]:
    return drop_empty({
        "sizeX": clean_number(getattr(unit, "collision_size_x", None)),
        "sizeY": clean_number(getattr(unit, "collision_size_y", None)),
        "sizeZ": clean_number(getattr(unit, "collision_size_z", None)),
        "radiusTiles": radius_tiles(unit),
        "clearanceSize": tuple_to_list(getattr(unit, "clearance_size", None)),
        "obstructionType": maybe_int(getattr(unit, "obstruction_type", None)),
        "obstructionClass": maybe_int(getattr(unit, "obstruction_class", None)),
        "placementSideTerrain": tuple_to_list(getattr(unit, "placement_side_terrain", None)),
        "placementTerrain": tuple_to_list(getattr(unit, "placement_terrain", None)),
        "canBeBuiltOn": maybe_int(getattr(unit, "can_be_built_on", None)),
    })


def unit_economy(unit: Any) -> dict[str, Any]:
    bird = getattr(unit, "bird", None)
    return drop_empty({
        "resourceCapacity": clean_number(getattr(unit, "resource_capacity", None)),
        "resourceDecay": clean_number(getattr(unit, "resource_decay", None)),
        "resourceGatherGroup": maybe_int(getattr(unit, "resource_gather_group", None)),
        "enableAutoGather": maybe_int(getattr(unit, "enable_auto_gather", None)),
        "recyclable": maybe_int(getattr(unit, "recyclable", None)),
        "workRate": clean_number(getattr(bird, "work_rate", None)),
        "searchRadius": clean_number(getattr(bird, "search_radius", None)),
        "dropSites": tuple_to_list(getattr(bird, "drop_sites", None)),
        "tasks": build_tasks(getattr(bird, "tasks", [])),
    })


def unit_combat(unit: Any) -> dict[str, Any] | None:
    type_50 = getattr(unit, "type_50", None)
    if type_50 is None:
        return None
    return drop_empty({
        "baseArmor": maybe_int(getattr(type_50, "base_armor", None)),
        "attacks": attack_or_armor_records(getattr(type_50, "attacks", [])),
        "armors": attack_or_armor_records(getattr(type_50, "armours", [])),
        "defenseTerrainBonus": maybe_int(getattr(type_50, "defense_terrain_bonus", None)),
        "bonusDamageResistance": clean_number(getattr(type_50, "bonus_damage_resistance", None)),
        "maxRange": clean_number(getattr(type_50, "max_range", None)),
        "minRange": clean_number(getattr(type_50, "min_range", None)),
        "blastWidth": clean_number(getattr(type_50, "blast_width", None)),
        "blastAttackLevel": maybe_int(getattr(type_50, "blast_attack_level", None)),
        "blastDamage": clean_number(getattr(type_50, "blast_damage", None)),
        "reloadTime": clean_number(getattr(type_50, "reload_time", None)),
        "displayedReloadTime": clean_number(getattr(type_50, "displayed_reload_time", None)),
        "projectileUnitId": maybe_int(getattr(type_50, "projectile_unit_id", None)),
        "accuracyPercent": maybe_int(getattr(type_50, "accuracy_percent", None)),
        "accuracyDispersion": clean_number(getattr(type_50, "accuracy_dispersion", None)),
        "frameDelay": maybe_int(getattr(type_50, "frame_delay", None)),
        "breakOffCombat": maybe_int(getattr(type_50, "break_off_combat", None)),
        "graphicDisplacement": tuple_to_list(getattr(type_50, "graphic_displacement", None)),
        "displayedMeleeArmor": maybe_int(getattr(type_50, "displayed_melee_armour", None)),
        "displayedAttack": maybe_int(getattr(type_50, "displayed_attack", None)),
        "displayedRange": clean_number(getattr(type_50, "displayed_range", None)),
        "damageReflection": clean_number(getattr(type_50, "damage_reflection", None)),
        "friendlyFireDamage": clean_number(getattr(type_50, "friendly_fire_damage", None)),
        "interruptFrame": maybe_int(getattr(type_50, "interrupt_frame", None)),
        "garrisonFirepower": clean_number(getattr(type_50, "garrison_firepower", None)),
        "attackGraphic": maybe_int(getattr(type_50, "attack_graphic", None)),
        "attackGraphic2": maybe_int(getattr(type_50, "attack_graphic_2", None)),
    })


def unit_projectile(unit: Any) -> dict[str, Any] | None:
    projectile = getattr(unit, "projectile", None)
    if projectile is None:
        return None
    return clean_json(projectile)


def unit_production(unit: Any) -> dict[str, Any] | None:
    creatable = getattr(unit, "creatable", None)
    if creatable is None:
        return None
    return drop_empty({
        **pick_fields(creatable, [
            "rear_attack_modifier",
            "flank_attack_modifier",
            "creatable_type",
            "hero_mode",
            "max_charge",
            "recharge_rate",
            "charge_event",
            "charge_type",
            "charge_target",
            "charge_projectile_unit",
            "attack_priority",
            "invulnerability_level",
            "button_icon_id",
            "button_short_tooltip_id",
            "button_extended_tooltip_id",
            "button_hotkey_action",
            "min_conversion_time_mod",
            "max_conversion_time_mod",
            "conversion_chance_mod",
            "total_projectiles",
            "max_total_projectiles",
            "projectile_spawning_area",
            "secondary_projectile_unit",
            "special_ability",
            "displayed_pierce_armour",
        ]),
        "resourceCosts": resource_cost_records(getattr(creatable, "resource_costs", [])),
        "trainLocations": [clean_json(location) for location in getattr(creatable, "train_locations", [])],
    })


def unit_building(unit: Any) -> dict[str, Any] | None:
    building = getattr(unit, "building", None)
    if building is None:
        return None
    return drop_empty({
        **pick_fields(building, [
            "construction_graphic_id",
            "snow_graphic_id",
            "destruction_graphic_id",
            "destruction_rubble_graphic_id",
            "researching_graphic",
            "research_completed_graphic",
            "adjacent_mode",
            "graphics_angle",
            "disappears_when_built",
            "stack_unit_id",
            "foundation_terrain_id",
            "old_overlap_id",
            "tech_id",
            "can_burn",
            "head_unit",
            "transform_unit",
            "transform_sound",
            "wwise_transform_sound_id",
            "wwise_construction_sound_id",
            "garrison_type",
            "garrison_heal_rate",
            "garrison_repair_rate",
            "pile_unit",
        ]),
        "annexes": [clean_json(annex) for annex in getattr(building, "annexes", [])],
        "lootingTable": tuple_to_list(getattr(building, "looting_table", None)),
    })


def build_tasks(tasks: Any) -> list[dict[str, Any]]:
    return [clean_json(task) for task in tasks or []]


def attack_or_armor_records(items: Any) -> list[dict[str, Any]]:
    return [
        {
            "classId": maybe_int(getattr(item, "class_", None)),
            "amount": clean_number(getattr(item, "amount", None)),
        }
        for item in items or []
    ]


def resource_cost_records(items: Any) -> list[dict[str, Any]]:
    records = []
    for item in items or []:
        record = clean_json(item)
        if record.get("type") == -1 and record.get("amount") == 0 and record.get("flag") == 0:
            continue
        label = RESOURCE_TYPE_NAMES.get(record.get("type"))
        if label:
            record["label"] = label
        records.append(record)
    return records


def raw_base_fields(unit: Any) -> dict[str, Any]:
    result = {}
    for field in fields(unit):
        if field.name in UNIT_BASE_NESTED_FIELDS or field.name in EXTRACTED_UNIT_BASE_FIELDS:
            continue
        result[to_camel_case(field.name)] = clean_json(getattr(unit, field.name))
    return drop_empty(result)


def build_technology_records(dat: Any, strings: dict[int, str]) -> list[dict[str, Any]]:
    records = []
    for tech_id, tech in enumerate(dat.techs):
        localized = localized_name(strings, getattr(tech, "language_dll_name", None), getattr(tech, "name", None))
        records.append(drop_empty({
            "id": tech_id,
            "label": localized,
            "labels": {
                "localizedName": localized,
                "internalName": getattr(tech, "name", None),
                "languageDllName": maybe_int(getattr(tech, "language_dll_name", None)),
                "languageDllDescription": maybe_int(getattr(tech, "language_dll_description", None)),
                "languageDllHelp": maybe_int(getattr(tech, "language_dll_help", None)),
                "languageDllTechTree": maybe_int(getattr(tech, "language_dll_tech_tree", None)),
            },
            "requiredTechs": list(getattr(tech, "required_techs", ())),
            "resourceCosts": resource_cost_records(getattr(tech, "resource_costs", [])),
            "requiredTechCount": maybe_int(getattr(tech, "required_tech_count", None)),
            "civilizationId": maybe_int(getattr(tech, "civ", None)),
            "fullTechMode": maybe_int(getattr(tech, "full_tech_mode", None)),
            "effectId": maybe_int(getattr(tech, "effect_id", None)),
            "type": maybe_int(getattr(tech, "type", None)),
            "iconId": maybe_int(getattr(tech, "icon_id", None)),
            "repeatable": maybe_int(getattr(tech, "repeatable", None)),
            "researchLocations": [clean_json(location) for location in getattr(tech, "research_locations", [])],
        }))
    return records


def build_effect_records(dat: Any) -> list[dict[str, Any]]:
    records = []
    for effect_id, effect in enumerate(dat.effects):
        commands = []
        for index, command in enumerate(effect.effect_commands):
            operation = KNOWN_EFFECT_COMMAND_TYPES.get(getattr(command, "type", None))
            commands.append(drop_empty({
                "index": index,
                "type": maybe_int(getattr(command, "type", None)),
                "operation": operation,
                "a": clean_number(getattr(command, "a", None)),
                "b": clean_number(getattr(command, "b", None)),
                "c": clean_number(getattr(command, "c", None)),
                "attribute": ATTRIBUTE_NAMES.get(getattr(command, "c", None)),
                "d": clean_number(getattr(command, "d", None)),
            }))
        records.append({
            "id": effect_id,
            "name": effect.name,
            "commands": commands,
        })
    return records


def build_civilization_records(dat: Any, strings: dict[int, str]) -> list[dict[str, Any]]:
    records = []
    for civ_id, civ in enumerate(dat.civs):
        available_unit_ids = [unit_id for unit_id, unit in enumerate(civ.units) if unit is not None]
        records.append(drop_empty({
            "id": civ_id,
            "name": civ.name,
            "playerType": maybe_int(getattr(civ, "player_type", None)),
            "techTreeEffectId": maybe_int(getattr(civ, "tech_tree_id", None)),
            "teamBonusEffectId": maybe_int(getattr(civ, "team_bonus_id", None)),
            "iconSet": maybe_int(getattr(civ, "icon_set", None)),
            "resources": [
                {
                    "resourceId": index,
                    "label": RESOURCE_TYPE_NAMES.get(index),
                    "amount": clean_number(amount),
                }
                for index, amount in enumerate(civ.resources)
                if amount != 0
            ],
            "availableUnitIds": available_unit_ids,
        }))
    return records


def build_tech_tree(tech_tree: Any) -> dict[str, Any]:
    return {
        "totalUnitTechGroups": maybe_int(getattr(tech_tree, "total_unit_tech_groups", None)),
        "ages": [clean_json(item) for item in getattr(tech_tree, "tech_tree_ages", [])],
        "buildingConnections": [clean_json(item) for item in getattr(tech_tree, "building_connections", [])],
        "unitConnections": [clean_json(item) for item in getattr(tech_tree, "unit_connections", [])],
        "researchConnections": [clean_json(item) for item in getattr(tech_tree, "research_connections", [])],
    }


def build_entity_index(units: list[dict[str, Any]]) -> dict[str, Any]:
    building_ids = []
    projectile_ids = []
    resource_node_ids = []
    production_source_ids = []
    gatherer_ids = []
    combatant_ids = []
    for unit in units:
        unit_id = unit["id"]
        if unit.get("building"):
            building_ids.append(unit_id)
        if unit.get("projectile") or unit.get("type") == 60:
            projectile_ids.append(unit_id)
        economy = unit.get("economy") or {}
        if economy.get("resourceGatherGroup") not in (None, 0) or has_positive_storage(unit):
            resource_node_ids.append(unit_id)
        production = unit.get("production") or {}
        if production.get("trainLocations") or production.get("resourceCosts"):
            production_source_ids.append(unit_id)
        if economy.get("tasks"):
            gatherer_ids.append(unit_id)
        if unit.get("combat"):
            combatant_ids.append(unit_id)
    return {
        "unitIds": [unit["id"] for unit in units],
        "buildingIds": building_ids,
        "resourceNodeIds": resource_node_ids,
        "projectileIds": projectile_ids,
        "productionRuleIds": production_source_ids,
        "gatheringRuleIds": gatherer_ids,
        "combatRuleIds": combatant_ids,
    }


def has_positive_storage(unit: dict[str, Any]) -> bool:
    for storage in unit.get("resourceStorages", []):
        amount = storage.get("amount")
        if isinstance(amount, (int, float)) and amount > 0:
            return True
    return False


def build_ruleset_diagnostics(dat: Any, units: list[dict[str, Any]]) -> dict[str, Any]:
    effect_type_counts = Counter(command.type for effect in dat.effects for command in effect.effect_commands)
    effect_attribute_counts = Counter(
        command.c for effect in dat.effects for command in effect.effect_commands if command.type in {0, 4, 5}
    )
    known_types = set(KNOWN_EFFECT_COMMAND_TYPES)
    named_attributes = set(ATTRIBUTE_NAMES)
    unit_base_fields = [field.name for field in fields(first_unit_by_id(dat, 0)[1])]
    return {
        "counts": {
            "terrains": len(dat.terrain_block.terrains),
            "terrainRestrictions": len(dat.terrain_restrictions),
            "units": len(units),
            "civilizations": len(dat.civs),
            "technologies": len(dat.techs),
            "effects": len(dat.effects),
            "effectCommands": sum(effect_type_counts.values()),
            "graphicsNotBundled": len(dat.graphics),
            "soundsNotBundled": len(dat.sounds),
        },
        "unresolved": {
            "effectCommandTypes": [
                {
                    "type": type_id,
                    "count": count,
                    "operation": KNOWN_EFFECT_COMMAND_TYPES.get(type_id),
                    "reason": "raw-preserved-semantic-handler-pending"
                    if type_id in known_types
                    else "unknown-effect-command-type-raw-preserved",
                }
                for type_id, count in sorted(effect_type_counts.items())
                if type_id not in {0, 3, 4, 5, 101, 102, 103}
            ],
            "attributeIds": [
                {
                    "attributeId": attribute_id,
                    "count": count,
                    "attribute": ATTRIBUTE_NAMES.get(attribute_id),
                    "reason": "raw-preserved-attribute-handler-pending"
                    if attribute_id in named_attributes
                    else "unknown-attribute-id-raw-preserved",
                }
                for attribute_id, count in sorted(effect_attribute_counts.items())
                if attribute_id not in named_attributes
            ],
            "nonSemanticDatSections": [
                "graphics are referenced by numeric ID but bitmap/SLP assets are not bundled",
                "sounds are referenced by numeric ID but audio assets are not bundled",
                "random map generation tables are outside the replay-simulation rules contract",
            ],
        },
        "fieldCoverage": {
            "unitBaseFields": [to_camel_case(field) for field in unit_base_fields],
            "unitBaseResidualRawFields": [
                to_camel_case(field)
                for field in unit_base_fields
                if field not in UNIT_BASE_NESTED_FIELDS and field not in EXTRACTED_UNIT_BASE_FIELDS
            ],
            "unitBaseNestedFields": sorted(UNIT_BASE_NESTED_FIELDS),
            "unitGroups": {
                name: [to_camel_case(field) for field in fields_]
                for name, fields_ in sorted(UNIT_BASE_FIELD_GROUPS.items())
            },
            "effectCommandFields": ["type", "a", "b", "c", "d"],
        },
    }


def build_report(
    dat: Any,
    ruleset: dict[str, Any],
    context: SourceContext,
    semantic_hash: str,
    artifact_sha: str,
    artifact_size: int,
) -> dict[str, Any]:
    diagnostics = ruleset["diagnostics"]
    return {
        "schemaVersion": "aoe-sim.ruleset-report.v1",
        "rulesetId": ruleset["rulesetId"],
        "artifact": {
            "semanticSha256": f"sha256:{semantic_hash}",
            "fileSha256": f"sha256:{artifact_sha}",
            "sizeBytes": artifact_size,
        },
        "source": {
            "dat": ruleset["provenance"]["dat"],
            "localization": ruleset["provenance"]["localization"],
            "appmanifest": ruleset["provenance"]["appmanifest"],
            "parser": ruleset["provenance"]["parser"],
            "extractor": ruleset["provenance"]["extractor"],
        },
        "fidelity": ruleset["fidelity"],
        "counts": diagnostics["counts"],
        "entityIndexCounts": {key: len(value) for key, value in ruleset["entityIndex"].items()},
        "effectCommandTypeCounts": {
            str(key): value
            for key, value in sorted(Counter(command["type"] for effect in ruleset["effects"] for command in effect["commands"]).items())
        },
        "unresolved": diagnostics["unresolved"],
        "fieldCoverage": diagnostics["fieldCoverage"],
        "invariants": {
            "datHashMatchesExpected": context.dat_sha == EXPECTED_DAT_SHA256,
            "localizationHashMatchesExpected": context.localization_sha == EXPECTED_LOCALIZATION_SHA256,
            "steamBuildMatchesExpected": context.appmanifest.get("buildid") == EXPECTED_STEAM_BUILD_ID,
            "unitIdsAreUnique": unique_ids(ruleset["units"]),
            "terrainIdsAreUnique": unique_ids(ruleset["terrain"]),
            "technologyIdsAreUnique": unique_ids(ruleset["technologies"]),
            "effectIdsAreUnique": unique_ids(ruleset["effects"]),
            "rawEffectCommandFieldsPreserved": all(
                {"type", "a", "b", "c", "d"}.issubset(command)
                for effect in ruleset["effects"]
                for command in effect["commands"]
            ),
        },
    }


def build_scenario_coverage(
    scenario: dict[str, Any],
    ruleset: dict[str, Any],
    context: SourceContext,
    ruleset_file_sha: str,
) -> dict[str, Any]:
    units_by_id = {unit["id"]: unit for unit in ruleset["units"]}
    techs_by_id = {tech["id"]: tech for tech in ruleset["technologies"]}
    entity_rows = []
    unresolved = []
    for entity in sorted(scenario["entities"], key=lambda item: (item.get("sourceIndex", 0), item["id"])):
        data_id = entity.get("dataId")
        unit = units_by_id.get(data_id)
        row = drop_empty({
            "entityId": entity["id"],
            "sourceInstanceId": entity.get("sourceInstanceId"),
            "dataId": data_id,
            "kind": entity.get("kind"),
            "label": entity.get("label"),
            "playerId": entity.get("playerId"),
            "resolved": unit is not None,
            "ruleLabel": unit.get("label") if unit else None,
        })
        if unit is None:
            row["reason"] = "starting-entity-data-id-missing-from-ruleset"
            unresolved.append({
                "scope": "startingEntity",
                "entityId": entity["id"],
                "dataId": data_id,
                "reason": row["reason"],
            })
        entity_rows.append(row)

    command_refs = collect_command_references(scenario)
    unit_refs = command_reference_rows(command_refs["unitIds"], units_by_id, "command-unit-id-missing-from-ruleset")
    building_refs = command_reference_rows(
        command_refs["buildingIds"], units_by_id, "command-building-id-missing-from-ruleset"
    )
    technology_refs = command_reference_rows(
        command_refs["technologyIds"], techs_by_id, "command-technology-id-missing-from-ruleset"
    )
    for bucket, scope in ((unit_refs, "commandUnit"), (building_refs, "commandBuilding"), (technology_refs, "commandTechnology")):
        for row in bucket:
            if not row["resolved"]:
                unresolved.append({
                    "scope": scope,
                    "id": row["id"],
                    "reason": row["reason"],
                })

    return {
        "schemaVersion": "aoe-sim.ruleset-scenario-coverage.v1",
        "scenario": {
            "id": scenario["scenarioId"],
            "displayName": scenario["displayName"],
            "sha256": f"sha256:{context.scenario_sha}",
            "replayBuildVersion": scenario.get("versions", {}).get("buildVersion"),
            "gameVersion": scenario.get("versions", {}).get("gameVersion"),
        },
        "ruleset": {
            "id": ruleset["rulesetId"],
            "sha256": f"sha256:{ruleset_file_sha}",
            "semanticSha256": ruleset["provenance"]["generatedArtifact"]["sha256"],
            "fidelityStatus": ruleset["fidelity"]["status"],
        },
        "counts": {
            "startingEntities": len(entity_rows),
            "resolvedStartingEntities": sum(1 for row in entity_rows if row["resolved"]),
            "commandUnitIds": len(unit_refs),
            "commandBuildingIds": len(building_refs),
            "commandTechnologyIds": len(technology_refs),
            "unresolved": len(unresolved),
        },
        "startingEntities": entity_rows,
        "commandReferences": {
            "unitIds": unit_refs,
            "buildingIds": building_refs,
            "technologyIds": technology_refs,
        },
        "unresolved": unresolved,
    }


def collect_command_references(scenario: dict[str, Any]) -> dict[str, dict[int, dict[str, Any]]]:
    refs: dict[str, dict[int, dict[str, Any]]] = {
        "unitIds": defaultdict(lambda: {"commandIds": [], "labels": set()}),
        "buildingIds": defaultdict(lambda: {"commandIds": [], "labels": set()}),
        "technologyIds": defaultdict(lambda: {"commandIds": [], "labels": set()}),
    }
    key_map = {
        "unit_id": ("unitIds", "unit"),
        "building_id": ("buildingIds", "building"),
        "technology_id": ("technologyIds", "technology"),
    }
    for command in scenario.get("commands", []):
        parameters = command.get("parameters") or {}
        for parameter_key, (bucket, label_key) in key_map.items():
            value = parameters.get(parameter_key)
            if not isinstance(value, int) or isinstance(value, bool):
                continue
            refs[bucket][value]["commandIds"].append(command["id"])
            label = parameters.get(label_key)
            if isinstance(label, str) and label:
                refs[bucket][value]["labels"].add(label)
    return refs


def command_reference_rows(
    refs: dict[int, dict[str, Any]],
    rules_by_id: dict[int, dict[str, Any]],
    unresolved_reason: str,
) -> list[dict[str, Any]]:
    rows = []
    for id_, data in sorted(refs.items()):
        rule = rules_by_id.get(id_)
        rows.append(drop_empty({
            "id": id_,
            "resolved": rule is not None,
            "ruleLabel": rule.get("label") if rule else None,
            "sourceLabels": sorted(data["labels"]),
            "commandCount": len(data["commandIds"]),
            "commandIds": sorted(data["commandIds"]),
            "reason": None if rule else unresolved_reason,
        }))
    return rows


def load_localization(path: Path) -> dict[int, str]:
    strings: dict[int, str] = {}
    pattern = re.compile(r'^\s*(\d+)\s+"(.*)"\s*$')
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line or line.lstrip().startswith("//"):
            continue
        match = pattern.match(line)
        if not match:
            continue
        key = int(match.group(1))
        quoted = f'"{match.group(2)}"'
        try:
            value = json.loads(quoted)
        except json.JSONDecodeError:
            value = match.group(2).replace(r"\"", '"')
        if value:
            strings[key] = value
    return strings


def localized_name(strings: dict[int, str], language_key: Any, fallback: str | None) -> str:
    if isinstance(language_key, int) and language_key in strings:
        return strings[language_key]
    return fallback or "Unknown"


def renderer_token(unit: Any, localized: str) -> str:
    label = localized.lower()
    type_id = getattr(unit, "type", None)
    if type_id == 80:
        return "marker"
    if getattr(unit, "resource_gather_group", 0) not in (0, None):
        return "resource"
    if any(token in label for token in ("tree", "bush", "mine", "stone", "gold", "forage", "fruit")):
        return "resource"
    if "villager" in label:
        return "villager"
    if "scout" in label:
        return "scout"
    return "marker"


def speed_fp_per_second(unit: Any) -> int:
    speed = getattr(unit, "speed", None)
    if not isinstance(speed, (int, float)) or not math.isfinite(float(speed)):
        return 0
    return int(round(float(speed) * FIXED_POINT_SCALE))


def radius_tiles(unit: Any) -> int | float:
    x = getattr(unit, "collision_size_x", None)
    y = getattr(unit, "collision_size_y", None)
    values = [float(value) for value in (x, y) if isinstance(value, (int, float)) and math.isfinite(float(value))]
    if not values:
        return 0.25
    return clean_number(max(values), digits=4) or 0.25


def pick_fields(obj: Any, names: list[str]) -> dict[str, Any]:
    result = {}
    for name in names:
        if hasattr(obj, name):
            result[to_camel_case(name)] = clean_json(getattr(obj, name))
    return drop_empty(result)


def clean_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return clean_number(value)
    if isinstance(value, str):
        return value
    if isinstance(value, tuple):
        return [clean_json(item) for item in value]
    if isinstance(value, list):
        return [clean_json(item) for item in value]
    if is_dataclass(value):
        return drop_empty({to_camel_case(field.name): clean_json(getattr(value, field.name)) for field in fields(value)})
    return str(value)


def clean_number(value: Any, digits: int = 6) -> int | float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)):
        return None
    rounded = round(float(value), digits)
    if abs(rounded) >= 1_000_000_000:
        return rounded
    return int(rounded) if rounded.is_integer() else rounded


def maybe_int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def tuple_to_list(value: Any) -> list[Any] | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return [clean_json(item) for item in value]
    return None


def drop_empty(value: dict[str, Any]) -> dict[str, Any]:
    return {
        key: item
        for key, item in value.items()
        if item is not None and item != {} and item != []
    }


def slug(value: str) -> str:
    text = value.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "unknown"


def to_camel_case(value: str) -> str:
    value = value.rstrip("_")
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def rgb_to_hex(values: list[Any] | None) -> str:
    if not values or len(values) < 3:
        return "#34412c"
    red, green, blue = (clamp_color(value) for value in values[:3])
    return f"#{red:02x}{green:02x}{blue:02x}"


def clamp_color(value: Any) -> int:
    return max(0, min(255, int(value) if isinstance(value, int) else 0))


def parse_appmanifest(text: str) -> dict[str, str]:
    return {match.group(1): match.group(2) for match in re.finditer(r'"([^"]+)"\s+"([^"]*)"', text)}


def artifact_reference(path: Path, digest: str) -> dict[str, Any]:
    return {
        "id": path.name,
        "sha256": f"sha256:{digest}",
        "sizeBytes": path.stat().st_size,
    }


def numeric_string(value: str | None) -> int | str | None:
    if value is None:
        return None
    return int(value) if value.isdigit() else value


def mtime_utc(path: Path) -> str:
    import datetime as _datetime

    return _datetime.datetime.fromtimestamp(path.stat().st_mtime, _datetime.UTC).replace(microsecond=0).isoformat()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def require_file(path: Path, label: str) -> None:
    if not path.is_file():
        raise SystemExit(f"{label} is unavailable: {path}")


def unique_ids(items: list[dict[str, Any]]) -> bool:
    ids = [item["id"] for item in items]
    return len(ids) == len(set(ids))


def assert_no_path_leaks(value: Any, label: str) -> None:
    leaks = []

    def visit(item: Any, path: str) -> None:
        if isinstance(item, str):
            if "/home/" in item or "/tmp/" in item or re.search(r"[A-Za-z]:\\\\", item):
                leaks.append(f"{path}: {item}")
            return
        if isinstance(item, list):
            for index, child in enumerate(item):
                visit(child, f"{path}[{index}]")
            return
        if isinstance(item, dict):
            for key, child in item.items():
                visit(child, f"{path}.{key}")

    visit(value, label)
    if leaks:
        raise SystemExit(f"Refusing to write {label} with machine-local paths: {leaks[:3]}")


def print_summary(report: dict[str, Any], coverage: dict[str, Any]) -> None:
    print(stable_json({
        "ruleset": report["rulesetId"],
        "artifact": report["artifact"],
        "counts": report["counts"],
        "fidelityStatus": report["fidelity"]["status"],
        "scenarioCoverage": coverage["counts"],
    }))


if __name__ == "__main__":
    main()
