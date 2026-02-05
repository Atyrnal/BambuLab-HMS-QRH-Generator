const fs = require('fs');
const { JSDOM } = require("jsdom");
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

function charIsInt(c) {
    return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(c)
}

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


async function main() {
    // Read the HTML file
    const htmlPath = process.argv[2] || 'block.html';
    const outputPath = process.argv[3] || 'bambu-hms-qrh.pdf'

    console.log(`Reading HTML from: ${htmlPath}`);
    const html = fs.readFileSync(htmlPath, 'utf-8');

    const dom = new JSDOM(html, {
        url : "https://wiki.bambulab.com"
    });
    const document = dom.window.document;

    let entries = []

    document.querySelectorAll("blockquote").forEach(element => {
        const links = element.querySelectorAll("a")
        const codes = []
        const title = Array.from(element.querySelectorAll("strong")).filter(element => !element.textContent?.startsWith("Synonyms"))[0]?.textContent.replaceAll(/\s+/g, " ").trim().replaceAll("：", ":")
        if (title == undefined) return console.log("Unable to find title for blockquote: ", element.outerHTML);
        console.log(title)
        const primCode = title.split(":")[0].trim().toLowerCase().replace("hms_", "").toUpperCase().trim().replaceAll("_", "-")
        const errorName = title.split(":")?.slice(1)?.join(":")?.replaceAll(/\s+/g, " ").trim() || "Unknown Error";
        codes.push(primCode)
        let synonyms = (element.querySelector(".text-tiny")?.querySelector("i") || element.querySelector(".text-tiny"))?.textContent?.replaceAll(/\s+/g, "")?.replaceAll("，", ",")?.split(",");
        if (synonyms == undefined) {
            synonyms = Array.from(element.querySelectorAll("p")).filter(ele => charIsInt(ele.textContent?.toLowerCase()?.replace("synonyms:", "")?.trim()?.charAt(0)))[0]?.textContent?.toLowerCase()?.replace("synonyms:", "")?.toUpperCase().replaceAll(/\s+/g, "").replaceAll("，", ",").split(",");
            if (synonyms == undefined) return console.log("Unable to find synonyms for blockquote: ", element.outerHTML)
        }
        synonyms = synonyms.map(cd => cd.trim())
        codes.push(...synonyms) //Synonym codes
        const issue = {
            "name" : errorName,
            "codes" : [...new Set(codes)],
            "links" : []
        }
        Array.from(links).forEach(linkElement => {
            const link = linkElement.href
            issue["links"].push({
                "product" : linkElement.textContent.replaceAll(/\s+/g, " ").trim() || "Unknown",
                "url" : link
            });
        });
        entries.push(issue);
    });

    entries = entries.sort((a, b) => { //Sort by primary code
        const aNums = a["codes"][0].split("-").map(c => parseInt(c, 16))
        const bNums = b["codes"][0].split("-").map(c => parseInt(c, 16))
        for (let i = 0; i < 4; i++) {
            if (aNums[i] < bNums[i]) return -1;
            else if (bNums[i] < aNums[i]) return 1;
        }
        return 0;
    })

    for (let i = 0; i < entries.length; i++) {
        entries[i].name = entries[i].name.replaceAll(/Slot[-\s]?[0-9]+[\s]/gi, "Slot ")
            .replaceAll(/Slot[-\s]?[0-9]+/gi, "Slot X")
            .replaceAll(/Heater[-\s]?[A-Za-z0-9][\s]/gi, "Heater ")
            .replaceAll(/AMS[-\s]?[A-Za-z0-9][\s]/gi, "AMS ")
            .replaceAll(/Motor[-\s]?[A-Za-z0-9][\s]/gi, "Motor ")
            .replaceAll(/Valve[-\s]?[A-Za-z0-9][\s]/gi, "Valve ")
            .replaceAll(/Sensor[-\s]?[A-Za-z0-9][\s]/gi, "Sensor ")
            .replaceAll(/RFID[-\s]?[A-Za-z0-9][\s]/gi, "RFID ")
            .replaceAll(/Position[-\s]?[A-Za-z0-9][\s]/gi, "Position X ")
            .replaceAll(/Station[-\s]?[A-Za-z0-9][\s]/gi, "Station X ")
            .replaceAll(/Hotend[-\s]?[A-Za-z0-9][\s]/gi, "Hotend ")
            .replaceAll(/AMS[-\s]?HT[-\s]?[A-Za-z0-9][\s]/gi, "AMS-HT ")
    }

    console.log("Parsed all entries, writing to file...")
    fs.writeFileSync("qrhEntries.json", JSON.stringify(entries, null, 2))

    console.log("Generating QR Codes...")
    for (let x = 0; x < entries.length; x++) {
        for (let y = 0; y < entries[x].links.length; y++) {
            entries[x].links[y]["qr"] = await generateQRCode(entries[x].links[y]["url"]);
        }
    }

    console.log('\nGenerating PDF...');
    generatePDF(entries, ["P1S"], outputPath);

    console.log(`\nPDF generated successfully: ${outputPath}`);
    console.log(`Total entries: ${entries.length}`);
}

