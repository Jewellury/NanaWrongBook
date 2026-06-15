"""Extract formula alt text and structure from DOCX XML."""
import zipfile
from lxml import etree
import os

DOCX_PATH = "e:/nana/doc/research/精品解析：2024年新课标全国Ⅰ卷数学真题（解析版）.docx"
OUT_DIR = "e:/nana/doc/research/extracted/2024"

NSMAP = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'mc': 'http://schemas.markup-compatibility/2006',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
    'v': 'urn:schemas-microsoft-com:vml',
    'o': 'urn:schemas-microsoft-com:office:office',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
}

with zipfile.ZipFile(DOCX_PATH, 'r') as z:
    xml_content = z.read('word/document.xml')

root = etree.fromstring(xml_content)

# Find ALL document properties (alt text) for images
docPrs = root.findall('.//wp:docPr', NSMAP)
print(f"Found {len(docPrs)} drawing document properties")
for i, docPr in enumerate(docPrs[:20]):
    name = docPr.get('name', '')
    descr = docPr.get('descr', '')
    title = docPr.get('title', '')
    rid = docPr.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id', '')
    if name or descr or title:
        print(f"  [{i}] name='{name}' descr='{descr[:80]}' title='{title}'")

# Find all paragraphs (w:p)
paragraphs = root.findall('.//w:p', NSMAP)
print(f"\nFound {len(paragraphs)} paragraphs")

# For each paragraph, extract text runs + identify images/OLE objects
output = []
for p_idx, para in enumerate(paragraphs):
    # Get all text
    texts = []
    for t in para.findall('.//w:t', NSMAP):
        if t.text:
            texts.append(t.text)
    text = ''.join(texts)

    # Get OLE objects
    ole_objs = []
    for ole in para.findall('.//o:OLEObject', NSMAP):
        ole_id = ole.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id', '')
        # Get the formula description from the shape
        formula_desc = ole.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id', '')
        ole_objs.append(ole_id)

    # Get drawings
    drawings = para.findall('.//w:drawing', NSMAP)
    img_names = []
    for draw in drawings:
        docPrs_in = draw.findall('.//wp:docPr', NSMAP)
        for dp in docPrs_in:
            name = dp.get('name', '')
            descr = dp.get('descr', '')
            if name:
                img_names.append(f"{name}:{descr[:50]}" if descr else name)

    # Get WMF/EMF images specifically
    wmf_images = []
    for blip in para.findall('.//a:blip', NSMAP):
        embed = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed', '')
        if embed:
            wmf_images.append(embed)

    if text.strip() or ole_objs or img_names or wmf_images:
        output.append({
            'p': p_idx,
            'text': text.strip()[:150],
            'ole': ole_objs,
            'img': img_names,
            'wmf': wmf_images,
        })

print(f"\n=== Paragraphs with content: {len(output)} ===")
for item in output[:60]:
    markers = []
    if item['ole']: markers.append(f"OLE:{','.join(item['ole'][:3])}")
    if item['img']: markers.append(f"IMG:{','.join(item['img'][:3])}")
    if item['wmf']: markers.append(f"WMF:{','.join(item['wmf'][:3])}")
    marker_str = ' | '.join(markers)
    if item['text'] or marker_str:
        print(f"  P{item['p']}: {item['text'][:100]}")
        if marker_str:
            print(f"       {marker_str}")

# Count unique rIds for media mapping
all_rids = set()
for blip in root.findall('.//a:blip', NSMAP):
    embed = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed', '')
    if embed: all_rids.add(embed)
for ole in root.findall('.//o:OLEObject', NSMAP):
    rid = ole.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id', '')
    if rid: all_rids.add(rid)
print(f"\nUnique media rIds: {len(all_rids)}")

# Save full analysis
out_path = os.path.join(OUT_DIR, "formula_analysis.txt")
with open(out_path, 'w', encoding='utf-8') as f:
    for item in output:
        markers = []
        if item['ole']: markers.append(f"OLE:{','.join(item['ole'])}")
        if item['img']: markers.append(f"IMG:{','.join(item['img'])}")
        if item['wmf']: markers.append(f"WMF:{','.join(item['wmf'])}")
        marker_str = ' | '.join(markers)
        f.write(f"P{item['p']}: {item['text']}\n")
        if marker_str:
            f.write(f"  [{marker_str}]\n")
print(f"\nSaved to: {out_path}")
