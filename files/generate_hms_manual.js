const fs = require('fs');
const puppeteer = require('puppeteer');
const PDFDocument = require('pdfkit');

// Read the HMS codes mapping
const urlToCodesPath = process.argv[2] || './url_to_codes_mapping.json';
const outputPath = process.argv[3] || './P1_Series_HMS_Manual.pdf';

const urlToCodes = JSON.parse(fs.readFileSync(urlToCodesPath, 'utf-8'));

// Helper function to check if text contains Chinese characters
function containsChinese(text) {
  if (!text) return false;
  // Chinese character ranges: \u4e00-\u9fff (CJK Unified Ideographs)
  // Also includes: \u3400-\u4dbf (CJK Extension A), \uf900-\ufaff (CJK Compatibility Ideographs)
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(text);
}

// Helper function to fix unicode characters
function normalizeText(text) {
  if (!text) return text;
  
  // Common unicode replacements that may not render correctly in PDFs
  const replacements = {
    '→': '->',
    '←': '<-',
    '↑': '^',
    '↓': 'v',
    '⇒': '=>',
    '⇐': '<=',
    '⇔': '<=>',
    '•': '*',
    '◆': '*',
    '◇': 'o',
    '●': '*',
    '○': 'o',
    '■': '#',
    '□': '#',
    '▪': '*',
    '▫': 'o',
    '）': ')',
    '（': '(',
    '，': ',',
    '。': '.',
    '：': ':',
    '；': ';',
    '！': '!',
    '？': '?',
    '"': '"',
    '"': '"',
    '\'': "'",
    '\'': "'",
    '…': '...',
    '—': '-',
    '–': '-',
    '×': 'x',
    '÷': '/',
    '≠': '!=',
    '≤': '<=',
    '≥': '>=',
    '±': '+/-',
    '°': ' deg',
    '℃': 'C',
    '℉': 'F'
  };
  
  let result = text;
  for (const [unicode, replacement] of Object.entries(replacements)) {
    result = result.split(unicode).join(replacement);
  }
  
  return result;
}