function getSectionHeight(issue, products, sectionSpacing, qrSpacing) {
    const dummy = new PDFDocument({
        size: [612, 100000],
        margins: { top: 0, bottom: 0, left: 50, right: 50 }
    });
    dummy.x = 50
    dummy.y = 0
    writeEntry(dummy, issue, products, sectionSpacing, qrSpacing);
    const value = dummy.y;
    dummy.end();
    return value;
}

function getTextHeight(fontSize, font, text, options) {
    const dummy = new PDFDocument({
        size: [612, 100000],
        margins: { top: 0, bottom: 0, left: 50, right: 50 }
    });
    dummy.x = 50
    dummy.y = 0
    dummy.fontSize(fontSize).font(font).fillColor("#000").text(text, dummy.x, dummy.y, options)
    const value = dummy.y;
    dummy.end();
    return value;
}

async function writeEntry(doc, entry, products, sectionSpacing, qrSpacing, newPage = false) {
    // Draw separator line if not new page
    if (!newPage) {
        doc.moveTo(doc.page.margins.left, doc.y + (sectionSpacing/2.0))
            .lineTo(doc.page.width - doc.page.margins.right, doc.y + (sectionSpacing/2.0))
            .dash(5, { space: 3 })
            .stroke('#CCCCCC')
            .undash();
        //doc.moveTo(doc.page.margins.left, doc.y + (sectionSpacing/2.0))
        doc.y += sectionSpacing;
    }
    
    const sectionStartY = doc.y
    const textWidth = (entry.links.length == 1) ? 350 : doc.page.width - doc.page.margins.right - doc.page.margins.left
    // Primary code header
    doc.fontSize(14).font('Helvetica-Bold')
       .fillColor('#000000')
       .text(`HMS ${entry.codes[0]}: ${(entry.name) ? entry.name : "Error Title Not Found (Check Wiki)"}`, doc.page.margins.left, doc.y, {
            width: textWidth
        });
    if (entry.codes.length > 1) {
        doc.fontSize(10).font('Helvetica')
            .fillColor("#555555")
            .text(`Aliases: ${entry.codes.slice(1).join(", ")}`, doc.page.margins.left, doc.y + 5, {
                width: textWidth
            })
    }



    //doc.y += 6;
    // URL text (truncated if too long)
    // entry.links.forEach(link => {
    //     const displayUrl = (link.url.length > 90) ? link.url.substring(0, 87) + '...' : link.url;
    //     doc.fontSize(8).font('Helvetica')
    //     .fillColor('#555555')
    //     .text(link.product + ":", doc.page.margins.left, doc.y + 4, {
    //         width: textWidth
    //     })
    //     doc.fontSize(8).font('Helvetica')
    //     .fillColor('#555555')
    //     .text(displayUrl, doc.page.margins.left, doc.y + 2, {
    //         width: textWidth
    //     });
    // });
    let endY = doc.y;
    // QR Code
    if (products.length > 0) {
        entry.links = entry.links.filter(link => {
            const productsAffected = [...link.product.toLowerCase().split("/").map(s => s.trim())]
            let result = false
            products.forEach(product => {
                if (result) return;
                if (productsAffected.includes(product.toLowerCase()) || productsAffected.includes(product.toLowerCase().substr(0, 2) + " series")) {
                    result = true;
                }
            });
            return result;
        })
    }

    if (entry.links.length == 1 && entry.links[0].qr) {
        try {
            doc.fontSize(10).font('Helvetica-Bold').fillColor("#222").text(entry.links[0].product, 420, sectionStartY, {width: 120, align: 'center'})

            doc.image(entry.links[0].qr, 440, doc.y + 5, {
                width: 80,
                height: 80
            });
            
            // URL below QR code
            doc.fontSize(7).font('Helvetica')
            .fillColor('#666666')
            .text('Scan for article', 420, doc.y + 90, {
                width: 120,
                align: 'center'
            });
        } catch (error) {
            console.error(`Error adding QR code to PDF: ${error.message}`);
        }
    } else if (entry.links.length > 1) {
        let currentX = doc.page.margins.left
        let qrStartY = doc.y + 10
        let maxTextHeight = 0
        entry.links.forEach(link => {
            if (link.qr) {
                const th = getTextHeight(10, 'Helvetica-Bold', link.product, {width:120})
                if (th > maxTextHeight) maxTextHeight = th;
            }
        })
        entry.links.forEach(link => {
            if (link.qr) {
                try {
                    doc.fontSize(10).font('Helvetica-Bold').fillColor("#222").text(link.product, currentX, qrStartY, {width: 120, align: 'center'})
                    doc.y = qrStartY+ maxTextHeight

                    doc.image(link.qr, currentX+20, doc.y + 5, {
                        width: 80,
                        height: 80
                    });
                    
                    // URL below QR code
                    doc.fontSize(7).font('Helvetica')
                    .fillColor('#666666')
                    .text('Scan for article', currentX, doc.y + 90, {
                        width: 120,
                        align: 'center'
                    });
                    currentX += 120 + qrSpacing
                } catch (error) {
                    currentX += 120 + qrSpacing
                    console.error(`Error adding QR code to PDF: ${error.message}`);
                }
            }
        });
    }
    if (endY > doc.y) doc.y = endY;
}

