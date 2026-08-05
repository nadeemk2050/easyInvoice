import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const money = (n) =>
  (isNaN(n) ? 0 : n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const ones = ["","ONE ","TWO ","THREE ","FOUR ","FIVE ","SIX ","SEVEN ","EIGHT ","NINE ","TEN ","ELEVEN ","TWELVE ","THIRTEEN ","FOURTEEN ","FIFTEEN ","SIXTEEN ","SEVENTEEN ","EIGHTEEN ","NINETEEN "];
const tens = ["","","TWENTY ","THIRTY ","FORTY ","FIFTY ","SIXTY ","SEVENTY ","EIGHTY ","NINETY "];

export function numToWords(n, currencyName = "", subunitName = "") {
  if (isNaN(n) || n === 0) return "ZERO";
  n = Math.round(n * 100) / 100;
  let whole = Math.floor(n);
  const cents = Math.round((n - whole) * 100);
  let w = "";
  if (whole >= 1000000) { w += ones[Math.floor(whole/1000000)] + "MILLION "; whole %= 1000000; }
  if (whole >= 1000) { w += convertBelow1000(Math.floor(whole/1000)) + "THOUSAND "; whole %= 1000; }
  w += convertBelow1000(whole);
  
  const curr = (currencyName || "").trim().toUpperCase();
  const sub = (subunitName || "CENTS").trim().toUpperCase();
  
  let result = w.trim();
  if (curr) {
    result += " " + curr;
  }
  if (cents > 0) {
    result += " AND " + convertBelow1000(cents).trim() + " " + sub;
  }
  return result.trim();

  function convertBelow1000(num) {
    let s = "";
    if (num >= 100) { s += ones[Math.floor(num/100)] + "HUNDRED "; num %= 100; }
    if (num >= 20) { s += tens[Math.floor(num/10)]; num %= 10; }
    if (num > 0) s += ones[num];
    return s;
  }
}

/**
 * Generate a pure-jsPDF invoice. Draws everything with text/lines/tables
 * so it's 100% reliable — no html2canvas, no CSP issues, no hidden iframes.
 */
function getImageFormat(dataUrl) {
  if (!dataUrl) return "PNG";
  const match = dataUrl.match(/^data:image\/(\w+);base64/);
  if (match && match[1]) {
    const ext = match[1].toLowerCase();
    if (ext === "jpg" || ext === "jpeg") return "JPEG";
    if (ext === "png") return "PNG";
    if (ext === "webp") return "WEBP";
  }
  return "PNG";
}

function removeTransparency(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        // Fill white background
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Draw the image on top
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.95));
      } catch (err) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

