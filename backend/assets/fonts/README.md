# PDF fonts (UTF-8 / Polish)

Place **DejaVu Sans** TTF files here so generated PDFs render Polish characters correctly (ą, ć, ę, ł, ń, ó, ś, ź, ż).

Required files:

- **DejaVuSans.ttf**
- **DejaVuSans-Bold.ttf** (optional; if missing, bold text uses DejaVuSans)

The repository includes **DejaVuSans.ttf** and **DejaVuSans-Bold.ttf** (from the `dejavu-fonts-ttf` npm package via jsDelivr) so PDF labels work out of the box.

To refresh or replace them manually: https://dejavu-fonts.github.io/ (Releases → ttf zip, copy from `ttf/`), or  
`https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf` (and `-Bold.ttf`).

If these files are missing, the app falls back to Helvetica and Polish characters may not render correctly in PDFs.
