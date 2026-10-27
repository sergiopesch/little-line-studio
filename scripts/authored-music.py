"""Read the fixed lesson music registry without provider access or credentials."""
import json
from pathlib import Path
import re
import subprocess


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate authored music keys.")
        value[key] = item
    return value


def read_catalogue(root):
    root = Path(root)
    path = root / "src/lesson-music-catalogue.json"
    if path.is_symlink() or path.parent.is_symlink() or not path.is_file() or path.stat().st_size > 65536:
        raise ValueError("Invalid authored music registry.")
    registry = json.loads(path.read_text(), object_pairs_hook=unique_object)
    program = """
      import { LESSONS } from './src/lesson-catalogue.js';
      console.log(JSON.stringify(LESSONS.map(({id,level,musicId})=>({id,level,musicId:musicId??null}))));
    """
    lessons = json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e", program], cwd=root,
        text=True, stderr=subprocess.PIPE, timeout=30))
    if not isinstance(registry, dict) or not isinstance(lessons, list) or len(lessons) != 30:
        raise ValueError("Invalid authored lesson music coverage.")
    if any(not isinstance(lesson, dict) or not isinstance(lesson.get("id"), str)
           or not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", lesson["id"]) for lesson in lessons):
        raise ValueError("Invalid authored lesson identities.")
    by_id = {lesson["id"]: lesson for lesson in lessons}
    if len(by_id) != 30:
        raise ValueError("Duplicate authored lesson identities.")
    assigned = {lesson["id"]: lesson["musicId"] for lesson in lessons if lesson.get("musicId") is not None}
    if set(assigned) != set(registry) or any(name != music_id for name, music_id in assigned.items()):
        raise ValueError("Lesson music must match its exact authored drawing identity.")
    for name, specification in registry.items():
        if (not isinstance(specification, dict) or set(specification) != {"level", "seconds", "prompt"}
                or specification["level"] not in ("basic", "intermediate", "expert")
                or specification["level"] != by_id[name]["level"]
                or type(specification["seconds"]) is not int or specification["seconds"] != 90
                or not isinstance(specification["prompt"], str) or not specification["prompt"].strip()
                or len(specification["prompt"]) > 2000):
            raise ValueError("Invalid authored lesson music specification.")
    return registry
