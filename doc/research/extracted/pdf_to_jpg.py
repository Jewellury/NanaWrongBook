"""Convert PDF pages to JPG images at specified DPI."""
import sys
import os
import fitz  # PyMuPDF

PDF_PATH = sys.argv[1] if len(sys.argv) > 1 else "e:/nana/doc/research/extracted/2024/2024_exam.pdf"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(PDF_PATH) + "/pages"
DPI = int(sys.argv[3]) if len(sys.argv) > 3 else 150

os.makedirs(OUT_DIR, exist_ok=True)

doc = fitz.open(PDF_PATH)
print(f"PDF: {PDF_PATH}")
print(f"Pages: {doc.page_count}")
print(f"DPI: {DPI}")
print(f"Output: {OUT_DIR}")

for page_num in range(doc.page_count):
    page = doc[page_num]
    # Calculate zoom factor for desired DPI (PDF default is 72 DPI)
    zoom = DPI / 72
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)

    out_path = os.path.join(OUT_DIR, f"page-{page_num+1:02d}.jpg")
    pix.save(out_path)
    print(f"  Page {page_num+1}/{doc.page_count} -> {out_path} ({pix.width}x{pix.height})")

doc.close()
print(f"\nDone! {doc.page_count} pages saved to {OUT_DIR}")