// Extract article content from rendered page
async function extractArticleContent(page, url) {
  try {
    // Navigate to the page and wait for Vue to render
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for the Vue content to be rendered
    await page.waitForSelector('.contents', { timeout: 10000 });
    
    // Extract content from the rendered DOM
    const content = await page.evaluate(() => {
      // Find the rendered content
      const mainContent = document.querySelector('.contents');
      
      if (!mainContent) {
        return null;
      }
      
      // Get title from page element
      let title = document.querySelector('.headline')?.textContent || 'Unknown Error Code';
      
      // Clean up title - remove HMS code prefix
      title = title.replace(/^HMS_\d+-\d+-\d+-\d+:\s*/, '');
      
      const sections = [];
      
      // Remove SVG elements entirely before processing
      const svgs = mainContent.querySelectorAll('svg');
      svgs.forEach(svg => svg.remove());
      
      // Process all content elements in order
      const elements = mainContent.querySelectorAll('h1, h2, h3, h4, p, ul, ol, pre, code, blockquote');
      let currentSection = null;
      
      // Flag to stop processing after "End Notes" heading
      let foundEndNotes = false;
      
      elements.forEach(el => {
        // Skip if we've hit the "End Notes" section
        if (foundEndNotes) return;
        
        // Skip the toc-anchor links
        const anchors = el.querySelectorAll('a.toc-anchor');
        anchors.forEach(a => a.remove());
        
        // Remove any SVG elements that might be nested
        const nestedSvgs = el.querySelectorAll('svg');
        nestedSvgs.forEach(svg => svg.remove());
        
        const tagName = el.tagName.toLowerCase();
        
        // Skip elements that contain Chinese characters
        const textContent = el.textContent.trim();
        if (textContent && /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(textContent)) {
          return;
        }
        
        if (tagName.match(/^h[1-4]$/)) {
          const headingText = el.textContent.trim();
          
          // Stop processing if we hit "End Notes" or similar
          if (headingText.match(/^End Notes?$/i) || 
              headingText.match(/^Feedback$/i) ||
              headingText.match(/^Support$/i)) {
            foundEndNotes = true;
            return;
          }
          
          // Push previous section if exists
          if (currentSection) {
            sections.push(currentSection);
          }
          currentSection = {
            type: 'heading',
            level: parseInt(tagName[1]),
            text: headingText
          };
        } else if (tagName === 'p') {
          // Replace BR tags with newlines before getting text content
          const clone = el.cloneNode(true);
          const brs = clone.querySelectorAll('br');
          brs.forEach(br => {
            br.replaceWith('\n');
          });
          
          const text = clone.textContent.trim();
          if (text) {
            if (!currentSection) {
              currentSection = { type: 'paragraph', text: '' };
            }
            if (currentSection.type === 'heading') {
              sections.push(currentSection);
              currentSection = { type: 'paragraph', text };
            } else if (currentSection.type === 'paragraph') {
              currentSection.text += '\n\n' + text;
            } else {
              if (currentSection) sections.push(currentSection);
              currentSection = { type: 'paragraph', text };
            }
          }
        } else if (tagName === 'blockquote') {
          if (currentSection && currentSection.type !== 'heading') {
            sections.push(currentSection);
          }
          
          // Handle BR tags in blockquotes too
          const clone = el.cloneNode(true);
          const brs = clone.querySelectorAll('br');
          brs.forEach(br => {
            br.replaceWith('\n');
          });
          
          const text = clone.textContent.trim();
          const isDanger = el.classList.contains('is-danger');
          const isInfo = el.classList.contains('is-info');
          const isWarning = el.classList.contains('is-warning');
          
          let prefix = '';
          if (isDanger) prefix = '⚠️ IMPORTANT: ';
          else if (isWarning) prefix = '⚠️ WARNING: ';
          else if (isInfo) prefix = 'ℹ️ NOTE: ';
          
          sections.push({
            type: 'blockquote',
            text: prefix + text
          });
          currentSection = null;
        } else if (tagName === 'ul' || tagName === 'ol') {
          if (currentSection && currentSection.type !== 'heading') {
            sections.push(currentSection);
          }
          const items = Array.from(el.querySelectorAll('li')).map(li => {
            // Handle BR tags in list items
            const clone = li.cloneNode(true);
            const brs = clone.querySelectorAll('br');
            brs.forEach(br => {
              br.replaceWith('\n');
            });
            return clone.textContent.trim();
          });
          sections.push({
            type: 'list',
            ordered: tagName === 'ol',
            items
          });
          currentSection = null;
        } else if (tagName === 'pre' || tagName === 'code') {
          if (currentSection && currentSection.type !== 'heading') {
            sections.push(currentSection);
          }
          sections.push({
            type: 'code',
            text: el.textContent.trim()
          });
          currentSection = null;
        }
      });
      
      if (currentSection) {
        sections.push(currentSection);
      }
      
      return {
        title,
        sections
      };
    });
    
    return content;
  } catch (error) {
    console.error(`Error extracting content: ${error.message}`);
    return null;
  }
}

// Normalize all text content in the extracted article
function normalizeArticleContent(content) {
  if (!content) return null;
  
  // Normalize the title
  content.title = normalizeText(content.title);
  
  // Normalize all sections
  content.sections = content.sections.map(section => {
    const normalized = { ...section };
    
    if (section.text) {
      // Skip sections with Chinese characters
      if (containsChinese(section.text)) {
        return null;
      }
      normalized.text = normalizeText(section.text);
    }
    
    if (section.items) {
      // Filter out list items with Chinese characters
      normalized.items = section.items
        .filter(item => !containsChinese(item))
        .map(item => normalizeText(item));
      
      // If all items were filtered out, skip this section
      if (normalized.items.length === 0) {
        return null;
      }
    }
    
    return normalized;
  }).filter(section => section !== null); // Remove null sections
  
  return content;
}