export async function generateInvoicePdf(invoiceData) {
  const {
    seller,
    buyer,
    notifyParty = { name: "", addr1: "", addr2: "", email: "", contact: "" },
    containers = [],
    meta,
    bank,
    items,
    vatPercent,
    advancePercent,
    logo,
    signature,
    stamp,
    logoWidth = 50,
    logoHeight = 14,
    sigWidth = 35,
    sigHeight = 12,
    stampWidth = 36,
    stampHeight = 18,
    titleText = "COMMERCIAL INVOICE",
    titleFontSize = 16,
    titleAlign = "right",
    titleXOffset = 0,
    titleYOffset = 0,
  } = invoiceData;

  const cleanLogo = logo ? await removeTransparency(logo) : null;
  const cleanSignature = signature ? await removeTransparency(signature) : null;
  const cleanStamp = stamp ? await removeTransparency(stamp) : null;

  // Calculations
  const totalQty = items.reduce(
    (s, it) => s + (parseFloat(it.qty) || 0),
    0
  );
  const subtotal = items.reduce(
    (s, it) =>
      s + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0),
    0
  );
  const vatAmount = (subtotal * (parseFloat(vatPercent) || 0)) / 100;
  const totalInclVat = subtotal + vatAmount;
  const advanceAmt =
    (totalInclVat * (parseFloat(advancePercent) || 0)) / 100;
  const balance = totalInclVat - advanceAmt;

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      })
      .replace(/ /g, "-");
  };

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  // Global PDF styling: bold dark borders with rounded corners
  doc.setLineWidth(0.5);
  doc.setLineCap(1);  // round cap
  doc.setLineJoin(1); // round join
  const pw = doc.internal.pageSize.getWidth(); // page width
  const ml = 10; // margin-left
  const mr = 10; // margin-right
  const usable = pw - ml - mr;
  const colLeft = usable * 0.55;
  const colRight = usable * 0.45;
  let y = 12;

  // ---------- helper functions ----------
  function setFont(size, style) {
    doc.setFontSize(size);
    if (style === "bold") doc.setFont("Helvetica", "bold");
    else if (style === "italic") doc.setFont("Helvetica", "italic");
    else doc.setFont("Helvetica", "normal");
  }

  function cell(x, w, h, text, opts = {}) {
    const {
      align = "left",
      font = "normal",
      size = 8,
      fill = false,
      fillColor,
      border = true,
      padding = 1,
      valign = "middle",
    } = opts;
    setFont(size, font);
    if (fill && fillColor) {
      doc.setFillColor(...fillColor);
      doc.rect(x, y, w, h, "F");
    }
    if (border) {
      doc.setDrawColor(0);
      doc.rect(x, y, w, h, "S");
    }
    const textX = x + padding;
    const textY = y + h / 2 + size * 0.35;
    doc.text(text, align === "right" ? x + w - padding : textX, textY, {
      align: align === "right" ? "right" : "left",
      maxWidth: w - padding * 2,
    });
  }

  function row(cells, heights = 7) {
    let x = ml;
    cells.forEach((c) => {
      cell(x, c.w || 20, c.h || heights, c.text, c);
      x += c.w || 20;
    });
    y += heights;
  }

  function borderedBlock(x, w, lines, opts = {}) {
    const fontSize = opts.fontSize || 8;
    const lineH = opts.lineH || 5;
    const headingH = lineH + 1; // slightly taller heading bar
    
    const processedLines = [];
    lines.forEach((line, i) => {
      setFont(fontSize, line.bold ? "bold" : "normal");
      const textStr = (line.text || "").trim();
      if (i === 0) {
        processedLines.push({ text: textStr, bold: line.bold });
      } else {
        const wrapped = doc.splitTextToSize(textStr, w - 3);
        if (wrapped.length > 0) {
          wrapped.forEach((wl) => {
            processedLines.push({ text: wl, bold: line.bold });
          });
        } else {
          processedLines.push({ text: "", bold: line.bold });
        }
      }
    });

    const h = processedLines.length * lineH + 1;
    if (processedLines[0]?.bold) {
      doc.setFillColor(233, 233, 233);
      doc.rect(x, y, w, headingH, "F");
    }
    doc.setDrawColor(0);
    doc.rect(x, y, w, h, "S");
    
    processedLines.forEach((line, i) => {
      setFont(fontSize, line.bold ? "bold" : "normal");
      const ly = i === 0 ? y + headingH / 2 : y + headingH + (i - 1) * lineH + lineH / 2;
      doc.text(
        line.text,
        x + 1.5,
        ly + fontSize * 0.17,
        { maxWidth: w - 3 }
      );
    });
    y += h;
  }

  // ============== HEADER ==============
  // Left: logo or company name
  if (cleanLogo) {
    try {
      const format = getImageFormat(cleanLogo);
      doc.addImage(cleanLogo, format, ml, y, logoWidth, logoHeight);
    } catch (e) {
      try {
        doc.addImage(cleanLogo, ml, y, logoWidth, logoHeight);
      } catch (e2) {
        setFont(14, "bold");
        doc.text(seller.name || "YOUR COMPANY", ml, y + 6);
      }
    }
  } else {
    setFont(14, "bold");
    doc.text(seller.name || "YOUR COMPANY", ml, y + 6);
  }

  // Dynamic Title rendering
  let titleX = pw - mr - 4;
  if (titleAlign === "center") {
    titleX = pw / 2;
  } else if (titleAlign === "left") {
    titleX = ml;
  }
  titleX += titleXOffset;
  const titleY = y + 6 + titleYOffset;

  setFont(titleFontSize, "bold");
  doc.text(titleText || "INVOICE", titleX, titleY, { align: titleAlign });
  
  const logoH = cleanLogo ? logoHeight : 14;
  y += Math.max(logoH, 14) + 8;

  // ============== TOP SECTION: SELLER (left) + META (right) ==============
  const topStartY = y;

  // --- SELLER block (left) ---
  const sellerLines = [
    { text: "SELLER", bold: true },
  ];
  if (seller.name) sellerLines.push({ text: seller.name, bold: true });
  if (seller.addr1) sellerLines.push({ text: seller.addr1 });
  if (seller.addr2) sellerLines.push({ text: seller.addr2 });
  if (seller.trn) sellerLines.push({ text: `TRN NO : ${seller.trn}` });
  if (seller.contact) sellerLines.push({ text: `CONTACT : ${seller.contact}` });
  if (seller.email) sellerLines.push({ text: `EMAIL : ${seller.email}` });
  
  borderedBlock(ml, colLeft, sellerLines, { lineH: 4.0, fontSize: 7.5 });

  const sellerBlockEnd = y;

  // --- META block (right) ---
  const metaData = [
    [
      { text: "INVOICE NO", bold: true, fill: true, fillColor: [233, 233, 233] },
      { text: "DATE", bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.invoiceNo || "", align: "center" },
      { text: fmtDate(meta.date), align: "center" },
    ],
    [
      { text: "SUPPLIER PO", bold: true, fill: true, fillColor: [233, 233, 233] },
      { text: "PO DATE", bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.supplierPo || "", align: "center" },
      { text: fmtDate(meta.poDate), align: "center" },
    ],
    [
      { text: "TRANSPORT TYPE", bold: true, fill: true, fillColor: [233, 233, 233] },
      { text: "DRIVER /VESSEL NO", bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.transportType || "", align: "center" },
      { text: meta.driverVessel || "", align: "center" },
    ],
    [
      { text: "LOADING AT", bold: true, fill: true, fillColor: [233, 233, 233] },
      { text: "FINAL DESTINATION", bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.loadingAt || "", align: "center" },
      { text: meta.finalDestination || "", align: "center" },
    ],
  ];

  y = topStartY;
  const colW = colRight / 2;
  metaData.forEach((rowData) => {
    const hasSpan = rowData.some((c) => c.colSpan === 2);
    const xStart = ml + colLeft;

    // Calculate required height for text wrapping
    let maxLines = 1;
    rowData.forEach((c) => {
      if (c.text && !c.bold) {
        setFont(7.5, "normal");
        const lines = doc.splitTextToSize(c.text, c.colSpan === 2 ? colRight - 2 : colW - 2);
        maxLines = Math.max(maxLines, lines.length);
      }
    });
    const h = Math.max(7, maxLines * 4 + 2);

    if (hasSpan) {
      const cell = rowData.find((c) => c.colSpan === 2);
      if (cell.fill) {
        doc.setFillColor(...cell.fillColor);
        doc.rect(xStart, y, colRight, h, "F");
      }
      doc.setDrawColor(0);
      doc.rect(xStart, y, colRight, h, "S");
      setFont(7.5, cell.bold ? "bold" : "normal");
      if (cell.text && !cell.bold) {
        // Multi-line text - use splitTextToSize
        const lines = doc.splitTextToSize(cell.text || "", colRight - 2);
        lines.forEach((line, li) => {
          const lx = cell.align === "center" ? xStart + colRight / 2 : xStart + 1;
          doc.text(line, lx, y + 3 + li * 4 + 7.5 * 0.35, {
            align: cell.align === "center" ? "center" : "left",
          });
        });
      } else {
        doc.text(cell.text || "", xStart + 1, y + h / 2 + 7.5 * 0.35, {
          align: cell.align === "center" ? "center" : "left",
          maxWidth: colRight - 2,
        });
      }
    } else {
      rowData.forEach((c, ci) => {
        if (c.fill) {
          doc.setFillColor(...c.fillColor);
          doc.rect(xStart + ci * colW, y, colW, h, "F");
        }
        doc.setDrawColor(0);
        doc.rect(xStart + ci * colW, y, colW, h, "S");
        setFont(7.5, c.bold ? "bold" : "normal");
        if (c.text && !c.bold) {
          const lines = doc.splitTextToSize(c.text || "", colW - 2);
          lines.forEach((line, li) => {
            const lx = c.align === "center" ? xStart + ci * colW + colW / 2 : xStart + ci * colW + 1;
            doc.text(line, lx, y + 3 + li * 4 + 7.5 * 0.35, {
              align: c.align === "center" ? "center" : "left",
            });
          });
        } else {
          const tx = c.align === "center" ? xStart + ci * colW + colW / 2 : xStart + ci * colW + 1;
          doc.text(c.text || "", tx, y + h / 2 + 7.5 * 0.35, {
            align: c.align === "center" ? "center" : "left",
            maxWidth: colW - 2,
          });
        }
      });
    }
    y += h;
  });
  // Save where the meta/right column ends, then reset y to Seller's bottom
  const metaBlockEnd = y;
  y = sellerBlockEnd;

  // ============== BUYER (left) + MISC (right) ==============
  const buyerStartY = y;

  // --- BUYER block (left) ---
  const buyerLines = [
    { text: "BUYER / CONSIGNEE", bold: true },
  ];
  if (buyer.name) buyerLines.push({ text: buyer.name, bold: true });
  if (buyer.addr1) buyerLines.push({ text: buyer.addr1 });
  if (buyer.addr2) buyerLines.push({ text: buyer.addr2 });
  
  let gstPanParts = [];
  if (buyer.gst) gstPanParts.push(`GST: ${buyer.gst}`);
  if (buyer.pan) gstPanParts.push(`PAN: ${buyer.pan}`);
  if (gstPanParts.length > 0) {
    buyerLines.push({ text: gstPanParts.join("     ") });
  }
  
  if (buyer.contact) buyerLines.push({ text: `CONTACT : ${buyer.contact}` });
  if (buyer.email) buyerLines.push({ text: `EMAIL : ${buyer.email}` });
  
  // --- NOTIFY PARTY block construction ---
  const notifyLines = [
    { text: "NOTIFY PARTY", bold: true },
  ];
  if (notifyParty.name && notifyParty.name !== "—") {
    notifyLines.push({ text: notifyParty.name, bold: true });
  }
  if (notifyParty.addr1) notifyLines.push({ text: notifyParty.addr1 });
  if (notifyParty.addr2) notifyLines.push({ text: notifyParty.addr2 });
  if (notifyParty.email) notifyLines.push({ text: `EMAIL : ${notifyParty.email}` });
  if (notifyParty.contact) notifyLines.push({ text: `CONTACT : ${notifyParty.contact}` });

  const hasNotify = notifyLines.length > 1;

  const enteredContainers = (containers || []).filter(c => (c.containerNo && c.containerNo.trim()) || (c.sealNo && c.sealNo.trim()));
  const hasContainers = enteredContainers.length > 0;
  const containerLines = [
    { text: "MARKS & NO.", bold: true }
  ];
  enteredContainers.forEach((c) => {
    let parts = [];
    if (c.containerNo) parts.push(`CONT NO: ${c.containerNo}`);
    if (c.sealNo) parts.push(`SEAL NO: ${c.sealNo}`);
    containerLines.push({ text: parts.join(", ") });
  });

  borderedBlock(ml, colLeft, buyerLines, { lineH: 4.0, fontSize: 7.5 });
  const buyerBlockEnd = y;

  if (hasNotify) {
    borderedBlock(ml, colLeft, notifyLines, { lineH: 4.0, fontSize: 7.5 });
  }
  const notifyBlockEnd = y;

  // --- MISC block (right, continues from where meta block ended) ---
  y = metaBlockEnd;
  const miscData = [
    [
      { text: "PACKING", colSpan: 2, bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.packing || "", colSpan: 2 },
    ],
    [
      { text: "PAYMENT TERMS", colSpan: 2, bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.paymentTerms || "", colSpan: 2 },
    ],
    [
      { text: "ORIGIN OF GOODS", colSpan: 2, bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.originOfGoods || "", colSpan: 2 },
    ],
  ];

  miscData.forEach((rowData) => {
    const cell = rowData[0];
    const xStart = ml + colLeft;

    // Calculate height for text wrapping
    let reqH = 7;
    if (cell.text && !cell.bold) {
      setFont(7.5, "normal");
      const lines = doc.splitTextToSize(cell.text || "", colRight - 2);
      reqH = Math.max(7, lines.length * 4 + 2);
    }
    const h = reqH;

    if (cell.fill) {
      doc.setFillColor(...cell.fillColor);
      doc.rect(xStart, y, colRight, h, "F");
    }
    doc.setDrawColor(0);
    doc.rect(xStart, y, colRight, h, "S");
    setFont(7.5, cell.bold ? "bold" : "normal");

    if (cell.text && !cell.bold) {
      const lines = doc.splitTextToSize(cell.text || "", colRight - 2);
      lines.forEach((line, li) => {
        const lx = cell.align === "center" ? xStart + colRight / 2 : xStart + 1;
        doc.text(line, lx, y + 3 + li * 4 + 7.5 * 0.35, {
          align: cell.align === "center" ? "center" : "left",
        });
      });
    } else {
      doc.text(cell.text || "", xStart + 1, y + h / 2 + 7.5 * 0.35, {
        align: cell.align === "center" ? "center" : "left",
        maxWidth: colRight - 2,
      });
    }
    y += h;
  });
  y = Math.max(y, notifyBlockEnd) + 1;

  // ============== LINE ITEMS TABLE ==============
  const tableBody = items.map((it, i) => {
    const amt = (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0);
    return [
      String(i + 1),
      it.description,
      it.qty,
      it.rate,
      it.per,
      amt ? money(amt) : "",
    ];
  });

  // Blank rows to fill table (5 lines total)
  const blankRows = Math.max(0, 5 - items.length);
  for (let i = 0; i < blankRows; i++) {
    tableBody.push(["", "", "", "", "", ""]);
  }

  // Total row
  tableBody.push([
    {
      content: "TOTAL",
      styles: { fontStyle: "bold", halign: "center" },
      colSpan: 2,
    },
    {
      content: totalQty ? totalQty.toFixed(3) : "",
      styles: { fontStyle: "bold", halign: "right" },
    },
    "",
    {
      content: meta.currency || "",
      styles: { fontStyle: "bold", halign: "center" },
    },
    {
      content: money(subtotal),
      styles: { fontStyle: "bold", halign: "right" },
    },
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: ml, right: mr },
    tableWidth: usable,
    head: [
      [
        { content: "SR.", styles: { halign: "center" } },
        { content: "MATERIAL DESCRIPTION" },
        { content: "QTY", styles: { halign: "center" } },
        { content: "RATE", styles: { halign: "center" } },
        { content: "PER", styles: { halign: "center" } },
        { content: "AMOUNT", styles: { halign: "center" } },
      ],
    ],
    body: tableBody,
    headStyles: {
      fillColor: [233, 233, 233],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
    },
    bodyStyles: {
      fontSize: 8,
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 28, halign: "right" },
    },
    didParseCell(data) {
      // Highlight TOTAL row
      if (
        data.section === "body" &&
        data.cell.text &&
        data.cell.text[0] === "TOTAL"
      ) {
        data.cell.styles.fillColor = [233, 233, 233];
        data.cell.styles.fontStyle = "bold";
      }
    },
    theme: "grid",
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.5,
  });

  y = doc.lastAutoTable.finalY + 4;

  // ============== MARKS & NO. + AMOUNT IN WORDS + TOTALS ==============
  const totalsStartY = y;

  // --- MARKS & NO. block (left, above AMOUNT IN WORDS) ---
  if (hasContainers) {
    borderedBlock(ml, colLeft, containerLines, { lineH: 4.0, fontSize: 7.5 });
    y += 2; // small gap before AMOUNT IN WORDS
  }

  // --- AMOUNT IN WORDS (left, auto-filled from total) ---
  const autoWords = meta.amountInWords || numToWords(totalInclVat, meta.currency, meta.subunit);
  const wordsLinesArr = doc.splitTextToSize(autoWords, colLeft - 2);
  const wordsH = Math.max(12, wordsLinesArr.length * 4 + 6);
  doc.setDrawColor(0);
  doc.rect(ml, y, colLeft, wordsH, "S");
  setFont(7.5, "bold");
  doc.text("AMOUNT IN WORDS", ml + 1, y + 2 + 7.5 * 0.35);
  setFont(7.5, "normal");
  wordsLinesArr.forEach((line, li) => {
    doc.text(line, ml + 1, y + 7 + li * 4 + 7.5 * 0.35, { maxWidth: colLeft - 2 });
  });

  const leftSideEnd = y + wordsH;

  // --- TOTALS (right) ---
  const totalsX = ml + colLeft;
  const totalsData = [
    [`VAT @ ${vatPercent}%`, vatAmount ? money(vatAmount) : "-"],
    ["TOTAL INCL VAT", money(totalInclVat)],
    [`ADVANCE ${advancePercent}%`, money(advanceAmt)],
    ["BALANCE TO PAY", money(balance)],
  ];

  // Draw totals table manually starting at totalsStartY
  const totalsH = totalsData.length * 6 + 1;
  doc.rect(totalsX, totalsStartY, colRight, totalsH, "S");
  totalsData.forEach((row, i) => {
    const ry = totalsStartY + i * 6;
    const isLast = i === totalsData.length - 1;
    setFont(isLast ? 6.5 : 7.5, isLast ? "bold" : "normal");

    if (isLast) doc.setTextColor(26, 79, 160);
    else doc.setTextColor(0, 0, 0);

    doc.text(row[0], totalsX + 2, ry + 3 + 7.5 * 0.35, {
      maxWidth: colRight / 2 - 2,
    });
    doc.text(row[1], totalsX + colRight - 2, ry + 3 + 7.5 * 0.35, {
      align: "right",
      maxWidth: colRight / 2 - 2,
    });
  });
  doc.setTextColor(0, 0, 0);

  y = Math.max(leftSideEnd, totalsStartY + totalsH) + 4;

  // ============== BANK DETAILS + SIGNATURE ==============
  // --- BANK DETAILS (left) ---
  const bankLines = [
    { text: "BANK DETAILS", bold: true },
    { text: `ACC NAME : ${bank.accName}`, rich: true },
    { text: `BANK NAME : ${bank.bankName}` },
    { text: `ACC NO : ${bank.accNo}` },
    { text: `IBAN NO : ${bank.iban}` },
    { text: `SWIFT NO : ${bank.swift}` },
    { text: `ADDRESS : ${bank.address}` },
  ];
  const bankH = bankLines.length * 5 + 2;
  doc.setDrawColor(0);
  doc.rect(ml, y, colLeft, bankH, "S");
  bankLines.forEach((line, i) => {
    setFont(7.5, line.bold ? "bold" : "normal");
    doc.text(line.text, ml + 1.5, y + 2 + i * 5 + 7.5 * 0.35, {
      maxWidth: colLeft - 3,
    });
  });

  // --- SIGNATURE (right) ---
  const sigX = ml + colLeft;
  const sigH = bankH;
  doc.setDrawColor(0);
  doc.rect(sigX, y, colRight, sigH, "S");
  setFont(7.5, "normal");
  doc.text("FOR", sigX + colRight / 2, y + 5, { align: "center" });
  setFont(7.5, "bold");
  doc.text(seller.name, sigX + colRight / 2, y + 11, { align: "center" });

  const imgY = y + 14;
  if (cleanSignature && cleanStamp) {
    // Both present: draw side-by-side
    // Signature on the left, Stamp on the right
    const leftCenterX = sigX + colRight / 4;
    const rightCenterX = sigX + (3 * colRight) / 4;
    
    try {
      const format = getImageFormat(cleanSignature);
      doc.addImage(cleanSignature, format, leftCenterX - (sigWidth / 2), imgY, sigWidth, sigHeight);
    } catch (e) {
      try { doc.addImage(cleanSignature, leftCenterX - (sigWidth / 2), imgY, sigWidth, sigHeight); } catch (e2) {}
    }
    
    try {
      const format = getImageFormat(cleanStamp);
      doc.addImage(cleanStamp, format, rightCenterX - (stampWidth / 2), imgY, stampWidth, stampHeight);
    } catch (e) {
      try { doc.addImage(cleanStamp, rightCenterX - (stampWidth / 2), imgY, stampWidth, stampHeight); } catch (e2) {}
    }
  } else if (cleanSignature) {
    // Only Signature: centered
    try {
      const format = getImageFormat(cleanSignature);
      doc.addImage(cleanSignature, format, sigX + colRight / 2 - (sigWidth / 2), imgY, sigWidth, sigHeight);
    } catch (e) {
      try { doc.addImage(cleanSignature, sigX + colRight / 2 - (sigWidth / 2), imgY, sigWidth, sigHeight); } catch (e2) {}
    }
  } else if (cleanStamp) {
    // Only Stamp: centered
    try {
      const format = getImageFormat(cleanStamp);
      doc.addImage(cleanStamp, format, sigX + colRight / 2 - (stampWidth / 2), imgY, stampWidth, stampHeight);
    } catch (e) {
      try { doc.addImage(cleanStamp, sigX + colRight / 2 - (stampWidth / 2), imgY, stampWidth, stampHeight); } catch (e2) {}
    }
  }
  setFont(7, "normal");
  doc.text("AUTH SIGNATORY", sigX + colRight / 2, y + sigH - 2, {
    align: "center",
  });

  // Save
  const filename = `invoice-${meta.invoiceNo || "easyInvoice"}.pdf`;
  doc.save(filename);
  return filename;
}

