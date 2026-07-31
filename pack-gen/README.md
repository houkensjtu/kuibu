# pack-gen

构建期工具（Python）。从 `schema/*.schema.json` 生成 pydantic 模型，之后（M3）会调 LLM 把源文件切成内容包。

## 环境

```
python -m venv pack-gen/.venv
pack-gen/.venv/Scripts/python.exe -m pip install -r pack-gen/requirements.txt
```

## 重新生成模型

改了 `schema/pack.schema.json` 或 `schema/events.schema.json` 之后：

```
bash pack-gen/scripts/gen_models.sh
```

生成的 `pack-gen/models/*.py` 不要手改——改 schema，重新跑脚本。

## 跑测试

```
pack-gen/.venv/Scripts/python.exe -m pytest pack-gen/
```
