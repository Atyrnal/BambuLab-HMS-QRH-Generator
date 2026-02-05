# HMS Manual Generator

This Node.js toolset downloads Bambu Lab P1 Series HMS (Health Management System) error code documentation from the wiki and compiles it into PDF manuals.

## Features

### Full Manual (`generate_hms_manual.js`)
- Downloads complete content from all HMS error code wiki pages
- Filters out navigation elements, Chinese text, SVG graphics, and non-essential content
- Extracts article content including troubleshooting steps, images references, and warnings
- Generates a comprehensive, black-and-white PDF suitable for printing
- Includes table of contents with page numbers
- Handles BR tags for proper line breaks
- Groups multiple error codes that share the same wiki page

### QR Reference Sheet (`generate_hms_qr_reference.js`)
- Creates a compact quick-reference guide
- Shows error codes and titles only (no full content)
- Generates QR codes linking to online wiki articles
- 2 entries per page for easy printing
- Perfect for shop reference or quick lookups

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Install dependencies:
```bash
npm install
```

## Usage

### Full Manual Generation

```bash
node --max-old-space-size=8192 generate_hms_manual.js
# or
npm run generate
```

This will:
- Read from `./url_to_codes_mapping.json` (the URL-to-error-codes mapping)
- Generate `./P1_Series_HMS_Manual.pdf`

### QR Reference Generation

```bash
node --max-old-space-size=8192 generate_hms_qr_reference.js
# or
npm run qr-reference
```

This will:
- Read from `./url_to_codes_mapping.json`
- Generate `./P1_Series_HMS_QR_Reference.pdf`

### Custom Input/Output

```bash
node --max-old-space-size=8192 generate_hms_manual.js <input-json> <output-pdf>
node --max-old-space-size=8192 generate_hms_qr_reference.js <input-json> <output-pdf>
```

Example:
```bash
node --max-old-space-size=8192 generate_hms_manual.js ./my_codes.json ./my_manual.pdf
node --max-old-space-size=8192 generate_hms_qr_reference.js ./my_codes.json ./my_qr_ref.pdf
```

### Using npm scripts

```bash
npm start              # Generate full manual (default paths)
npm run generate       # Generate full manual (default paths)
npm run qr-reference   # Generate QR reference sheet (default paths)
```

## Input File Format

The input JSON file should map wiki URLs to arrays of error codes:

```json
{
  "https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/0300_0100_0001_000A": [
    "0300-0100-0001-000A"
  ],
  "https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/0300_1000_0002_0001": [
    "0300-1000-0002-0001",
    "0300-1100-0002-0001"
  ]
}
```

## Output

The generated PDF includes:

1. **Title Page** - Manual title and generation date
2. **Table of Contents** - Linked list of all error codes with page numbers
3. **Error Code Pages** - One page per unique wiki article, showing:
   - Error code(s) covered
   - Full article content (headings, paragraphs, lists, code blocks)
   - Page numbers in footer

## Print-Friendly Features

- Minimal color usage (black text on white background)
- Clean typography with appropriate font sizes
- Proper page breaks
- Clear section headings
- Easy-to-read formatting

## Rate Limiting

The script includes a 500ms delay between requests to be respectful to the Bambu Lab wiki servers.

## Error Handling

- If a page fails to download, the script continues with remaining pages
- Failed pages are logged to console
- The PDF is still generated with available content

## Troubleshooting

### "Cannot find module" errors
Run `npm install` to install dependencies.

### Connection timeouts
The script may timeout on slow connections. You can increase the timeout or reduce the rate limiting delay.

### Empty content
The script is designed to extract content from Bambu Lab's Vue.js-rendered wiki pages. It looks for content in the `<page><template slot="contents">` structure. If pages appear empty in the PDF, verify the wiki URL structure hasn't changed.

### Technical Details

**Bambu Lab Wiki Structure:**
The Bambu Lab wiki uses Vue.js with server-side rendering. Content is embedded in:
```html
<page>
  <template slot="contents">
    <div><!-- Article content --></div>
  </template>
</page>
```

The generator extracts content from this structure without requiring JavaScript execution, including:
- Headings (h1-h4)
- Paragraphs
- Lists (ordered and unordered)
- Code blocks
- Blockquotes (warnings, notes, important messages with ⚠️ and ℹ️ symbols)

## License

MIT

## Disclaimer

This tool is for personal use. Respect Bambu Lab's terms of service and wiki usage policies.
