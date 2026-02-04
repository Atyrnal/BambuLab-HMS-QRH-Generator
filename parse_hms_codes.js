const fs = require('fs');
const path = require('path');

// Read the HTML file
const htmlPath = process.argv[2] || 'block.html';
const outputPath = process.argv[3] || './p1s_hms_codes.json';

console.log(`Reading HTML from: ${htmlPath}`);
const html = fs.readFileSync(htmlPath, 'utf-8');

// Regular expressions to extract HMS codes and their info
const hmsCodePattern = /<h3[^>]*id="([^"]+)"[^>]*>.*?<\/h3>([\s\S]*?)(?=<h3|<h2|$)/g;
const synonymsPattern = /<p><strong>Synonyms:<\/strong>([\s\S]*?)<\/p>/;
const wikiLinkPattern = /https:\/\/wiki\.bambulab\.com\/[^\s"<>]+/;

const p1SeriesCodes = {};
let match;

console.log('Parsing HMS codes...');

while ((match = hmsCodePattern.exec(html)) !== null) {
    const sectionId = match[1];
    const sectionContent = match[2];
    
    // Extract the HMS code from the section ID
    // Format is typically like "0300_0100_0001_000A"
    const hmsCode = sectionId.replace(/_/g, '-');
    
    // Check if this section mentions P1 series or P1S in the synonyms
    const synonymsMatch = sectionContent.match(synonymsPattern);
    if (!synonymsMatch) continue;
    
    const synonymsText = synonymsMatch[1];
    
    // Check if P1 series or P1S is mentioned
    if (synonymsText.includes('P1 series') || synonymsText.includes('P1S')) {
        // Extract the wiki link
        const wikiLinkMatch = sectionContent.match(wikiLinkPattern);
        if (wikiLinkMatch) {
            const wikiUrl = wikiLinkMatch[0];
            p1SeriesCodes[hmsCode] = wikiUrl;
            console.log(`Found: ${hmsCode} -> ${wikiUrl}`);
        }
    }
}

// Also parse the table format if codes are in tables
const tableRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const tableCellPattern = /<td[^>]*>([\s\S]*?)<\/td>/g;

let tableMatch;
while ((tableMatch = tableRowPattern.exec(html)) !== null) {
    const rowContent = tableMatch[1];
    const cells = [];
    let cellMatch;
    
    while ((cellMatch = tableCellPattern.exec(rowContent)) !== null) {
        cells.push(cellMatch[1].trim());
    }
    
    // Look for HMS code patterns in cells
    if (cells.length > 0) {
        for (const cell of cells) {
            // Check if cell contains an HMS code (format: ####-####-####-####)
            const codeMatch = cell.match(/(\d{4}-\d{4}-\d{4}-\d{4})/);
            if (codeMatch) {
                const code = codeMatch[1];
                // Check if P1 series is mentioned in the row
                if (rowContent.includes('P1 series') || rowContent.includes('P1S')) {
                    const linkMatch = rowContent.match(wikiLinkPattern);
                    if (linkMatch && !p1SeriesCodes[code]) {
                        p1SeriesCodes[code] = linkMatch[0];
                        console.log(`Found (table): ${code} -> ${linkMatch[0]}`);
                    }
                }
            }
        }
    }
}

// Write the output JSON file
console.log(`\nWriting ${Object.keys(p1SeriesCodes).length} codes to ${outputPath}`);
fs.writeFileSync(outputPath, JSON.stringify(p1SeriesCodes, null, 2));

console.log('Done!');
console.log(`\nSummary:`);
console.log(`- Total P1 Series HMS codes found: ${Object.keys(p1SeriesCodes).length}`);
console.log(`- Output file: ${outputPath}`);
