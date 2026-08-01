import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from models.pack import ContentPack

SAMPLE_PACK_DIR = Path(__file__).parents[2] / "schema" / "examples" / "sample-pack"


def _load_sample_pack_dict():
    return {
        "manifest": json.loads((SAMPLE_PACK_DIR / "manifest.json").read_text(encoding="utf-8")),
        "blocks": json.loads((SAMPLE_PACK_DIR / "blocks.json").read_text(encoding="utf-8")),
        "items": json.loads((SAMPLE_PACK_DIR / "items.json").read_text(encoding="utf-8")),
        "questions": json.loads((SAMPLE_PACK_DIR / "questions.json").read_text(encoding="utf-8")),
        "exercises": json.loads((SAMPLE_PACK_DIR / "exercises.json").read_text(encoding="utf-8")),
        "recap_checkpoints": json.loads((SAMPLE_PACK_DIR / "recap_checkpoints.json").read_text(encoding="utf-8")),
    }


def test_sample_pack_is_valid():
    pack = ContentPack(**_load_sample_pack_dict())
    assert len(pack.blocks) == 3
    assert len(pack.items) == 2
    assert len(pack.questions) == 2
    assert len(pack.exercises) == 1
    assert len(pack.recap_checkpoints) == 1


def test_sample_pack_rejects_corrupted_field():
    data = _load_sample_pack_dict()
    # est_seconds must be an integer >= 1; corrupt it to a string.
    data["blocks"][0]["est_seconds"] = "not-a-number"

    with pytest.raises(ValidationError):
        ContentPack(**data)