async function generatePDF(entries, products, outputPath) {

    if (products.length != 0) {
        entries = entries.filter(entry => {
            const productsAffected = []
            entry.links.forEach(link => { 
                productsAffected.push(...link.product.toLowerCase().split("/").map(s => s.trim()))
            });
            let result = false
            products.forEach(product => {
                if (result) return;
                if (productsAffected.includes(product.toLowerCase()) || productsAffected.includes(product.toLowerCase().substr(0, 2) + " series")) {
                    result = true;
                }
            });
            return result;
        });
    }
    const appendix = generateIndex(entries);

    const sectionSpacing = 30
    const qrSpacing = 20

    const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 20, left: 50, right: 50 }
    });
    
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
  
    // Title page
    doc.fontSize(24).font('Helvetica-Bold')
        .text(`Bambu Lab ${(products.length > 0) ? products.join(", ").toUpperCase() : "3D Printers"}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20)
        .text('HMS Error Code Quick Reference', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica')
        .text('Scan QR codes to access troubleshooting guides', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(10)
        .text(`Generated: ${new Date().toLocaleDateString()} by Antony Rinaldi`, { align: 'center' });
  
    const contents = {};
    // Content pages - 2 entries per page for readability
    let pageNum = 0
    entries.forEach((entry, idx) => {
        const sectionHeight = getSectionHeight(entry, products, sectionSpacing, qrSpacing)
        let newPage = false;
        if (sectionHeight >= doc.page.height - doc.page.margins.top) return console.log("Entry for issue " + entry.codes[0] + " is too tall for page!");
        if (idx == 0 || doc.y + sectionSpacing + sectionHeight > doc.page.height - doc.page.margins.bottom - 10) {
            newPage = true
            doc.addPage()
            pageNum++
            doc.fontSize(8).font('Helvetica').fillColor("#000").text(pageNum, doc.page.margins.left, doc.page.height - doc.page.margins.bottom - 10, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "center"})
            doc.moveTo(doc.page.margins.left, doc.page.margins.top)
            doc.x = doc.page.margins.left
            doc.y = doc.page.margins.top
        }
        contents[entry.codes[0]] = pageNum;
        writeEntry(doc, entry, products, sectionSpacing, qrSpacing, newPage);
    })

//   if (pageNum % 2 == 1) {//Odd pages are on the left side
//     doc.fontSize(8).font('Helvetica').fillColor("#000").text(pageNum, doc.page.margins.left, doc.page.height - doc.page.margins.bottom)
//   } else {
//     doc.fontSize(8).font('Helvetica').fillColor("#000").text(pageNum, doc.page.width - doc.page.margins.right, doc.page.height - doc.page.margins.bottom)
//   }

    const colSpacing = 10
    //Write index
    doc.addPage()
    doc.fontSize(14).font('Helvetica-Bold').fillColor("#000").text("Index", doc.page.margins.left, doc.page.margins.top, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "center"})
    //Gonna do 2 columns i think
    const columnCount = 4;
    const colFontSize = 8;
    const index = appendix.map(entry => {
        return entry.alternate + ": Pg " + contents[entry.primary] + "\n"
    })
    let counted = 0
    let colHeight = 0;
    let tmp = index[0];
    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - colSpacing*(columnCount-1))/columnCount
    while (getTextHeight(colFontSize, 'Helvetica', tmp.trim(), {width: colWidth}) + doc.y + sectionSpacing<= doc.page.height - doc.page.margins.bottom - 10 ) {
        tmp += index[++colHeight];
    }
    const topY = doc.y + sectionSpacing
    
    for (let i = 0; i < columnCount && counted < index.length; i++) {
        doc.fontSize(colFontSize).font('Helvetica').fillColor("#222").text(index.slice(counted, (counted+colHeight > index.length) ? index.length : counted+colHeight).join("").trim(), doc.page.margins.left + (i % columnCount)*(colWidth + colSpacing), topY, { width: colWidth})
        counted+=colHeight
    }
    if (counted < index.length) {
        tmp = index[counted];
        colHeight = 0;
        while (getTextHeight(colFontSize, 'Helvetica', tmp.trim(), {width: colWidth}) + doc.page.margins.top + sectionSpacing<= doc.page.height - doc.page.margins.bottom - 10 ) {
            tmp += index[counted + ++colHeight];
        }
    }
    while (counted < index.length) {
        doc.addPage();
        for (let i = 0; i < columnCount && counted < index.length; i++) {
            doc.fontSize(colFontSize).font('Helvetica').fillColor("#222").text(index.slice(counted, (counted+colHeight > index.length) ? index.length : counted+colHeight).join("").trim(), doc.page.margins.left + (i % columnCount)*(colWidth + colSpacing), doc.page.margins.top, { width: colWidth})
            counted+=colHeight
        }
    }




    doc.end();
  
    return new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
}

function generateIndex(entries) {
    let appendix = []
    entries.forEach(issue => {
        const primCode = issue.codes[0]
        issue.codes.forEach(code => {
            appendix.push({ "primary": primCode, "alternate" : code })
        })
    }) //Create array of all alternate codes mapping to their primary code

    appendix = appendix.sort((a, b) => { //Sort numerically
        const aNums = a["alternate"].split("-").map(c => parseInt(c, 16))
        const bNums = b["alternate"].split("-").map(c => parseInt(c, 16))
        for (let i = 0; i < 4; i++) {
            if (aNums[i] < bNums[i]) return -1;
            else if (bNums[i] < aNums[i]) return 1;
        }
        return 0;
    })
    return appendix;
}

main()

//<blockquote>
//   <p>
//     <i
//       ><strong
//         >HMS_1800-2400-0002-0009: AMS-HT A front cover is open. This may
//         affect the drying performance or cause the filament to absorb
//         moisture.</strong
//       ></i
//     >
//   </p>
//   <p>
//     <span class="text-small"
//       ><i><strong>Synonyms: </strong></i></span
//     ><span class="text-tiny"
//       ><i
//         >1800-2400-0002-0009, 1801-2400-0002-0009, 1802-2400-0002-0009,
//         1803-2400-0002-0009, 1804-2400-0002-0009, 1805-2400-0002-0009,
//         1806-2400-0002-0009, 1807-2400-0002-0009</i
//       ></span
//     >
//   </p>
//   <ul>
//     <li>
//       <a
//         href="/en/h2/troubleshooting/hmscode/1800_2400_0002_0009"
//         class="is-internal-link is-valid-page"
//         ><i>H2 series</i></a
//       >
//     </li>
//   </ul>
// </blockquote>

/*<blockquote>
      <p>
        <strong>HMS_0700-2000-0002-0022: AMS A Slot 1 assist motor is stalled，due to
          excessive resistance in the tube near the toolhead.
        </strong>
      </p>
      <p>
        <strong>Synonyms:</strong>0700-2000-0002-0022, 0700-2100-0002-0022,
        0700-2200-0002-0022, 0700-2300-0002-0022, 0701-2000-0002-0022,
        0701-2100-0002-0022, 0701-2200-0002-0022, 0701-2300-0002-0022,
        0702-2000-0002-0022, 0702-2100-0002-0022, 0702-2200-0002-0022,
        0702-2300-0002-0022, 0703-2000-0002-0022, 0703-2100-0002-0022,
        0703-2200-0002-0022, 0703-2300-0002-0022, 0704-2000-0002-0022,
        0704-2100-0002-0022, 0704-2200-0002-0022, 0704-2300-0002-0022,
        0705-2000-0002-0022, 0705-2100-0002-0022, 0705-2200-0002-0022,
        0705-2300-0002-0022, 0706-2000-0002-0022, 0706-2100-0002-0022,
        0706-2200-0002-0022, 0706-2300-0002-0022, 0707-2000-0002-0022,
        0707-2100-0002-0022, 0707-2200-0002-0022, 0707-2300-0002-0022,
        1800-2000-0002-0022, 1800-2100-0002-0022, 1800-2200-0002-0022,
        1800-2300-0002-0022, 1801-2000-0002-0022, 1801-2100-0002-0022,
        1801-2200-0002-0022, 1801-2300-0002-0022, 1802-2000-0002-0022,
        1802-2100-0002-0022, 1802-2200-0002-0022, 1802-2300-0002-0022,
        1803-2000-0002-0022, 1803-2100-0002-0022, 1803-2200-0002-0022,
        1803-2300-0002-0022, 1804-2000-0002-0022, 1804-2100-0002-0022,
        1804-2200-0002-0022, 1804-2300-0002-0022, 1805-2000-0002-0022,
        1805-2100-0002-0022, 1805-2200-0002-0022, 1805-2300-0002-0022,
        1806-2000-0002-0022, 1806-2100-0002-0022, 1806-2200-0002-0022,
        1806-2300-0002-0022, 1807-2000-0002-0022, 1807-2100-0002-0022,
        1807-2200-0002-0022, 1807-2300-0002-0022
      </p>
      <ul>
        <li>
          <a href="/en/h2/troubleshooting/hmscode/0700_2000_0002_0022" class="is-internal-link is-valid-page">X1 Series/P1 Series/H2 series/P2S</a>
        </li>
      </ul>
    </blockquote>*/


// // Regular expressions to extract HMS codes and their info
// const hmsCodePattern = /<h3[^>]*id="([^"]+)"[^>]*>.*?<\/h3>([\s\S]*?)(?=<h3|<h2|$)/g;
// const synonymsPattern = /<p><strong>Synonyms:<\/strong>([\s\S]*?)<\/p>/;
// const wikiLinkPattern = /https:\/\/wiki\.bambulab\.com\/[^\s"<>]+/;

// const p1SeriesCodes = {};
// let match;

// console.log('Parsing HMS codes...');

// while ((match = hmsCodePattern.exec(html)) !== null) {
//     const sectionId = match[1];
//     const sectionContent = match[2];
    
//     // Extract the HMS code from the section ID
//     // Format is typically like "0300_0100_0001_000A"
//     const hmsCode = sectionId.replace(/_/g, '-');
    
//     // Check if this section mentions P1 series or P1S in the synonyms
//     const synonymsMatch = sectionContent.match(synonymsPattern);
//     if (!synonymsMatch) continue;
    
//     const synonymsText = synonymsMatch[1];
    
//     // Check if P1 series or P1S is mentioned
//     if (synonymsText.includes('P1 series') || synonymsText.includes('P1S')) {
//         // Extract the wiki link
//         const wikiLinkMatch = sectionContent.match(wikiLinkPattern);
//         if (wikiLinkMatch) {
//             const wikiUrl = wikiLinkMatch[0];
//             p1SeriesCodes[hmsCode] = wikiUrl;
//             console.log(`Found: ${hmsCode} -> ${wikiUrl}`);
//         }
//     }
// }

// // Also parse the table format if codes are in tables
// const tableRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
// const tableCellPattern = /<td[^>]*>([\s\S]*?)<\/td>/g;

// let tableMatch;
// while ((tableMatch = tableRowPattern.exec(html)) !== null) {
//     const rowContent = tableMatch[1];
//     const cells = [];
//     let cellMatch;
    
//     while ((cellMatch = tableCellPattern.exec(rowContent)) !== null) {
//         cells.push(cellMatch[1].trim());
//     }
    
//     // Look for HMS code patterns in cells
//     if (cells.length > 0) {
//         for (const cell of cells) {
//             // Check if cell contains an HMS code (format: ####-####-####-####)
//             const codeMatch = cell.match(/(\d{4}-\d{4}-\d{4}-\d{4})/);
//             if (codeMatch) {
//                 const code = codeMatch[1];
//                 // Check if P1 series is mentioned in the row
//                 if (rowContent.includes('P1 series') || rowContent.includes('P1S')) {
//                     const linkMatch = rowContent.match(wikiLinkPattern);
//                     if (linkMatch && !p1SeriesCodes[code]) {
//                         p1SeriesCodes[code] = linkMatch[0];
//                         console.log(`Found (table): ${code} -> ${linkMatch[0]}`);
//                     }
//                 }
//             }
//         }
//     }
// }

// // Write the output JSON file
// console.log(`\nWriting ${Object.keys(p1SeriesCodes).length} codes to ${outputPath}`);
// fs.writeFileSync(outputPath, JSON.stringify(p1SeriesCodes, null, 2));

// console.log('Done!');
// console.log(`\nSummary:`);
// console.log(`- Total P1 Series HMS codes found: ${Object.keys(p1SeriesCodes).length}`);
// console.log(`- Output file: ${outputPath}`);
