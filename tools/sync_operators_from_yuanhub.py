"""Sync the YuanHub public operator catalog and frontend avatar assets."""

import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urljoin

import requests
from PIL import Image, ImageOps

from sync_operators import GAME_OPTIONS, _pinyin_pair

ROOT = Path(__file__).resolve().parent.parent
OPERATORS_FILE = ROOT / "src/models/generated/operators.json"
AVATARS_DIR = ROOT / "public/assets/operator-avatars"
MANIFEST_FILE = ROOT / "tools/yuanhub-avatar-manifest.json"
BASE_URL = (os.getenv("YUANHUB_BASE_URL") or "https://api-hub.maayuan.com").rstrip("/")
CATALOG_URL = os.getenv("YUANHUB_CATALOG_URL") or f"{BASE_URL}/open-api/operator/catalog"
V1_CATALOG_URL = os.getenv("YUANHUB_V1_CATALOG_URL") or f"{BASE_URL}/v1/operator/catalog"
HEADERS = {"User-Agent": "MaaYuan-Share-Operator-Sync/1.0"}


def fetch(url):
    response = requests.get(url, headers=HEADERS, timeout=15)
    if response.status_code != 200:
        raise requests.HTTPError(f"HTTP {response.status_code} for {url}")
    return response


def clean_disc(disc):
    fields = {key: disc[key] for key in ("ot_name", "abbreviation") if disc.get(key)}
    fields["color"] = disc.get("color") or "金"
    if disc.get("desp"):
        fields["desp"] = disc["desp"]
    return fields


def disc_names(disc):
    name = disc.get("ot_name")
    aliases = disc.get("aliases", [])
    if not isinstance(name, str) or not name.strip():
        raise ValueError("命盘缺少标准名")
    if not isinstance(aliases, list) or any(not isinstance(a, str) or not a.strip() for a in aliases):
        raise ValueError(f"「{name}」的 aliases 必须是非空名称的列表")
    return {name, *aliases}


def adapt_discs(operator_id, previous, incoming):
    # 旧作业用从 1 开始的数组下标保存命盘，每个旧槽位必须唯一对应一个源词条。
    names = [disc_names(disc) for disc in incoming]
    by_name = {}
    for index, entry_names in enumerate(names):
        if operator_id == "char_133_zhudali" and "生命低时攻击提升" in entry_names:
            entry_names.add("生命低时提升攻击")
        for name in sorted(entry_names):
            if name in by_name:
                raise ValueError(f"源词条 {by_name[name] + 1}、{index + 1} 共用名称「{name}」")
            by_name[name] = index

    slots = {}
    conflicts = []
    for slot, disc in enumerate(previous, 1):
        old_names = disc_names(disc)
        # 飞书把高顺旧第 10 槽的中天错录成第 1 槽的阳明；重名不能继承为普攻的别名。
        if (operator_id == "char_135_gaoshun" and slot == 10
                and previous[0]["ot_name"] == disc["ot_name"] == "技能伤害中幅增加"):
            old_names = {"普攻伤害中幅增加"}
        matches = {by_name[name] for name in old_names if name in by_name}
        label = f"旧槽位 {slot}「{disc['ot_name']}」"
        if not matches:
            conflicts.append(f"{label} 在源目录中找不到对应词条")
        elif len(matches) > 1:
            conflicts.append(f"{label} 匹配多个源槽位 {sorted(i + 1 for i in matches)}")
        else:
            index = matches.pop()
            if index in slots:
                conflicts.append(f"{label} 与旧槽位 {slots[index]} 同时指向源槽位 {index + 1}")
            else:
                slots[index] = slot
                names[index].update(old_names)
                for name in old_names:
                    by_name[name] = index
    if conflicts:
        raise ValueError("；".join(conflicts))

    ordered = []
    for index in [*slots, *(i for i in range(len(incoming)) if i not in slots)]:
        disc = clean_disc(incoming[index])
        aliases = sorted(names[index] - {disc["ot_name"]})
        if aliases:
            disc["aliases"] = aliases
        ordered.append(disc)
    return ordered


def clean_operator(operator):
    operator_id = operator["id"]
    name = operator["name"]
    if (
        not isinstance(operator_id, str)
        or not operator_id.strip()
        or operator_id in {".", ".."}
        or any(char in operator_id for char in ("/", "\\", "\0"))
    ):
        raise ValueError(f"Invalid operator id: {operator_id!r}")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"Invalid operator name for {operator_id}: {name!r}")

    alias = operator.get("alias") or ""
    if not alias.strip():
        py_full, py_initials = _pinyin_pair(name)
        alias = f"{py_full} {py_initials} “{name}” {name}".strip()

    games = operator.get("games") or []
    return {
        "id": operator_id,
        "name": name,
        "name_en": operator.get("name_en") or name,
        "alias": alias,
        "alt_name": operator.get("alt_name") or name,
        "rarity": int(operator["rarity"]),
        "prof": string_list(operator, "prof"),
        "subProf": string_list(operator, "subProf"),
        "games": [game for game in GAME_OPTIONS if game in games] or list(GAME_OPTIONS),
    }


