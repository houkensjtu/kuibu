"""
epub 是标准 zip 容器：`META-INF/container.xml` 指向 `content.opf`，OPF 的
`<spine>` 按 idref 顺序决定阅读顺序（不是 `<manifest>` 里的文件列表顺序）。
这部分逻辑跟"章节到底怎么在正文里标记"完全无关，Gatsby（`<div id=
"chapter-N">`）和西游记（纯文本转出来的 `<p>` 流 + 正则识别"第…回"）两种
epub 结构都要用到同一套 zip/OPF 解析，抽成共用模块，避免 EpubAdapter 和
后续的 Gutenberg 纯文本类 adapter 各写一份。
"""

import zipfile
from typing import List
from xml.etree import ElementTree as ET


def read_spine_documents(epub_path: str) -> List[str]:
    """按 spine 阅读顺序，返回每个内容文件解码后的原始 HTML 字符串。"""
    with zipfile.ZipFile(epub_path) as zf:
        opf_path = _find_opf_path(zf)
        opf_dir = opf_path.rsplit("/", 1)[0] + "/" if "/" in opf_path else ""
        hrefs = _spine_hrefs(zf, opf_path, opf_dir)
        return [zf.read(href).decode("utf-8") for href in hrefs]


def _find_opf_path(zf: zipfile.ZipFile) -> str:
    container = ET.fromstring(zf.read("META-INF/container.xml"))
    ns = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
    rootfile = container.find(".//c:rootfile", ns)
    if rootfile is None:
        raise ValueError(f"{zf.filename}: META-INF/container.xml has no <rootfile>")
    return rootfile.attrib["full-path"]


def _spine_hrefs(zf: zipfile.ZipFile, opf_path: str, opf_dir: str) -> List[str]:
    opf = ET.fromstring(zf.read(opf_path))
    ns = {"opf": "http://www.idpf.org/2007/opf"}

    href_by_id = {
        item.attrib["id"]: item.attrib["href"] for item in opf.findall(".//opf:manifest/opf:item", ns)
    }
    spine_idrefs = [itemref.attrib["idref"] for itemref in opf.findall(".//opf:spine/opf:itemref", ns)]
    return [opf_dir + href_by_id[idref] for idref in spine_idrefs if idref in href_by_id]