export async function generatePackingListPdf(packingData) {
  const {
    seller,
    buyer,
    notifyParty = { name: "", addr1: "", addr2: "", email: "", contact: "" },
    meta,
    packingItems = [],
    logo,
    signature,
    stamp,
    logoWidth = 50,
    logoHeight = 14,
    sigWidth = 35,
    sigHeight = 12,
    stampWidth = 36,
    stampHeight = 18,
    titleText = "PACKING LIST",
    titleFontSize = 16,
    titleAlign = "right",
    titleXOffset = 0,
    titleYOffset = 0,
  } = packingData;

  const cleanLogo = logo ? await removeTransparency(logo) : null;
  const cleanSignature = signature ? await removeTransparency(signature) : null;
  const cleanStamp = stamp ? await removeTransparency(stamp) : null;

  // Weights Calculations
  const totalGross = packingItems.reduce((s, it) => s + (parseFloat(it.grossWeight) || 0), 0);
  const totalTare = packingItems.reduce((s, it) => s + (parseFloat(it.tareWeight) || 0), 0);
  const totalNet = packingItems.reduce((s, it) => s + (parseFloat(it.netWeight) || 0), 0);

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      })
      .replace(/ /g, "-");
  };

  // Initialize jsPDF
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const ml = 12;
  const mr = 12;
  const usable = 210 - ml - mr; // 186
  const colLeft = 93;
  const colRight = 93;

  let y = 14;

  const setFont = (size, style = "normal") => {
    doc.setFont("Helvetica", style);
    doc.setFontSize(size);
  };

  // --- HEADER SECTION (Logo + Title) ---
  if (cleanLogo) {
    try {
      const format = getImageFormat(cleanLogo);
      doc.addImage(cleanLogo, format, ml, y, logoWidth, logoHeight);
    } catch (e) {
      try { doc.addImage(cleanLogo, ml, y, logoWidth, logoHeight); } catch (e2) {}
    }
  } else {
    setFont(12, "bold");
    doc.text(seller.name || "YOUR COMPANY", ml, y + 8);
  }

  // Draw Title
  setFont(titleFontSize, "bold");
  const actualTitle = titleText || "PACKING LIST";
  const titleW = doc.getTextWidth(actualTitle);
  let titleX = ml + usable - titleW;
  if (titleAlign === "left") titleX = ml;
  else if (titleAlign === "center") titleX = ml + usable / 2 - titleW / 2;
  titleX += titleXOffset;
  const titleY = y + 8 + titleYOffset;

  doc.text(actualTitle, titleX, titleY);
  y += Math.max(logoHeight, 14) + 4;

  // Helper block drawer
  const drawTextBox = (x, yBox, w, title, lines) => {
    let boxH = lines.length * 4.2 + 6;
    doc.setFillColor(233, 233, 233);
    doc.rect(x, yBox, w, 5, "F");
    doc.rect(x, yBox, w, boxH, "S");
    setFont(7.5, "bold");
    doc.text(title, x + 1.5, yBox + 3.5);
    setFont(7.5, "normal");
    lines.forEach((line, i) => {
      doc.text(line, x + 1.5, yBox + 7.5 + i * 4.2);
    });
    return boxH;
  };

  // ============== TOP SECTION: SELLER (left) + META (right) ==============
  const topStartY = y;

  // --- SELLER block (left) ---
  const sellerLines = [
    { text: "SELLER", bold: true },
  ];
  if (seller.name) sellerLines.push({ text: seller.name, bold: true });
  if (seller.addr1) sellerLines.push({ text: seller.addr1 });
  if (seller.addr2) sellerLines.push({ text: seller.addr2 });
  if (seller.trn) sellerLines.push({ text: `TRN NO : ${seller.trn}` });
  if (seller.contact) sellerLines.push({ text: `CONTACT : ${seller.contact}` });
  if (seller.email) sellerLines.push({ text: `EMAIL : ${seller.email}` });
  
  borderedBlock(ml, colLeft, sellerLines, { lineH: 4.0, fontSize: 7.5 });

  const sellerBlockEnd = y;

  // --- META block (right) ---
  const metaData = [
    [
      { text: "INVOICE / REF NO", bold: true, fill: true, fillColor: [233, 233, 233] },
      { text: "DATE", bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.invoiceNo || "", align: "center" },
      { text: fmtDate(meta.date), align: "center" },
    ],
    [
      { text: "SUPPLIER PO", bold: true, fill: true, fillColor: [233, 233, 233] },
      { text: "PO DATE", bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.supplierPo || "", align: "center" },
      { text: fmtDate(meta.poDate), align: "center" },
    ],
    [
      { text: "TRANSPORT TYPE", bold: true, fill: true, fillColor: [233, 233, 233] },
      { text: "DRIVER /VESSEL NO", bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.transportType || "", align: "center" },
      { text: meta.driverVessel || "", align: "center" },
    ],
    [
      { text: "LOADING AT", bold: true, fill: true, fillColor: [233, 233, 233] },
      { text: "FINAL DESTINATION", bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.loadingAt || "", align: "center" },
      { text: meta.finalDestination || "", align: "center" },
    ],
  ];

  y = topStartY;
  const colW = colRight / 2;
  metaData.forEach((rowData) => {
    const hasSpan = rowData.some((c) => c.colSpan === 2);
    const xStart = ml + colLeft;

    // Calculate required height for text wrapping
    let maxLines = 1;
    rowData.forEach((c) => {
      if (c.text && !c.bold) {
        setFont(7.5, "normal");
        const lines = doc.splitTextToSize(c.text, c.colSpan === 2 ? colRight - 2 : colW - 2);
        maxLines = Math.max(maxLines, lines.length);
      }
    });
    const h = Math.max(7, maxLines * 4 + 2);

    if (hasSpan) {
      const cell = rowData.find((c) => c.colSpan === 2);
      if (cell.fill) {
        doc.setFillColor(...cell.fillColor);
        doc.rect(xStart, y, colRight, h, "F");
      }
      doc.setDrawColor(0);
      doc.rect(xStart, y, colRight, h, "S");
      setFont(7.5, cell.bold ? "bold" : "normal");
      if (cell.text && !cell.bold) {
        const lines = doc.splitTextToSize(cell.text || "", colRight - 2);
        lines.forEach((line, li) => {
          const lx = cell.align === "center" ? xStart + colRight / 2 : xStart + 1;
          doc.text(line, lx, y + 3 + li * 4 + 7.5 * 0.35, {
            align: cell.align === "center" ? "center" : "left",
          });
        });
      } else {
        doc.text(cell.text || "", xStart + 1, y + h / 2 + 7.5 * 0.35, {
          align: cell.align === "center" ? "center" : "left",
          maxWidth: colRight - 2,
        });
      }
    } else {
      rowData.forEach((cell, ci) => {
        const cx = xStart + ci * colW;
        if (cell.fill) {
          doc.setFillColor(...cell.fillColor);
          doc.rect(cx, y, colW, h, "F");
        }
        doc.setDrawColor(0);
        doc.rect(cx, y, colW, h, "S");
        setFont(7.5, cell.bold ? "bold" : "normal");
        if (cell.text && !cell.bold) {
          const lines = doc.splitTextToSize(cell.text || "", colW - 2);
          lines.forEach((line, li) => {
            const lx = cell.align === "center" ? cx + colW / 2 : cx + 1;
            doc.text(line, lx, y + 3 + li * 4 + 7.5 * 0.35, {
              align: cell.align === "center" ? "center" : "left",
            });
          });
        } else {
          doc.text(cell.text || "", cx + 1, y + h / 2 + 7.5 * 0.35, {
            align: cell.align === "center" ? "center" : "left",
            maxWidth: colW - 2,
          });
        }
      });
    }
    y += h;
  });

  const metaBlockEnd = y;
  y = Math.max(sellerBlockEnd, metaBlockEnd) + 1;

  // --- BUYER block (left) ---
  const buyerLines = [
    { text: "BUYER / CONSIGNEE", bold: true },
  ];
  if (buyer.name) buyerLines.push({ text: buyer.name, bold: true });
  if (buyer.addr1) buyerLines.push({ text: buyer.addr1 });
  if (buyer.addr2) buyerLines.push({ text: buyer.addr2 });
  
  let gstPanParts = [];
  if (buyer.gst) gstPanParts.push(`GST: ${buyer.gst}`);
  if (buyer.pan) gstPanParts.push(`PAN: ${buyer.pan}`);
  if (gstPanParts.length > 0) {
    buyerLines.push({ text: gstPanParts.join("     ") });
  }
  
  if (buyer.contact) buyerLines.push({ text: `CONTACT : ${buyer.contact}` });
  if (buyer.email) buyerLines.push({ text: `EMAIL : ${buyer.email}` });
  
  // --- NOTIFY PARTY block construction ---
  const notifyLines = [
    { text: "NOTIFY PARTY", bold: true },
  ];
  if (notifyParty.name && notifyParty.name !== "—") {
    notifyLines.push({ text: notifyParty.name, bold: true });
  }
  if (notifyParty.addr1) notifyLines.push({ text: notifyParty.addr1 });
  if (notifyParty.addr2) notifyLines.push({ text: notifyParty.addr2 });
  if (notifyParty.email) notifyLines.push({ text: `EMAIL : ${notifyParty.email}` });
  if (notifyParty.contact) notifyLines.push({ text: `CONTACT : ${notifyParty.contact}` });

  const hasNotify = notifyLines.length > 1;

  borderedBlock(ml, colLeft, buyerLines, { lineH: 4.0, fontSize: 7.5 });
  const buyerBlockEnd = y;

  if (hasNotify) {
    borderedBlock(ml, colLeft, notifyLines, { lineH: 4.0, fontSize: 7.5 });
  }
  const notifyBlockEnd = y;

  // --- MISC block (right) ---
  y = metaBlockEnd;
  const miscData = [
    [
      { text: "PACKING", colSpan: 2, bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.packing || "", colSpan: 2 },
    ],
    [
      { text: "PAYMENT TERMS", colSpan: 2, bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.paymentTerms || "", colSpan: 2 },
    ],
    [
      { text: "ORIGIN OF GOODS", colSpan: 2, bold: true, fill: true, fillColor: [233, 233, 233] },
    ],
    [
      { text: meta.originOfGoods || "", colSpan: 2 },
    ],
  ];

  miscData.forEach((rowData) => {
    const cell = rowData[0];
    const xStart = ml + colLeft;

    // Calculate height for text wrapping
    let reqH = 7;
    if (cell.text && !cell.bold) {
      setFont(7.5, "normal");
      const lines = doc.splitTextToSize(cell.text || "", colRight - 2);
      reqH = Math.max(7, lines.length * 4 + 2);
    }
    const h = reqH;

    if (cell.fill) {
      doc.setFillColor(...cell.fillColor);
      doc.rect(xStart, y, colRight, h, "F");
    }
    doc.setDrawColor(0);
    doc.rect(xStart, y, colRight, h, "S");
    setFont(7.5, cell.bold ? "bold" : "normal");

    if (cell.text && !cell.bold) {
      const lines = doc.splitTextToSize(cell.text || "", colRight - 2);
      lines.forEach((line, li) => {
        const lx = cell.align === "center" ? xStart + colRight / 2 : xStart + 1;
        doc.text(line, lx, y + 3 + li * 4 + 7.5 * 0.35, {
          align: cell.align === "center" ? "center" : "left",
        });
      });
    } else {
      doc.text(cell.text || "", xStart + 1, y + h / 2 + 7.5 * 0.35, {
        align: cell.align === "center" ? "center" : "left",
        maxWidth: colRight - 2,
      });
    }
    y += h;
  });

  y = Math.max(y, notifyBlockEnd) + 1;

  // --- ITEMS TABLE ---
  const tableBody = packingItems.map((it, i) => {
    return [
      String(i + 1),
      it.containerSeal || "",
      it.typeOfPacking || "",
      it.descriptionOfGoods || "",
      `Gross: ${parseFloat(it.grossWeight || 0).toFixed(3)}\nTare: ${parseFloat(it.tareWeight || 0).toFixed(3)}\nNet: ${parseFloat(it.netWeight || 0).toFixed(3)}`,
    ];
  });

  const blankRowsTable = Math.max(0, 5 - packingItems.length);
  for (let i = 0; i < blankRowsTable; i++) {
    tableBody.push(["", "", "", "", ""]);
  }

  // Total weight row
  tableBody.push([
    {
      content: "TOTAL WEIGHT (MTS)",
      styles: { fontStyle: "bold", halign: "center" },
      colSpan: 4,
    },
    {
      content: `Gross: ${totalGross.toFixed(3)}\nTare: ${totalTare.toFixed(3)}\nNet: ${totalNet.toFixed(3)}`,
      styles: { fontStyle: "bold", halign: "right" },
    },
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: ml, right: mr },
    tableWidth: usable,
    head: [
      [
        { content: "SR.", styles: { halign: "center" } },
        { content: "CONTAINER & SEAL NO.", styles: { halign: "center" } },
        { content: "TYPE OF PACKING", styles: { halign: "center" } },
        { content: "DESCRIPTION OF GOODS", styles: { halign: "center" } },
        { content: "QUANTITY (MTS)", styles: { halign: "center" } },
      ],
    ],
    body: tableBody,
    headStyles: {
      fillColor: [233, 233, 233],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
    },
    bodyStyles: {
      fontSize: 8,
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 45, halign: "left" },
      2: { cellWidth: 35, halign: "left" },
      3: { cellWidth: "auto", halign: "left" },
      4: { cellWidth: 42, halign: "right" },
    },
    didParseCell(data) {
      if (
        data.section === "body" &&
        data.cell.text &&
        data.cell.text[0] === "TOTAL WEIGHT (MTS)"
      ) {
        data.cell.styles.fillColor = [233, 233, 233];
        data.cell.styles.fontStyle = "bold";
      }
    },
    theme: "grid",
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.5,
  });

  y = doc.lastAutoTable.finalY + 6;

  // --- SIGNATORY BLOCK ---
  const sigH = 35;
  doc.rect(ml, y, usable, sigH, "S");

  setFont(8, "normal");
  doc.text("FOR", ml + usable - colRight / 2, y + 6, { align: "center" });
  setFont(8, "bold");
  doc.text(seller.name, ml + usable - colRight / 2, y + 12, { align: "center" });

  const imgYSign = y + 14;
  const sigXSign = ml + usable - colRight;
  if (cleanSignature && cleanStamp) {
    const leftCenterX = sigXSign + colRight / 4;
    const rightCenterX = sigXSign + (3 * colRight) / 4;
    
    try {
      const format = getImageFormat(cleanSignature);
      doc.addImage(cleanSignature, format, leftCenterX - (sigWidth / 2), imgYSign, sigWidth, sigHeight);
    } catch (e) {
      try { doc.addImage(cleanSignature, leftCenterX - (sigWidth / 2), imgYSign, sigWidth, sigHeight); } catch (e2) {}
    }
    
    try {
      const format = getImageFormat(cleanStamp);
      doc.addImage(cleanStamp, format, rightCenterX - (stampWidth / 2), imgYSign, stampWidth, stampHeight);
    } catch (e) {
      try { doc.addImage(cleanStamp, rightCenterX - (stampWidth / 2), imgYSign, stampWidth, stampHeight); } catch (e2) {}
    }
  } else if (cleanSignature) {
    try {
      const format = getImageFormat(cleanSignature);
      doc.addImage(cleanSignature, format, sigXSign + colRight / 2 - (sigWidth / 2), imgYSign, sigWidth, sigHeight);
    } catch (e) {
      try { doc.addImage(cleanSignature, sigXSign + colRight / 2 - (sigWidth / 2), imgYSign, sigWidth, sigHeight); } catch (e2) {}
    }
  } else if (cleanStamp) {
    try {
      const format = getImageFormat(cleanStamp);
      doc.addImage(cleanStamp, format, sigXSign + colRight / 2 - (stampWidth / 2), imgYSign, stampWidth, stampHeight);
    } catch (e) {
      try { doc.addImage(cleanStamp, sigXSign + colRight / 2 - (stampWidth / 2), imgYSign, stampWidth, stampHeight); } catch (e2) {}
    }
  }

  setFont(8, "normal");
  doc.text("AUTH SIGNATORY", sigXSign + colRight / 2, y + sigH - 3, { align: "center" });

  const filename = `packing-list-${meta.invoiceNo || "easyInvoice"}.pdf`;
  doc.save(filename);
  return filename;
}