def adapt_operators(previous, incoming):
    sources = {row["id"]: row for row in incoming}
    if len(sources) != len(incoming):
        raise ValueError("YuanHub catalog contains duplicate operator ids")
    # 飞书曾生成空名、无命盘的占位行；它们没有可继承的业务槽位。
    published = {row["id"]: row["discs"] for row in previous if row["name"] or row["discs"]}
    conflicts = [f"{key}：源目录缺少已发布密探" for key in published if key not in sources]
    operators = []
    for key in dict.fromkeys([*published, *sources]):
        if key not in sources:
            continue
        source = sources[key]
        operator = clean_operator(source)
        try:
            operator["discs"] = adapt_discs(key, published.get(key, []), source["discs"])
        except ValueError as error:
            conflicts.append(f"{key}（{operator['name']}）：{error}")
        operators.append(operator)
    if conflicts:
        raise ValueError("无法兼容已发布目录，本轮停止同步：\n" + "\n".join(conflicts))
    return operators


def string_list(operator, key):
    values = operator.get(key)
    if values is None:
        return []
    if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
        raise ValueError(f"{operator['id']} has an invalid {key} list")
    return values


def avatar_sources(operators):
    sources = {
        operator["id"]: (operator.get("avatar_url"), operator.get("avatar_sha256"))
        for operator in operators
    }
    if any(url for url, _ in sources.values()):
        return sources

    fallback = fetch(V1_CATALOG_URL).json()["data"]["operators"]
    if not isinstance(fallback, list):
        raise ValueError("YuanHub v1 operators must be a list")
    return {
        operator["id"]: (operator.get("avatar"), operator.get("avatarSha256"))
        for operator in fallback
    }


def write_json(path, value, *, sort_keys=False):
    content = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=sort_keys) + "\n"
    encoded = content.encode("utf-8")
    if path.is_file() and path.read_bytes() == encoded:
        return
    with TemporaryDirectory(dir=path.parent) as temp_dir:
        staged = Path(temp_dir) / path.name
        staged.write_bytes(encoded)
        staged.replace(path)


def download_avatar(url, paths):
    if not isinstance(url, str) or not url.strip():
        raise ValueError("Invalid avatar URL")
    response = fetch(urljoin(f"{BASE_URL}/", url))
    with Image.open(io.BytesIO(response.content), formats=["WEBP"]) as original:
        img = original.convert("RGBA")
    lanczos = Image.Resampling.LANCZOS
    image_192 = ImageOps.fit(img, (192, 192), method=lanczos, centering=(0.5, 0.5))
    image_96 = ImageOps.fit(img, (96, 96), method=lanczos, centering=(0.5, 0.5))
    image_32 = image_96.resize((32, 32), lanczos)

    AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=AVATARS_DIR) as temp_dir:
        staged = []
        for image, quality, path in zip((image_192, image_96, image_32), (84, 80, 78), paths):
            path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = Path(temp_dir) / f"{path.parent.name}.webp"
            image.save(temp_path, "WEBP", quality=quality, method=6)
            staged.append((temp_path, path))

        # Replace missing sizes last so an interrupted repair stays eligible for retry.
        for temp_path, path in sorted(staged, key=lambda entry: not entry[1].is_file()):
            temp_path.replace(path)


def sync_avatars(operator_ids, sources, manifest):
    for operator_id in operator_ids:
        url, sha256 = sources.get(operator_id, (None, None))
        if not url:
            manifest.pop(operator_id, None)
            continue

        paths = [AVATARS_DIR / f"webp{size}" / f"{operator_id}.webp" for size in (192, 96, 32)]
        all_present = all(path.is_file() for path in paths)
        previous_sha256 = manifest.get(operator_id)
        changed = sha256 and previous_sha256 and previous_sha256 != sha256
        if not all_present or changed:
            try:
                download_avatar(url, paths)
            except (requests.RequestException, OSError, ValueError, Image.DecompressionBombError) as error:
                print(f"::warning::YuanHub avatar sync failed for {operator_id}: {error}")
                continue
        if sha256:
            manifest[operator_id] = sha256


def main():
    catalog = fetch(CATALOG_URL).json()
    for key in ("OPERATORS", "PROFESSIONS"):
        values = catalog.get(key)
        if not isinstance(values, list) or not values:
            raise ValueError(f"YuanHub {key} must be a non-empty list")

    previous_catalog = json.loads(OPERATORS_FILE.read_text(encoding="utf-8"))
    operators = adapt_operators(previous_catalog["OPERATORS"], catalog["OPERATORS"])
    operator_ids = [operator["id"] for operator in operators]

    sources = avatar_sources(catalog["OPERATORS"])
    manifest = {}
    if MANIFEST_FILE.is_file():
        previous = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
        manifest = {
            operator_id: previous[operator_id]
            for operator_id in operator_ids
            if operator_id in previous
        }

    sync_avatars(operator_ids, sources, manifest)
    write_json(OPERATORS_FILE, {"OPERATORS": operators, "PROFESSIONS": catalog["PROFESSIONS"]})
    if manifest or MANIFEST_FILE.is_file():
        write_json(MANIFEST_FILE, manifest, sort_keys=True)


if __name__ == "__main__":
    main()
