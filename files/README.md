# HMS Manual Generator

This Node.js application downloads Bambu Lab P1 Series HMS (Health Management System) error code documentation from the wiki and compiles it into a single, print-friendly PDF manual.

## Features

- Downloads content from all HMS error code wiki pages
- Filters out navigation elements, sidebars, and other non-essential content
- Extracts only the article content for each error code
- Generates a clean, black-and-white friendly PDF suitable for printing
- Includes a table of contents with page numbers
- Groups multiple error codes that share the same wiki page

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Install dependencies:
```bash
npm install
```

## Usage

### Basic Usage

```bash
node generate_hms_manual.js
```

This will:
- Read from `./url_to_codes_mapping.json` (the URL-to-error-codes mapping)
- Generate `./P1_Series_HMS_Manual.pdf`

### Custom Input/Output

```bash
node generate_hms_manual.js <input-json> <output-pdf>
```

Example:
```bash
node generate_hms_manual.js ./my_codes.json ./my_manual.pdf
```

### Using npm scripts

```bash
npm start           # Use default paths
npm run generate    # Same as above
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
If pages appear empty in the PDF, the wiki HTML structure may have changed. You may need to update the content extraction selectors in `extractArticleContent()`.

## License

MIT

## Disclaimer

This tool is for personal use. Respect Bambu Lab's terms of service and wiki usage policies.
