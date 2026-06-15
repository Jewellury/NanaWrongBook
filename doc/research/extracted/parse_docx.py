"""Parse DOCX exam file, extracting text + image references with proper structure."""
import sys
import os
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from lxml import etree
import zipfile
import io

DOCX_PATH = sys.argv[1] if len(sys.argv) > 1 else "e:/nana/doc/research/精品解析：2024年新课标全国Ⅰ卷数学真题（解析版）.docx"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "e:/nana/doc/research/extracted/2024"

# Namespaces
NSMAP = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
    'v': 'urn:schemas-microsoft-com:vml',
    'o': 'urn:schemas-microsoft-com:office:office',
}

def extract_images_from_docx(docx_path):
    """Extract all media files from DOCX."""
    os.makedirs(OUT_DIR, exist_ok=True)
    with zipfile.ZipFile(docx_path, 'r') as z:
        for name in z.namelist():
            if 'media/' in name:
                basename = os.path.basename(name)
                outpath = os.path.join(OUT_DIR, basename)
                if not os.path.exists(outpath):
                    with z.open(name) as src, open(outpath, 'wb') as dst:
                        dst.write(src.read())

def get_image_count(paragraph_xml):
    """Count images and OLE objects in a paragraph's XML."""
    root = etree.fromstring(paragraph_xml.encode('utf-8') if isinstance(paragraph_xml, str) else paragraph_xml)

    # Count drawing elements (inline images)
    drawings = root.findall('.//w:drawing', NSMAP)

    # Count OLE objects
    objects = root.findall('.//o:OLEObject', NSMAP)

    # Count embedded objects via relationships
    # Look for r:id attributes in OLEObject and imagedata
    ole_ids = []
    for obj in root.findall('.//o:OLEObject', NSMAP):
        rid = obj.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        if rid:
            ole_ids.append(rid)

    img_ids = []
    for blip in root.findall('.//a:blip', NSMAP):
        embed = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
        if embed:
            img_ids.append(embed)

    return len(drawings), len(objects), ole_ids, img_ids

def parse_docx_structure(docx_path):
    """Parse DOCX and output structured text with image markers."""
    doc = Document(docx_path)

    # Build relationship ID -> media file mapping
    rel_map = {}
    for rel in doc.part.rels.values():
        if "media" in str(rel.target_ref):
            rel_map[rel.rId] = os.path.basename(rel.target_ref)
        elif "oleObject" in str(rel.target_ref):
            rel_map[rel.rId] = os.path.basename(rel.target_ref)

    output_lines = []

    for i, para in enumerate(doc.paragraphs):
        text = para.text.strip()
        style = para.style.name if para.style else "None"

        # Get paragraph XML for image analysis
        para_xml = etree.tostring(para._element, encoding='unicode')
        n_drawings, n_objects, ole_ids, img_ids = get_image_count(para_xml)

        # Map IDs to filenames
        img_files = [rel_map.get(rid, rid) for rid in img_ids]
        ole_files = [rel_map.get(rid, rid) for rid in ole_ids]

        has_images = n_drawings > 0 or n_objects > 0

        if text or has_images:
            output_lines.append({
                'index': i,
                'style': style,
                'text': text,
                'n_drawings': n_drawings,
                'n_objects': n_objects,
                'img_files': img_files,
                'ole_files': ole_files,
            })

    return output_lines, rel_map

if __name__ == '__main__':
    print(f"Parsing: {DOCX_PATH}")
    extract_images_from_docx(DOCX_PATH)
    print(f"Images extracted to: {OUT_DIR}")

    items, rel_map = parse_docx_structure(DOCX_PATH)

    # Print all paragraphs with image markers
    print(f"\n=== DOCX Structure ({len(items)} non-empty paragraphs) ===")
    for item in items:
        prefix = ""
        if item['style'] and 'Heading' in item['style']:
            prefix = f"[{item['style']}] "
        elif item['style'] and item['style'] != 'Normal':
            prefix = f"[{item['style']}] "

        img_markers = ""
        if item['img_files']:
            img_markers = f" [IMG: {', '.join(item['img_files'])}]"
        if item['ole_files']:
            img_markers += f" [OLE: {', '.join(item['ole_files'])}]"

        # Show first 120 chars of text
        text_preview = item['text'][:120] + "..." if len(item['text']) > 120 else item['text']
        if text_preview or img_markers:
            print(f"  [{item['index']}] {prefix}{text_preview}{img_markers}")

    print(f"\n=== Relationship Map (first 30) ===")
    for i, (rid, fname) in enumerate(rel_map.items()):
        if i >= 30:
            break
        print(f"  {rid} -> {fname}")
    print(f"  ... total {len(rel_map)} relationships")

    # Also save to file
    out_path = os.path.join(OUT_DIR, "parsed_structure.txt")
    with open(out_path, 'w', encoding='utf-8') as f:
        for item in items:
            prefix = ""
            if item['style'] and 'Heading' in item['style']:
                prefix = f"[{item['style']}] "

            img_markers = ""
            if item['img_files']:
                img_markers = f" [IMG: {', '.join(item['img_files'])}]"
            if item['ole_files']:
                img_markers += f" [OLE: {', '.join(item['ole_files'])}]"

            f.write(f"[{item['index']}] {prefix}{item['text']}{img_markers}\n")

    print(f"\nFull structure saved to: {out_path}")
