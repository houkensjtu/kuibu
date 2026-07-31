from datetime import datetime

from models.pack import ContentPack, Manifest, Block, KnowledgeItem, Question, Type
from models.events import Event, SessionStart


def test_content_pack_round_trip():
    pack = ContentPack(
        manifest=Manifest(
            schema_version="0.1.0",
            book_id="sicp",
            title="Structure and Interpretation of Computer Programs",
            author="Abelson & Sussman",
            license="CC-BY-SA-4.0",
            source="https://mitp-content-server.mit.edu/sicp/",
            generated_at=datetime(2026, 7, 31, 12, 0, 0),
            generator_version="0.1.0",
        ),
        blocks=[
            Block(
                id="b0001",
                seq=1,
                section_path=["1", "1.1", "1.1.1"],
                section_title="The Elements of Programming",
                content_md="...",
                est_seconds=150,
                recap_md="表达式与求值。",
            )
        ],
        items=[
            KnowledgeItem(
                id="k0001",
                block_ids=["b0001"],
                statement="组合式的求值遵循先求值再应用的规则。",
                question_ids=["q0001"],
            )
        ],
        questions=[
            Question(
                id="q0001",
                item_id="k0001",
                type=Type.single_choice,
                prompt="以下哪个是组合式求值的第一步？",
                options=["求值各子表达式", "打印结果", "跳过求值", "报错"],
                answer_index=0,
                explanation="求值组合式先递归求值运算符和运算对象。",
            )
        ],
    )

    assert pack.manifest.book_id == "sicp"
    assert pack.model_dump()["blocks"][0]["id"] == "b0001"


def test_event_session_start():
    event = Event(
        SessionStart(
            id="e0001",
            ts=datetime(2026, 7, 31, 22, 0, 0),
            type="session_start",
            book_id="sicp",
            target_seconds=720,
        )
    )

    assert event.root.type == "session_start"
