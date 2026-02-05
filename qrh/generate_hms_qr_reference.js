const fs = require('fs');
const puppeteer = require('puppeteer');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

// Read the HMS codes mapping
const urlToCodesPath = process.argv[2] || './url_to_codes_mapping.json';
const outputPath = process.argv[3] || './P1_Series_HMS_QR_Reference.pdf';

const urlToCodes = JSON.parse(fs.readFileSync(urlToCodesPath, 'utf-8'));

// Extract only title from rendered page
async function extractArticleTitle(page, url) {
  try {
    // Navigate to the page and wait for Vue to render
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for the Vue content to be rendered
    await page.waitForSelector('.headline', { timeout: 10000 });
    
    // Extract title from the rendered DOM
    const title = await page.evaluate(() => {
      // Get title from page element
      let title = document.querySelector('.headline')?.textContent || 'Unknown Error Code';
      
      // Clean up title - remove HMS code prefix
      title = title.replace(/^HMS_\d+-\d+-\d+-\d+:\s*/, '');
      
      return title;
    });
    
    return title;
  } catch (error) {
    console.error(`Error extracting title: ${error.message}`);
    return 'Unknown Error Code';
  }
}

// Generate QR code as data URL
async function generateQRCode(url) {
  try {
    // Generate QR code as data URL (can be embedded in PDF)
    const qrDataURL = await QRCode.toDataURL(url, {
      width: 150,
      margin: 1,
      errorCorrectionLevel: 'M'
    });
    return qrDataURL;
  } catch (error) {
    console.error(`Error generating QR code: ${error.message}`);
    return null;
  }
}

// Create PDF with QR codes
async function generatePDF(articles, outputPath) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });
  
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);
  
  // Title page
  doc.fontSize(24).font('Helvetica-Bold')
     .text('Bambu Lab P1 Series', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(20)
     .text('HMS Error Code Quick Reference', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica')
     .text('Scan QR codes to access troubleshooting guides', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(10)
     .text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
  
  doc.addPage();
  
  // Content pages - 2 entries per page for readability
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    
    // Add new page for every 2 entries (except first which is on page 2)
    if (i > 0 && i % 2 === 0) {
      doc.addPage();
    }
    
    // Position: top or bottom half of page
    const isTopHalf = i % 2 === 0;
    const startY = isTopHalf ? 50 : 400;
    
    // Draw separator line if bottom half
    if (!isTopHalf) {
      doc.moveTo(50, startY - 20)
         .lineTo(562, startY - 20)
         .dash(5, { space: 3 })
         .stroke('#CCCCCC')
         .undash();
    }
    
    // Error codes header
    const codes = article.codes.join(', ');
    doc.fontSize(14).font('Helvetica-Bold')
       .fillColor('#000000')
       .text(`Error Code${article.codes.length > 1 ? 's' : ''}: ${codes}`, 50, startY, {
        width: 350
       });
    
    // Title
    if (article.title) {
      doc.fontSize(12).font('Helvetica')
         .fillColor('#333333')
         .text(article.title, 50, doc.y + 15, {
           width: 350,
           lineGap: 2
         });
    }

    // URL text (truncated if too long)
    const displayUrl = article.url.length > 90 ? 
                       article.url.substring(0, 87) + '...' : 
                       article.url;
    doc.fontSize(8).font('Helvetica')
       .fillColor('#666666')
       .text(displayUrl, 50, doc.y + 10, {
         width: 350
       });
    
    // QR Code
    if (article.qrCode) {
      try {
        doc.image(article.qrCode, 420, startY, {
          width: 120,
          height: 120
        });
        
        // URL below QR code
        doc.fontSize(7).font('Helvetica')
           .fillColor('#666666')
           .text('Scan for article', 420, startY + 125, {
             width: 120,
             align: 'center'
           });
      } catch (error) {
        console.error(`Error adding QR code to PDF: ${error.message}`);
      }
    }
    
    
  }
  
  doc.end();
  
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// Main execution
async function main() {
  console.log('Starting HMS QR Reference Generation...');
  let articles = [];
  if (!fs.existsSync("articlesScraped.json")) {
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
    
    let processed = 0;
    
    for (const [url, codes] of Object.entries(urlToCodes)) {
      processed++;
      console.log(`[${processed}/${Object.keys(urlToCodes).length}] Fetching: ${url}`);
      
      try {
        const title = await extractArticleTitle(page, url);
        console.log(`  Title: ${title}`);
        
        console.log(`  Generating QR code...`);
        const qrCode = await generateQRCode(url);
        
        articles.push({
          url,
          codes,
          title,
          qrCode
        });
        
        // Rate limiting - be nice to the server
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error processing ${url}:`, error.message);
        articles.push({
          url,
          codes,
          title: 'Error loading title',
          qrCode: null
        });
      }
    }
    
    await browser.close();
    console.log('Browser closed.');
    fs.writeFileSync("articlesScraped.json", JSON.stringify(articles, null, 2));
  } else {
    console.log("\nUsing cached articles...");
    articles = JSON.parse(fs.readFileSync("articlesScraped.json"));
  }
  

  console.log('\nGenerating PDF...');
  await generatePDF(articles, outputPath);
  
  console.log(`\nPDF generated successfully: ${outputPath}`);
  console.log(`Total entries: ${articles.length}`);
  console.log(`Total pages: ${Math.ceil(articles.length / 2) + 1}`); // +1 for title page
}

main().catch(console.error);