// Create PDF
async function generatePDF(articles, outputPath) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    bufferPages: false  // Don't buffer - write directly
  });
  
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);
  
  // Title page
  doc.fontSize(24).font('Helvetica-Bold')
     .text('Bambu Lab P1 Series', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(20)
     .text('HMS Error Code Manual', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica')
     .text('Health Management System (HMS) Troubleshooting Guide', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(10)
     .text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
  
  doc.addPage();
  
  // Table of contents
  doc.fontSize(18).font('Helvetica-Bold')
     .text('Table of Contents', { underline: true });
  doc.moveDown(1);
  
  doc.fontSize(10).font('Helvetica');
  articles.forEach((article, index) => {
    const codes = article.codes.join(', ');
    doc.text(`${index + 1}. ${codes}`, { 
      continued: true
    });
    doc.text(` ............... Page ${index + 3}`); // +3 for title and TOC pages
  });
  
  // Content pages
  articles.forEach((article, index) => {
    doc.addPage();
    
    // Error codes header
    doc.fontSize(16).font('Helvetica-Bold')
       .fillColor('#000000')
       .text(`Error Code${article.codes.length > 1 ? 's' : ''}: ${article.codes.join(', ')}`);
    doc.moveDown(0.5);
    
    if (!article.content) {
      doc.fontSize(10).font('Helvetica')
         .fillColor('#000000')
         .text('Content not available');
      return;
    }
    
    // ISSUE #3 FIX: Add the title below the error code
    if (article.content.title) {
      doc.fontSize(14).font('Helvetica-Bold')
         .fillColor('#000000')
         .text(article.content.title);
      doc.moveDown(0.5);
    }
    
    // Horizontal line
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#CCCCCC');
    doc.moveDown(0.5);
    
    // Render sections
    article.content.sections.forEach(section => {
      // Check if we need a new page
      if (doc.y > 700) {
        doc.addPage();
      }
      
      switch (section.type) {
        case 'heading':
          const fontSize = 16 - (section.level * 2);
          doc.fontSize(fontSize).font('Helvetica-Bold')
             .fillColor('#000000')
             .text(section.text);
          doc.moveDown(0.5);
          break;
          
        case 'paragraph':
          doc.fontSize(10).font('Helvetica')
             .fillColor('#000000')
             .text(section.text, {
               align: 'left',
               lineGap: 2
             });
          doc.moveDown(0.5);
          break;
          
        case 'blockquote':
          // Render blockquotes with a border and different background
          const blockquoteText = section.text;
          const textHeight = doc.heightOfString(blockquoteText, {
            width: 480,
            lineGap: 2
          });
          
          // Check if blockquote fits on page
          if (doc.y + textHeight + 20 > 700) {
            doc.addPage();
          }
          
          // Draw border rectangle
          doc.rect(doc.x, doc.y, 500, textHeight + 20)
             .lineWidth(2)
             .fillAndStroke('#F5F5F5', '#333333');
          
          // Draw text
          doc.fontSize(10).font('Helvetica-Bold')
             .fillColor('#000000')
             .text(blockquoteText, doc.x + 10, doc.y + 10, {
               width: 480,
               lineGap: 2
             });
          
          doc.moveDown(0.5);
          break;
          
        case 'list':
          section.items.forEach((item, idx) => {
            const bullet = section.ordered ? `${idx + 1}.` : '•';
            doc.fontSize(10).font('Helvetica')
               .fillColor('#000000')
               .text(`  ${bullet} ${item}`, {
                 indent: 20,
                 lineGap: 2
               });
          });
          doc.moveDown(0.5);
          break;
          
        case 'code':
          const codeHeight = doc.heightOfString(section.text) + 10;
          if (doc.y + codeHeight > 700) {
            doc.addPage();
          }
          
          doc.fontSize(9).font('Courier')
             .fillColor('#000000')
             .rect(doc.x, doc.y, 500, codeHeight)
             .fillAndStroke('#F5F5F5', '#CCCCCC')
             .fillColor('#000000')
             .text(section.text, doc.x + 5, doc.y + 5);
          doc.moveDown(0.5);
          break;
      }
    });
  });
  
  doc.end();
  
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// Main execution
async function main() {
  console.log('Starting HMS Manual Generation...');
  console.log(`Total unique URLs to fetch: ${Object.keys(urlToCodes).length}`);
  
  // Launch browser
  console.log('Launching headless browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Set viewport for consistent rendering
  await page.setViewport({ width: 1920, height: 1080 });
  
  const articles = [];
  let processed = 0;
  
  for (const [url, codes] of Object.entries(urlToCodes)) {
    processed++;
    console.log(`[${processed}/${Object.keys(urlToCodes).length}] Fetching: ${url}`);
    
    try {
      const content = await extractArticleContent(page, url);
      const normalizedContent = normalizeArticleContent(content);
      
      articles.push({
        url,
        codes,
        content: normalizedContent
      });
      
      // Rate limiting - be nice to the server
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error fetching ${url}:`, error.message);
      articles.push({
        url,
        codes,
        content: null
      });
    }
  }
  
  await browser.close();
  console.log('Browser closed.');
  
  console.log('\nGenerating PDF...');
  await generatePDF(articles, outputPath);
  
  console.log(`\nPDF generated successfully: ${outputPath}`);
  console.log(`Total pages: ${articles.length + 2}`); // +2 for title and TOC
}

main().catch(console.error);