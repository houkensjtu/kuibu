#!/usr/bin/env bash
# Regenerate pack-gen/models/*.py from schema/*.schema.json.
# Run after editing either schema file. Requires the pack-gen venv (see pack-gen/README.md).
set -euo pipefail
cd "$(dirname "$0")/../.."

PY=pack-gen/.venv/Scripts/python.exe

"$PY" -m datamodel_code_generator \
  --input schema/pack.schema.json \
  --input-file-type jsonschema \
  --output pack-gen/models/pack.py \
  --output-model-type pydantic_v2.BaseModel \
  --target-python-version 3.12 \
  --use-schema-description \
  --encoding utf-8 \
  --disable-timestamp

"$PY" -m datamodel_code_generator \
  --input schema/events.schema.json \
  --input-file-type jsonschema \
  --output pack-gen/models/events.py \
  --output-model-type pydantic_v2.BaseModel \
  --target-python-version 3.12 \
  --use-schema-description \
  --encoding utf-8 \
  --disable-timestamp

# The Checkin event's "date" field has the same name as its type (datetime.date).
# Pydantic v2 can't resolve that self-referential annotation ("field name clashing
# with a type annotation"), so alias the import to break the naming collision.
sed -i \
  -e 's/from datetime import date, datetime/from datetime import date as _date, datetime/' \
  -e 's/date: date = Field(/date: _date = Field(/' \
  pack-gen/models/events.py

echo "regenerated pack-gen/models/pack.py and pack-gen/models/events.py"
