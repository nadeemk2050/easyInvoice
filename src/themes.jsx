/**
 * easyInvoice — Theme system
 * ------------------------------------------------------------------
 * Each theme = { id, name, swatch, preview (React component), pdf (jsPDF fn) }
 *
 * "classic" is the built-in default theme; its preview lives inline in
 * App.jsx and its PDF generators are the originals in ./pdfGenerator.
 * All new themes below are fully self-contained so the default theme is
 * never disturbed.
 *
 * To add a 5th invoice theme later: create a preview component + a pdf
 * generator, then push { id, name, swatch, preview, pdf } into
 * INVOICE_THEMES. Same pattern for PACKING_THEMES.
 */
import { jsPDF } from "jspdf";
import { generateInvoicePdf, generatePackingListPdf } from "./pdfGenerator";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const money = (n) =>
  (isNaN(n) ? 0 : n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(String(iso) + "T00:00:00");
  if (isNaN(d)) return iso;
  return d
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    })
    .replace(/ /g, "-");
};

function calc(items, vatPercent, advancePercent) {
  const subtotal = items.reduce(
    (s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0),
    0
  );
  const vatAmount = (subtotal * (parseFloat(vatPercent) || 0)) / 100;
  const totalInclVat = subtotal + vatAmount;
  const advanceAmt = (totalInclVat * (parseFloat(advancePercent) || 0)) / 100;
  const balance = totalInclVat - advanceAmt;
  const totalQty = items.reduce((s, it) => s + (parseFloat(it.qty) || 0), 0);
  return { subtotal, vatAmount, totalInclVat, advanceAmt, balance, totalQty };
}

function getImageFormat(dataUrl) {
  if (!dataUrl) return "PNG";
  const m = dataUrl.match(/^data:image\/(\w+);base64/);
  if (m && m[1]) {
    const ext = m[1].toLowerCase();
    if (ext === "jpg" || ext === "jpeg") return "JPEG";
    if (ext === "png") return "PNG";
    if (ext === "webp") return "WEBP";
  }
  return "PNG";
}

function toWhite(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.95));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const hasValue = (obj) =>
  !!obj &&
  Object.values(obj).some((v) => v && String(v).trim().length > 0);

/* ================================================================== */
/* THEME: Montréal (orange accent, light-orange table header)          */
/* ================================================================== */

function MontrealInvoicePreview(props) {
  const {
    seller, buyer, notifyParty, containers = [], meta, items, bank,
    vatPercent, advancePercent, logo, titleText,
  } = props;
  const c = calc(items, vatPercent, advancePercent);
  const shipTo = hasValue(notifyParty) ? notifyParty : buyer;
  const ACCENT = "#FF8C00";
  const HEADER_FILL = "#FFE8CC";
  const LIGHT = "#f6f6f6";
  const BORDER = "1px solid #c9c9c9";
  const cell = (extra = {}) => ({
    border: BORDER,
    padding: "4px 6px",
    fontSize: 10.5,
    verticalAlign: "top",
    ...extra,
  });
  const lbl = (extra = {}) =>
    cell({ background: LIGHT, fontWeight: 700, fontSize: 11, ...extra });
  const containerText = containers
    .map((cc) => [cc.containerNo, cc.sealNo].filter(Boolean).join(" · "))
    .filter(Boolean);

  return (
    <div
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#000",
        width: "100%",
        maxWidth: 780,
        margin: "0 auto",
      }}
    >
      {/* Company header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>
            {seller.name || "YOUR COMPANY"}
          </div>
          {seller.addr1 && <div style={{ fontSize: 11 }}>{seller.addr1}</div>}
          {seller.addr2 && <div style={{ fontSize: 11 }}>{seller.addr2}</div>}
          {(seller.contact || seller.email) && (
            <div style={{ fontSize: 11 }}>
              {[seller.contact, seller.email].filter(Boolean).join("  |  ")}
            </div>
          )}
        </div>
        {logo && (
          <img
            src={logo}
            alt="logo"
            style={{ maxHeight: 64, maxWidth: 170, objectFit: "contain" }}
          />
        )}
      </div>

      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        {titleText || "INVOICE"}
      </div>

      {/* BUYER / CONSIGNEE / NOTIFY PARTY / META */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={lbl({ width: "26%" })}>BUYER / CONSIGNEE</td>
            <td style={lbl({ width: "26%" })}>NOTIFY PARTY</td>
            <td style={lbl({ width: "48%" })}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5 }}>
                <span>INVOICE #</span>
                <span style={{ fontWeight: 400 }}>{meta.invoiceNo}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5 }}>
                <span>DATE</span>
                <span style={{ fontWeight: 400 }}>{fmtDate(meta.date)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5 }}>
                <span>TERMS</span>
                <span style={{ fontWeight: 400, whiteSpace: "pre-line", textAlign: "right" }}>{meta.paymentTerms}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style={cell()}>
              <div style={{ fontWeight: 700, fontSize: 10.5 }}>{buyer.name}</div>
              <div style={{ fontSize: 10.5, whiteSpace: "pre-line" }}>
                {[buyer.addr1, buyer.addr2]
                  .filter(Boolean)
                  .join("\n")}
              </div>
              {(buyer.trn || buyer.gst || buyer.pan) && (
                <div style={{ fontSize: 10.5 }}>
                  {[buyer.trn && `TRN: ${buyer.trn}`, buyer.gst && `GST: ${buyer.gst}`, buyer.pan && `PAN: ${buyer.pan}`].filter(Boolean).join("  ")}
                </div>
              )}
              {(buyer.contact || buyer.email) && (
                <div style={{ fontSize: 10.5 }}>
                  {[buyer.contact, buyer.email].filter(Boolean).join(" · ")}
                </div>
              )}
            </td>
            <td style={cell()}>
              {hasValue(notifyParty) ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: 10.5 }}>{notifyParty.name}</div>
                  <div style={{ fontSize: 10.5, whiteSpace: "pre-line" }}>
                    {[notifyParty.addr1, notifyParty.addr2].filter(Boolean).join("\n")}
                  </div>
                  {(notifyParty.contact || notifyParty.email) && (
                    <div style={{ fontSize: 10.5 }}>
                      {[notifyParty.contact, notifyParty.email].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontStyle: "italic", color: "#888", fontSize: 10.5 }}>SAME AS CONSIGNEE</div>
              )}
            </td>
            <td style={cell()}></td>
          </tr>
        </tbody>
      </table>

      {/* Orange divider */}
      <div style={{ height: 2, background: ACCENT, margin: "10px 0 6px" }} />

      {/* SHIP DATE | CUSTOMER PO NUMBER */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
        <tbody>
          <tr>
            <td style={lbl({ width: "22%" })}>SHIP DATE</td>
            <td style={cell({ width: "22%" })}>{fmtDate(meta.poDate)}</td>
            <td style={lbl({ width: "34%" })}>CUSTOMER PO NUMBER</td>
            <td style={cell({ width: "22%" })}>{meta.supplierPo}</td>
          </tr>
        </tbody>
      </table>

      {/* Items table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <td style={cell({ background: HEADER_FILL, fontWeight: 700, fontSize: 10.5, width: "14%" })}>DATE</td>
            <td style={cell({ background: HEADER_FILL, fontWeight: 700, fontSize: 10.5 })}>ACTIVITY</td>
            <td style={cell({ background: HEADER_FILL, fontWeight: 700, fontSize: 10.5, textAlign: "right", width: "11%" })}>QTY</td>
            <td style={cell({ background: HEADER_FILL, fontWeight: 700, fontSize: 10.5, textAlign: "right", width: "12%" })}>RATE</td>
            <td style={cell({ background: HEADER_FILL, fontWeight: 700, fontSize: 10.5, textAlign: "right", width: "15%" })}>AMOUNT</td>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={cell({ fontSize: 10 })}>{fmtDate(meta.date)}</td>
              <td style={cell({ fontSize: 10, whiteSpace: "pre-line" })}>{it.description}</td>
              <td style={cell({ fontSize: 10, textAlign: "right" })}>{it.qty}</td>
              <td style={cell({ fontSize: 10, textAlign: "right" })}>{money(parseFloat(it.rate) || 0)}</td>
              <td style={cell({ fontSize: 10, textAlign: "right" })}>{money((parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Bottom: left = packing / right = payment */}
      <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
        <div style={{ flex: 1, fontSize: 10.5, lineHeight: 1.6 }}>
          <div>The quantity mentioned is in {items[0]?.per || "mt"}</div>
          {containerText.length > 0 && (
            containerText.map((line, i) => <div key={i}>{line}</div>)
          )}
          {meta.packing && (
            <div style={{ whiteSpace: "pre-line", marginTop: 4 }}>{meta.packing}</div>
          )}
        </div>
        <div style={{ flex: 0.65, border: BORDER }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              padding: "5px 8px",
              borderBottom: BORDER,
            }}
          >
            <span>PAYMENT</span>
            <span>{money(c.advanceAmt)}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 14,
              fontWeight: 800,
              padding: "6px 8px",
              background: HEADER_FILL,
            }}
          >
            <span>BALANCE DUE</span>
            <span>{meta.currency} {money(c.balance)}</span>
          </div>
        </div>
      </div>

      {/* Beneficiary bank block */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <tbody>
          <tr>
            <td style={lbl({ width: "34%" })}>Beneficiary Name:</td>
            <td style={cell()}>{bank.accName}</td>
          </tr>
          <tr>
            <td style={lbl()}>Business Address:</td>
            <td style={cell()}>{bank.address}</td>
          </tr>
          <tr>
            <td style={cell({ background: HEADER_FILL, fontWeight: 700, fontSize: 11 })} colSpan={2}>
              USD Details
            </td>
          </tr>
          <tr>
            <td style={lbl()}>Bank Name:</td>
            <td style={cell()}>{bank.bankName}</td>
          </tr>
          <tr>
            <td style={lbl()}>SWIFT Code:</td>
            <td style={cell()}>{bank.swift}</td>
          </tr>
          <tr>
            <td style={lbl()}>Account No:</td>
            <td style={cell()}>{bank.accNo}</td>
          </tr>
          <tr>
            <td style={lbl()}>IBAN:</td>
            <td style={cell()}>{bank.iban}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================== */
/* THEME: Minimal Clean (thin rules, light, elegant)                   */
/* ================================================================== */

function MinimalInvoicePreview(props) {
  const {
    seller, buyer, notifyParty, meta, items, bank,
    vatPercent, advancePercent, logo, signature, stamp, titleText,
  } = props;
  const c = calc(items, vatPercent, advancePercent);
  const shipTo = hasValue(notifyParty) ? notifyParty : buyer;
  const RULE = "1px solid #e3e3e3";
  const DARK = "#2f2f2f";
  const th = {
    fontSize: 10,
    fontWeight: 700,
    color: "#8a8a8a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    padding: "4px 8px",
    borderBottom: "2px solid " + DARK,
  };
  const tdC = { fontSize: 11, padding: "6px 8px", borderBottom: RULE, verticalAlign: "top" };

  return (
    <div
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        color: DARK,
        width: "100%",
        maxWidth: 780,
        margin: "0 auto",
      }}
    >
      {/* Top strip */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid " + DARK, paddingBottom: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5 }}>{seller.name || "YOUR COMPANY"}</div>
          <div style={{ fontSize: 11, color: "#666" }}>
            {[seller.addr1, seller.addr2].filter(Boolean).join(", ")}
          </div>
          <div style={{ fontSize: 11, color: "#666" }}>
            {[seller.contact, seller.email].filter(Boolean).join("  ·  ")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 300, letterSpacing: 4, color: DARK }}>
            {titleText || "INVOICE"}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            <div>{meta.invoiceNo}</div>
            <div>{fmtDate(meta.date)}</div>
          </div>
        </div>
      </div>

      {/* BUYER / CONSIGNEE & NOTIFY PARTY */}
      <div style={{ display: "flex", gap: 40, marginBottom: 22 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>BUYER / CONSIGNEE</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{buyer.name}</div>
          <div style={{ fontSize: 11, color: "#555", whiteSpace: "pre-line" }}>
            {[buyer.addr1, buyer.addr2].filter(Boolean).join("\n")}
          </div>
          {(buyer.trn || buyer.gst || buyer.pan) && (
            <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>
              {[buyer.trn && `TRN: ${buyer.trn}`, buyer.gst && `GST: ${buyer.gst}`, buyer.pan && `PAN: ${buyer.pan}`].filter(Boolean).join("  ")}
            </div>
          )}
          {(buyer.contact || buyer.email) && <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{[buyer.contact, buyer.email].filter(Boolean).join(" · ")}</div>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>NOTIFY PARTY</div>
          {hasValue(notifyParty) ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{notifyParty.name}</div>
              <div style={{ fontSize: 11, color: "#555", whiteSpace: "pre-line" }}>
                {[notifyParty.addr1, notifyParty.addr2].filter(Boolean).join("\n")}
              </div>
              {(notifyParty.contact || notifyParty.email) && <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{[notifyParty.contact, notifyParty.email].filter(Boolean).join(" · ")}</div>}
            </>
          ) : (
            <div style={{ fontStyle: "italic", color: "#888", fontSize: 11 }}>SAME AS CONSIGNEE</div>
          )}
        </div>
      </div>

      {/* Meta line */}
      <div style={{ display: "flex", gap: 18, fontSize: 10.5, color: "#555", marginBottom: 14 }}>
        {meta.supplierPo && <span><b>PO:</b> {meta.supplierPo}</span>}
        {meta.poDate && <span><b>PO Date:</b> {fmtDate(meta.poDate)}</span>}
        {meta.transportType && <span><b>Transport:</b> {meta.transportType}</span>}
        {meta.driverVessel && <span><b>Vessel:</b> {meta.driverVessel}</span>}
        {meta.paymentTerms && <span style={{ whiteSpace: "pre-line" }}><b>Terms:</b> {meta.paymentTerms}</span>}
      </div>

      {/* Items */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <td style={{ ...th, width: "8%", textAlign: "center" }}>#</td>
            <td style={th}>Description</td>
            <td style={{ ...th, textAlign: "right", width: "12%" }}>Qty</td>
            <td style={{ ...th, textAlign: "right", width: "12%" }}>Rate</td>
            <td style={{ ...th, textAlign: "right", width: "16%" }}>Amount</td>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={{ ...tdC, textAlign: "center", color: "#999" }}>{i + 1}</td>
              <td style={tdC}>{it.description}</td>
              <td style={{ ...tdC, textAlign: "right" }}>{it.qty} {it.per}</td>
              <td style={{ ...tdC, textAlign: "right" }}>{money(parseFloat(it.rate) || 0)}</td>
              <td style={{ ...tdC, textAlign: "right" }}>{money((parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <div style={{ width: 260 }}>
          {[
            ["Subtotal", money(c.subtotal)],
            [`VAT ${vatPercent}%`, money(c.vatAmount)],
            ["Total (incl. VAT)", money(c.totalInclVat)],
            [`Advance ${advancePercent}%`, money(c.advanceAmt)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: RULE }}>
              <span style={{ color: "#666" }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800, paddingTop: 6 }}>
            <span>Balance Due</span>
            <span>{meta.currency} {money(c.balance)}</span>
          </div>
        </div>
      </div>

      {/* Notes + bank */}
      <div style={{ display: "flex", gap: 40, marginTop: 26, fontSize: 10.5, color: "#555" }}>
        <div style={{ flex: 1 }}>
          {meta.packing && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Packing / Notes</div>
              <div style={{ whiteSpace: "pre-line" }}>{meta.packing}</div>
            </>
          )}
          {meta.amountInWords && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: 1, margin: "10px 0 4px" }}>Amount in words</div>
              <div>{meta.amountInWords}</div>
            </>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Payment Details</div>
          <div style={{ whiteSpace: "pre-line" }}>
            {`${bank.accName}\n${bank.bankName}\n${bank.accNo}\n${bank.iban}\n${bank.swift}`.split("\n").filter(Boolean).join("\n")}
          </div>
        </div>
        <div style={{ flex: 0.6, textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Authorized Signature</div>
          <div style={{ minHeight: 44 }}>
            {signature && <img src={signature} alt="sig" style={{ maxHeight: 44, objectFit: "contain" }} />}
            {stamp && <img src={stamp} alt="stamp" style={{ maxHeight: 44, objectFit: "contain", marginLeft: 6 }} />}
          </div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 6 }}>Authorized Signatory</div>
        </div>
      </div>
      {logo && (
        <div style={{ textAlign: "right", marginTop: 10 }}>
          <img src={logo} alt="logo" style={{ maxHeight: 40, objectFit: "contain", opacity: 0.85 }} />
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* THEME: Corporate Blue (navy header band, structured)                */
/* ================================================================== */

function CorporateInvoicePreview(props) {
  const {
    seller, buyer, notifyParty, containers = [], meta, items, bank,
    vatPercent, advancePercent, logo, signature, stamp, titleText,
    titleFontSize = 26, titleAlign = "left", titleXOffset = 0, titleYOffset = 0,
  } = props;
  const c = calc(items, vatPercent, advancePercent);
  const hasNotify = hasValue(notifyParty);
  const NAVY = "#0f4c81";
  const NAVY_DARK = "#0b3a63";
  const SOFT = "#dbe9f6";
  const RULE = "1px solid #c9d6e3";
  const whiteCell = { fontSize: 11, padding: "4px 8px", color: "#fff", fontWeight: 700 };
  const cell = (extra = {}) => ({ border: RULE, padding: "5px 8px", fontSize: 11, verticalAlign: "top", ...extra });
  const lbl = (extra = {}) => cell({ background: SOFT, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: NAVY, ...extra });
  const containerText = containers
    .map((cc) => [cc.containerNo, cc.sealNo].filter(Boolean).join(" · "))
    .filter(Boolean);

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#1c1c1c", width: "100%", maxWidth: 780, margin: "0 auto" }}>
      {/* Navy header band */}
      <div style={{ background: `linear-gradient(90deg, ${NAVY_DARK}, ${NAVY})`, color: "#fff", padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 6, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{seller.name || "YOUR COMPANY"}</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>
            {[seller.addr1, seller.addr2].filter(Boolean).join(", ")}
          </div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>
            {[seller.contact, seller.email].filter(Boolean).join("  ·  ")}
          </div>
        </div>
        {logo && <img src={logo} alt="logo" style={{ maxHeight: 56, maxWidth: 150, objectFit: "contain", background: "#fff", borderRadius: 4, padding: 4 }} />}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12, position: "relative" }}>
        <div style={{
          fontSize: `${titleFontSize || 26}px`,
          fontWeight: 800,
          color: NAVY,
          textAlign: titleAlign || "left",
          transform: `translate(${titleXOffset || 0}px, ${titleYOffset || 0}px)`,
          transition: "transform 0.1s ease",
        }}>
          {titleText || "INVOICE"}
        </div>
        <div style={{ textAlign: "right", fontSize: 11 }}>
          <div><b>Invoice #:</b> {meta.invoiceNo}</div>
          <div><b>Date:</b> {fmtDate(meta.date)}</div>
          <div><b>PO #:</b> {meta.supplierPo}</div>
        </div>
      </div>

      {/* Meta strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: RULE, borderBottom: "none", marginBottom: 6 }}>
        {[
          ["Transport", meta.transportType],
          ["Vessel", meta.driverVessel],
          ["Ship Date", fmtDate(meta.poDate)],
        ].map(([k, v], i) => (
          <div key={i} style={{ borderRight: i < 2 ? RULE : "none", padding: "7px 10px", background: SOFT }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</div>
            <div style={{ fontSize: 11 }}>{v || "—"}</div>
          </div>
        ))}
      </div>

      {/* Payment Terms — dedicated highlighted band */}
      {(meta.paymentTerms || "").trim() ? (
        <div
          style={{
            border: RULE,
            borderLeft: "4px solid #f0a500",
            background: "#fff7e0",
            marginBottom: 14,
            padding: "7px 10px",
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 800, color: "#9a6b00", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
            Payment Terms
          </div>
          <div style={{ fontSize: 11, whiteSpace: "pre-line", lineHeight: 1.5 }}>{meta.paymentTerms}</div>
        </div>
      ) : (
        <div style={{ height: 6 }} />
      )}

      {/* BUYER / CONSIGNEE & NOTIFY PARTY */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <tbody>
          <tr>
            <td style={lbl({ width: "50%" })}>BUYER / CONSIGNEE</td>
            <td style={lbl({ width: "50%" })}>NOTIFY PARTY</td>
          </tr>
          <tr>
            <td style={cell()}>
              <div style={{ fontWeight: 700 }}>{buyer.name}</div>
              <div style={{ whiteSpace: "pre-line" }}>{[buyer.addr1, buyer.addr2].filter(Boolean).join("\n")}</div>
              {(buyer.trn || buyer.gst || buyer.pan) && (
                <div style={{ fontSize: 10, marginTop: 2 }}>
                  {[buyer.trn && `TRN: ${buyer.trn}`, buyer.gst && `GST: ${buyer.gst}`, buyer.pan && `PAN: ${buyer.pan}`].filter(Boolean).join("  ")}
                </div>
              )}
              {(buyer.contact || buyer.email) && <div style={{ fontSize: 10, marginTop: 2 }}>{[buyer.contact, buyer.email].filter(Boolean).join(" · ")}</div>}
            </td>
            <td style={cell()}>
              {hasNotify ? (
                <>
                  <div style={{ fontWeight: 700 }}>{notifyParty.name}</div>
                  <div style={{ whiteSpace: "pre-line" }}>{[notifyParty.addr1, notifyParty.addr2].filter(Boolean).join("\n")}</div>
                  {(notifyParty.contact || notifyParty.email) && <div style={{ fontSize: 10, marginTop: 2 }}>{[notifyParty.contact, notifyParty.email].filter(Boolean).join(" · ")}</div>}
                </>
              ) : (
                <div style={{ fontStyle: "italic", color: "#888", fontSize: 11 }}>SAME AS CONSIGNEE</div>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Items table with navy header */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: NAVY }}>
            <td style={{ ...whiteCell, width: "6%", textAlign: "center" }}>#</td>
            <td style={whiteCell}>Description</td>
            <td style={{ ...whiteCell, textAlign: "right", width: "11%" }}>Qty</td>
            <td style={{ ...whiteCell, textAlign: "right", width: "12%" }}>Rate</td>
            <td style={{ ...whiteCell, textAlign: "right", width: "15%" }}>Amount</td>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} style={{ background: i % 2 ? "#f6fafd" : "#fff" }}>
              <td style={{ ...cell(), textAlign: "center", color: "#888" }}>{i + 1}</td>
              <td style={cell()}>{it.description}</td>
              <td style={{ ...cell(), textAlign: "right" }}>{it.qty} {it.per}</td>
              <td style={{ ...cell(), textAlign: "right" }}>{money(parseFloat(it.rate) || 0)}</td>
              <td style={{ ...cell(), textAlign: "right" }}>{money((parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <div style={{ width: 270 }}>
          {[
            ["Subtotal", money(c.subtotal)],
            [`VAT (${vatPercent}%)`, money(c.vatAmount)],
            ["Total incl. VAT", money(c.totalInclVat)],
            [`Advance (${advancePercent}%)`, money(c.advanceAmt)],
          ].map(([k, v], i) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", fontSize: 11, border: RULE, borderTop: i ? "none" : RULE }}>
              <span style={{ color: NAVY, fontWeight: 700 }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 8px", background: NAVY, color: "#fff", fontSize: 14, fontWeight: 800, borderRadius: "0 0 6px 6px" }}>
            <span>Balance Due</span>
            <span>{meta.currency} {money(c.balance)}</span>
          </div>
        </div>
      </div>

      {/* Footer: notes / bank / signature */}
      <div style={{ display: "flex", gap: 24, marginTop: 22, fontSize: 10.5, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          {containerText.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Shipment Details</div>
              {containerText.map((line, i) => <div key={i}>{line}</div>)}
            </>
          )}
          {meta.packing && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.5, margin: "8px 0 4px" }}>Packing Details</div>
              <div style={{ whiteSpace: "pre-line" }}>{meta.packing}</div>
            </>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Bank Details</div>
          <div style={{ whiteSpace: "pre-line" }}>
            {[`ACC NAME: ${bank.accName}`, `BANK: ${bank.bankName}`, `ACC NO: ${bank.accNo}`, `IBAN: ${bank.iban}`, `SWIFT: ${bank.swift}`].join("\n")}
          </div>
        </div>
        <div style={{ flex: 0.8, textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Authorized Signatory</div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: 8, minHeight: 48 }}>
            {signature && <img src={signature} alt="sig" style={{ maxHeight: 44, maxWidth: 90, objectFit: "contain" }} />}
            {stamp && <img src={stamp} alt="stamp" style={{ maxHeight: 44, maxWidth: 90, objectFit: "contain" }} />}
          </div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{seller.name}</div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* PDF generators                                                      */
/* ================================================================== */

/* ---- Montréal PDF ---- */
export async function generateMontrealInvoicePdf(invoiceData) {
  const {
    seller, buyer, notifyParty = {}, containers = [], meta, bank, items,
    vatPercent, advancePercent, logo, signature, stamp,
    logoWidth = 90, logoHeight = 28, sigWidth = 40, sigHeight = 14,
    stampWidth = 40, stampHeight = 20, titleText = "INVOICE",
  } = invoiceData;

  const cleanLogo = await toWhite(logo);
  const cleanSignature = await toWhite(signature);
  const cleanStamp = await toWhite(stamp);
  const c = calc(items, vatPercent, advancePercent);
  const shipTo = hasValue(notifyParty) ? notifyParty : buyer;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pw = doc.internal.pageSize.getWidth(); // 612
  const ml = 28;
  const usable = pw - ml - ml;
  const ACCENT = [255, 140, 0];
  const HEADER_FILL = [255, 232, 204];
  const LIGHT = [246, 246, 246];
  const GRAY = [200, 200, 200];

  const setFont = (size, style = "normal") => {
    doc.setFontSize(size);
    if (style === "bold") doc.setFont("Helvetica", "bold");
    else if (style === "italic") doc.setFont("Helvetica", "italic");
    else doc.setFont("Helvetica", "normal");
  };
  const text = (t, x, y, align = "left") => {
    if (t === undefined || t === null || t === "") return;
    doc.text(String(t), x, y, { align });
  };
  const fill = (x, y, w, h, color) => {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, y, w, h, "F");
  };
  const box = (x, y, w, h, opts = {}) => {
    const { fillColor, lineColor = GRAY, lineWidth = 0.5, lines = ["T", "B", "L", "R"] } = opts;
    if (fillColor) fill(x, y, w, h, fillColor);
    doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2]);
    doc.setLineWidth(lineWidth);
    if (lines.includes("T")) doc.line(x, y, x + w, y);
    if (lines.includes("B")) doc.line(x, y + h, x + w, y + h);
    if (lines.includes("L")) doc.line(x, y, x, y + h);
    if (lines.includes("R")) doc.line(x + w, y, x + w, y + h);
  };

  let y = 40;

  // Company header
  setFont(17, "bold");
  text(seller.name || "YOUR COMPANY", ml, y);
  y += 14;
  setFont(10, "normal");
  if (seller.addr1) { text(seller.addr1, ml, y); y += 12; }
  if (seller.addr2) { text(seller.addr2, ml, y); y += 12; }
  const contactLine = [seller.contact, seller.email].filter(Boolean).join("  |  ");
  if (contactLine) { text(contactLine, ml, y); y += 12; }

  if (cleanLogo) {
    try {
      doc.addImage(cleanLogo, getImageFormat(cleanLogo), pw - ml - logoWidth, 40, logoWidth, logoHeight);
    } catch {
      try { doc.addImage(cleanLogo, pw - ml - logoWidth, 40, logoWidth, logoHeight); } catch {}
    }
  }

  // Title
  y = Math.max(y + 8, 92);
  setFont(26, "bold");
  text(titleText || "INVOICE", ml, y);
  y += 18;

  // 3-column header row
  const colW = usable / 3;
  const hdrH = 26;
  box(ml, y, colW, hdrH, { fillColor: LIGHT, lines: ["T", "B", "L"] });
  box(ml + colW, y, colW, hdrH, { fillColor: LIGHT, lines: ["T", "B"] });
  box(ml + colW * 2, y, colW, hdrH, { fillColor: LIGHT, lines: ["T", "B", "R"] });
  setFont(9, "bold");
  text("BUYER / CONSIGNEE", ml + 6, y + 16);
  text("NOTIFY PARTY", ml + colW + 6, y + 16);
  text("INVOICE DETAILS", ml + colW * 2 + 6, y + 16);
  y += hdrH;

  // Body row (BUYER / CONSIGNEE, NOTIFY PARTY, META DETAILS)
  const buyerLines = [];
  if (buyer.name) buyerLines.push({ text: buyer.name, bold: true });
  if (buyer.addr1) buyerLines.push({ text: buyer.addr1, bold: false });
  if (buyer.addr2) buyerLines.push({ text: buyer.addr2, bold: false });
  const buyerTax = [buyer.trn && `TRN: ${buyer.trn}`, buyer.gst && `GST: ${buyer.gst}`, buyer.pan && `PAN: ${buyer.pan}`].filter(Boolean).join("  ");
  if (buyerTax) buyerLines.push({ text: buyerTax, bold: false });
  const buyerContact = [buyer.contact, buyer.email].filter(Boolean).join(" · ");
  if (buyerContact) buyerLines.push({ text: buyerContact, bold: false });

  const notifyLines = [];
  if (hasValue(notifyParty)) {
    if (notifyParty.name) notifyLines.push({ text: notifyParty.name, bold: true });
    if (notifyParty.addr1) notifyLines.push({ text: notifyParty.addr1, bold: false });
    if (notifyParty.addr2) notifyLines.push({ text: notifyParty.addr2, bold: false });
    const notifyContact = [notifyParty.contact, notifyParty.email].filter(Boolean).join(" · ");
    if (notifyContact) notifyLines.push({ text: notifyContact, bold: false });
  } else {
    notifyLines.push({ text: "SAME AS CONSIGNEE", bold: false, italic: true, muted: true });
  }

  const metaRows = [
    ["INVOICE #", meta.invoiceNo],
    ["DATE", fmtDate(meta.date)],
    ["TERMS", meta.paymentTerms],
  ];

  const bodyH = Math.max(66, Math.max(buyerLines.length, notifyLines.length) * 11 + 16);
  box(ml, y, colW, bodyH, { lines: ["B", "L"] });
  box(ml + colW, y, colW, bodyH, { lines: ["B"] });
  box(ml + colW * 2, y, colW, bodyH, { lines: ["B", "R"] });

  let by = y + 12;
  buyerLines.forEach((l) => {
    setFont(9, l.bold ? "bold" : "normal");
    doc.setTextColor(0, 0, 0);
    text(l.text, ml + 6, by);
    by += 11;
  });

  let sy = y + 12;
  notifyLines.forEach((l) => {
    setFont(9, l.bold ? "bold" : l.italic ? "italic" : "normal");
    if (l.muted) doc.setTextColor(130, 130, 130);
    else doc.setTextColor(0, 0, 0);
    text(l.text, ml + colW + 6, sy);
    sy += 11;
  });

  let my = y + 12;
  metaRows.forEach(([k, v]) => {
    setFont(8.5, "bold");
    doc.setTextColor(0, 0, 0);
    text(k, ml + colW * 2 + 6, my);
    setFont(8.5, "normal");
    text(String(v || ""), ml + colW * 2 + colW - 6, my, "right");
    my += 14;
  });

  y += bodyH;

  // Orange divider
  doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.setLineWidth(1.4);
  doc.line(ml, y + 6, ml + usable, y + 6);
  y += 14;

  // SHIP DATE / CUSTOMER PO NUMBER
  const r2w1 = usable * 0.22;
  const r2w2 = usable * 0.22;
  const r2w3 = usable * 0.34;
  const r2w4 = usable * 0.22;
  const r2h = 22;
  box(ml, y, r2w1, r2h, { fillColor: LIGHT, lines: ["T", "B", "L"] });
  box(ml + r2w1, y, r2w2, r2h, { lines: ["T", "B"] });
  box(ml + r2w1 + r2w2, y, r2w3, r2h, { fillColor: LIGHT, lines: ["T", "B"] });
  box(ml + r2w1 + r2w2 + r2w3, y, r2w4, r2h, { lines: ["T", "B", "R"] });
  setFont(9, "bold");
  text("SHIP DATE", ml + 6, y + 14);
  setFont(9, "normal");
  text(fmtDate(meta.poDate), ml + r2w1 + 6, y + 14);
  setFont(9, "bold");
  text("CUSTOMER PO NUMBER", ml + r2w1 + r2w2 + 6, y + 14);
  setFont(9, "normal");
  text(String(meta.supplierPo || ""), ml + r2w1 + r2w2 + r2w3 + 6, y + 14);
  y += r2h + 10;

  // Items table
  const itemCols = [
    { w: usable * 0.14, align: "left" },
    { w: usable * 0.48, align: "left" },
    { w: usable * 0.11, align: "right" },
    { w: usable * 0.12, align: "right" },
    { w: usable * 0.15, align: "right" },
  ];
  const ih = 20;
  let ix = ml;
  // header
  itemCols.forEach((col, ci) => {
    const draw = ci === 0 ? ["T", "B", "L"] : ci === itemCols.length - 1 ? ["T", "B", "R"] : ["T", "B"];
    box(ix, y, col.w, ih, { fillColor: HEADER_FILL, lines: draw });
    setFont(9, "bold");
    text(["DATE", "ACTIVITY", "QTY", "RATE", "AMOUNT"][ci], ix + 6, y + 13, col.align === "right" ? "right" : "left");
    ix += col.w;
  });
  y += ih;
  // rows
  setFont(9, "normal");
  items.forEach((it, ri) => {
    ix = ml;
    const vals = [fmtDate(meta.date), it.description, String(it.qty || ""), money(parseFloat(it.rate) || 0), money((parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0))];
    itemCols.forEach((col, ci) => {
      const draw = ci === 0 ? ["B", "L"] : ci === itemCols.length - 1 ? ["B", "R"] : ["B"];
      box(ix, y, col.w, ih, { lines: draw });
      text(String(vals[ci] ?? ""), ix + 6, y + 13, col.align);
      ix += col.w;
    });
    y += ih;
  });

  // Bottom: left packing block / right payment
  const payW = usable * 0.34;
  const payH = 54;
  box(ml + usable - payW, y + 8, payW, payH, { lines: ["T", "B", "L", "R"] });
  setFont(10, "normal");
  text("PAYMENT", ml + usable - payW + 8, y + 24);
  text(money(c.advanceAmt), ml + usable - 8, y + 24, "right");
  doc.setDrawColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.setLineWidth(0.5);
  doc.line(ml + usable - payW, y + 30, ml + usable, y + 30);
  fill(ml + usable - payW, y + 30, payW, payH - 30, HEADER_FILL);
  setFont(12, "bold");
  text("BALANCE DUE", ml + usable - payW + 8, y + 47);
  text(`${meta.currency || ""} ${money(c.balance)}`.trim(), ml + usable - 8, y + 47, "right");

  // left: packing info
  setFont(9, "normal");
  let py = y + 16;
  text(`The quantity mentioned is in ${items[0]?.per || "mt"}`, ml, py); py += 12;
  const containerLines = containers
    .map((cc) => [cc.containerNo && `Container: ${cc.containerNo}`, cc.sealNo && `Seal Number: ${cc.sealNo}`].filter(Boolean).join("  "))
    .filter(Boolean);
  containerLines.forEach((l) => { text(l, ml, py); py += 11; });
  if (meta.packing) {
    meta.packing.split("\n").forEach((l) => { text(l, ml, py); py += 10; });
  }
  y = Math.max(y + 8 + payH, py + 6);

  // Beneficiary bank block
  y += 8;
  const bankRows = [
    ["Beneficiary Name:", bank.accName],
    ["Business Address:", bank.address],
    ["---", null],
    ["Bank Name:", bank.bankName],
    ["SWIFT Code:", bank.swift],
    ["Account No:", bank.accNo],
    ["IBAN:", bank.iban],
  ];
  const brh = 20;
  const bw1 = usable * 0.34;
  bankRows.forEach(([k, v], ri) => {
    const draw = ri === 0 ? ["T", "B", "L", "R"] : ["B", "L", "R"];
    if (k === "---") {
      fill(ml, y, usable, brh, HEADER_FILL);
      box(ml, y, usable, brh, { lines: ["B", "L", "R"] });
      setFont(9, "bold");
      text("USD Details", ml + 6, y + 13);
    } else {
      box(ml, y, bw1, brh, { fillColor: LIGHT, lines: ["B", "L"] });
      box(ml + bw1, y, usable - bw1, brh, { lines: ["B", "R"] });
      setFont(9, "bold");
      text(k, ml + 6, y + 13);
      setFont(9, "normal");
      text(String(v || ""), ml + bw1 + 6, y + 13);
    }
    y += brh;
  });

  // Signature row
  y += 14;
  const sigW = usable * 0.45;
  const sigX = ml + usable - sigW;
  setFont(9, "normal");
  text("FOR", sigX + sigW / 2, y, "center");
  setFont(9, "bold");
  text(seller.name || "", sigX + sigW / 2, y + 12, "center");

  const sW = Number(sigWidth) || 36;
  const sH = Number(sigHeight) || 16;
  const stW = Number(stampWidth) || 36;
  const stH = Number(stampHeight) || 20;
  const maxImgH = Math.max(sH, stH, 20);

  const imgTopY = y + 16;
  if (cleanSignature && cleanStamp) {
    const totalW = sW + stW + 8;
    const startX = sigX + (sigW / 2) - (totalW / 2);
    try { doc.addImage(cleanSignature, getImageFormat(cleanSignature), startX, imgTopY + (maxImgH - sH), sW, sH); } catch {}
    try { doc.addImage(cleanStamp, getImageFormat(cleanStamp), startX + sW + 8, imgTopY + (maxImgH - stH), stW, stH); } catch {}
  } else if (cleanSignature) {
    try { doc.addImage(cleanSignature, getImageFormat(cleanSignature), sigX + (sigW / 2) - (sW / 2), imgTopY, sW, sH); } catch {}
  } else if (cleanStamp) {
    try { doc.addImage(cleanStamp, getImageFormat(cleanStamp), sigX + (sigW / 2) - (stW / 2), imgTopY, stW, stH); } catch {}
  }
  setFont(8, "normal");
  text("AUTH SIGNATORY", sigX + sigW / 2, imgTopY + maxImgH + 12, "center");

  const filename = `invoice-${meta.invoiceNo || "easyInvoice"}.pdf`;
  doc.save(filename);
  return filename;
}

/* ---- Minimal PDF ---- */
export async function generateMinimalInvoicePdf(invoiceData) {
  const {
    seller, buyer, notifyParty = {}, meta, bank, items,
    vatPercent, advancePercent, logo, signature, stamp,
    logoWidth = 70, logoHeight = 22, sigWidth = 36, sigHeight = 12,
    stampWidth = 36, stampHeight = 18, titleText = "INVOICE",
  } = invoiceData;

  const cleanLogo = await toWhite(logo);
  const cleanSignature = await toWhite(signature);
  const cleanStamp = await toWhite(stamp);
  const c = calc(items, vatPercent, advancePercent);
  const shipTo = hasValue(notifyParty) ? notifyParty : buyer;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 40;
  const usable = pw - ml - ml;
  const DARK = [47, 47, 47];
  const GRAY = [138, 138, 138];
  const LINE = [227, 227, 227];

  const setFont = (size, style = "normal") => {
    doc.setFontSize(size);
    if (style === "bold") doc.setFont("Helvetica", "bold");
    else if (style === "italic") doc.setFont("Helvetica", "italic");
    else doc.setFont("Helvetica", "normal");
  };
  const text = (t, x, y, align = "left") => {
    if (t === undefined || t === null || t === "") return;
    doc.text(String(t), x, y, { align });
  };

  let y = 44;
  // top strip
  setFont(18, "bold");
  text(seller.name || "YOUR COMPANY", ml, y);
  y += 13;
  setFont(9, "normal");
  const addrLine = [seller.addr1, seller.addr2].filter(Boolean).join(", ");
  if (addrLine) { text(addrLine, ml, y, ); y += 11; }
  const contactLine = [seller.contact, seller.email].filter(Boolean).join("  ·  ");
  if (contactLine) { text(contactLine, ml, y); y += 12; }

  // title right
  setFont(22, "normal");
  text(titleText || "INVOICE", ml + usable, y - 8, "right");
  setFont(9, "normal");
  text(meta.invoiceNo || "", ml + usable, y + 2, "right");
  text(fmtDate(meta.date) || "", ml + usable, y + 12, "right");

  if (cleanLogo) {
    try { doc.addImage(cleanLogo, getImageFormat(cleanLogo), ml + usable - logoWidth, 44, logoWidth, logoHeight); }
    catch { try { doc.addImage(cleanLogo, ml + usable - logoWidth, 44, logoWidth, logoHeight); } catch {} }
  }

  // bottom rule under strip
  doc.setDrawColor(DARK[0], DARK[1], DARK[2]);
  doc.setLineWidth(2.2);
  doc.line(ml, y + 20, ml + usable, y + 20);
  y += 38;

  // BUYER / CONSIGNEE & NOTIFY PARTY
  setFont(8, "bold");
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  text("BUYER / CONSIGNEE", ml, y);
  text("NOTIFY PARTY", ml + usable / 2, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  const buyerLines = [];
  if (buyer.name) buyerLines.push({ text: buyer.name, bold: true });
  if (buyer.addr1) buyerLines.push({ text: buyer.addr1, bold: false });
  if (buyer.addr2) buyerLines.push({ text: buyer.addr2, bold: false });
  const buyerTax = [buyer.trn && `TRN: ${buyer.trn}`, buyer.gst && `GST: ${buyer.gst}`, buyer.pan && `PAN: ${buyer.pan}`].filter(Boolean).join("  ");
  if (buyerTax) buyerLines.push({ text: buyerTax, bold: false });
  const buyerContact = [buyer.contact, buyer.email].filter(Boolean).join(" · ");
  if (buyerContact) buyerLines.push({ text: buyerContact, bold: false });

  const notifyLines = [];
  if (hasValue(notifyParty)) {
    if (notifyParty.name) notifyLines.push({ text: notifyParty.name, bold: true });
    if (notifyParty.addr1) notifyLines.push({ text: notifyParty.addr1, bold: false });
    if (notifyParty.addr2) notifyLines.push({ text: notifyParty.addr2, bold: false });
    const notifyContact = [notifyParty.contact, notifyParty.email].filter(Boolean).join(" · ");
    if (notifyContact) notifyLines.push({ text: notifyContact, bold: false });
  } else {
    notifyLines.push({ text: "SAME AS CONSIGNEE", bold: false, italic: true, muted: true });
  }

  let by = y;
  buyerLines.forEach((l) => {
    setFont(9, l.bold ? "bold" : "normal");
    doc.setTextColor(0, 0, 0);
    text(l.text, ml, by);
    by += 11;
  });

  let shipY = y;
  notifyLines.forEach((l) => {
    setFont(9, l.bold ? "bold" : l.italic ? "italic" : "normal");
    if (l.muted) doc.setTextColor(130, 130, 130);
    else doc.setTextColor(0, 0, 0);
    text(l.text, ml + usable / 2, shipY);
    shipY += 11;
  });

  y = Math.max(by, shipY) + 8;

  // meta line
  y += 6;
  setFont(9, "normal");
  const metaBits = [
    meta.supplierPo && `PO: ${meta.supplierPo}`,
    meta.poDate && `PO Date: ${fmtDate(meta.poDate)}`,
    meta.transportType && `Transport: ${meta.transportType}`,
    meta.driverVessel && `Vessel: ${meta.driverVessel}`,
  ].filter(Boolean).join("    ");
  if (metaBits) { text(metaBits, ml, y); y += 14; }

  // items table header
  const thW = [usable * 0.08, usable * 0.52, usable * 0.13, usable * 0.12, usable * 0.15];
  let ix = ml;
  const headers = ["#", "DESCRIPTION", "QTY", "RATE", "AMOUNT"];
  headers.forEach((h, ci) => {
    setFont(8, "bold");
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    text(h, ix + 6, y + 13, ci === 0 ? "center" : ci > 1 ? "right" : "left");
    doc.setTextColor(0, 0, 0);
    ix += thW[ci];
  });
  doc.setDrawColor(DARK[0], DARK[1], DARK[2]);
  doc.setLineWidth(1);
  doc.line(ml, y + 18, ml + usable, y + 18);
  y += 18 + 6;

  setFont(9, "normal");
  items.forEach((it, ri) => {
    ix = ml;
    const vals = [String(ri + 1), it.description, `${it.qty || ""} ${it.per || ""}`.trim(), money(parseFloat(it.rate) || 0), money((parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0))];
    vals.forEach((v, ci) => {
      text(String(v ?? ""), ix + 6, y + 10, ci === 0 ? "center" : ci > 1 ? "right" : "left");
      ix += thW[ci];
    });
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.5);
    doc.line(ml, y + 16, ml + usable, y + 16);
    y += 22;
  });

  // totals
  y += 6;
  const totW = 250;
  let tx = ml + usable - totW;
  const totalRows = [
    ["Subtotal", money(c.subtotal)],
    [`VAT (${vatPercent}%)`, money(c.vatAmount)],
    ["Total (incl. VAT)", money(c.totalInclVat)],
    [`Advance (${advancePercent}%)`, money(c.advanceAmt)],
  ];
  setFont(9, "normal");
  totalRows.forEach(([k, v]) => {
    text(k, tx, y + 10);
    text(v, tx + totW, y + 10, "right");
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.5);
    doc.line(tx, y + 15, tx + totW, y + 15);
    y += 18;
  });
  setFont(12, "bold");
  text("BALANCE DUE", tx, y + 10);
  text(`${meta.currency || ""} ${money(c.balance)}`.trim(), tx + totW, y + 10, "right");
  y += 26;

  // footer
  setFont(8, "bold");
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  text("PACKING / NOTES", ml, y);
  text("PAYMENT DETAILS", ml + usable / 2, y);
  doc.setTextColor(0, 0, 0);
  y += 10;
  setFont(8.5, "normal");
  let ny = y;
  if (meta.packing) meta.packing.split("\n").forEach((l) => { text(l, ml, ny); ny += 10; });
  let by2 = y;
  const bankLines = [`${bank.accName}`, `${bank.bankName}`, `${bank.accNo}`, `${bank.iban}`, `${bank.swift}`].filter(Boolean);
  bankLines.forEach((l) => { text(l, ml + usable / 2, by2); by2 += 10; });
  y = Math.max(ny, by2) + 8;
  if (meta.amountInWords) {
    setFont(8, "bold");
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    text("AMOUNT IN WORDS", ml, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
    setFont(8.5, "normal");
    text(meta.amountInWords, ml, y);
    y += 14;
  }

  // signature & stamp (side-by-side)
  const sigW = usable * 0.45;
  const sigX = ml + usable - sigW;
  const sW = Number(sigWidth) || 36;
  const sH = Number(sigHeight) || 16;
  const stW = Number(stampWidth) || 36;
  const stH = Number(stampHeight) || 20;
  const maxImgH = Math.max(sH, stH, 20);

  const imgTopY = y + 10;
  if (cleanSignature && cleanStamp) {
    const stampRight = ml + usable;
    const stampLeft = stampRight - stW;
    const sigLeft = stampLeft - sW - 8;
    try { doc.addImage(cleanSignature, getImageFormat(cleanSignature), sigLeft, imgTopY + (maxImgH - sH), sW, sH); } catch {}
    try { doc.addImage(cleanStamp, getImageFormat(cleanStamp), stampLeft, imgTopY + (maxImgH - stH), stW, stH); } catch {}
  } else if (cleanSignature) {
    try { doc.addImage(cleanSignature, getImageFormat(cleanSignature), ml + usable - sW, imgTopY, sW, sH); } catch {}
  } else if (cleanStamp) {
    try { doc.addImage(cleanStamp, getImageFormat(cleanStamp), ml + usable - stW, imgTopY, stW, stH); } catch {}
  }

  setFont(8, "bold");
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  text("AUTHORIZED SIGNATURE", ml + usable, imgTopY + maxImgH + 12, "right");

  const filename = `invoice-${meta.invoiceNo || "easyInvoice"}.pdf`;
  doc.save(filename);
  return filename;
}

/* ---- Corporate Blue PDF ---- */
export async function generateCorporateInvoicePdf(invoiceData) {
  const {
    seller, buyer, notifyParty = {}, containers = [], meta, bank, items,
    vatPercent, advancePercent, logo, signature, stamp,
    logoWidth = 70, logoHeight = 26, sigWidth = 36, sigHeight = 12,
    stampWidth = 36, stampHeight = 18, titleText = "INVOICE",
    titleFontSize = 24, titleAlign = "left", titleXOffset = 0, titleYOffset = 0,
  } = invoiceData;

  const cleanLogo = await toWhite(logo);
  const cleanSignature = await toWhite(signature);
  const cleanStamp = await toWhite(stamp);
  const c = calc(items, vatPercent, advancePercent);

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 36;
  const usable = pw - ml - ml;
  const NAVY = [15, 76, 129];
  const NAVY_DARK = [11, 58, 99];
  const SOFT = [219, 233, 246];
  const LINE = [201, 214, 227];

  const setFont = (size, style = "normal") => {
    doc.setFontSize(size);
    if (style === "bold") doc.setFont("Helvetica", "bold");
    else if (style === "italic") doc.setFont("Helvetica", "italic");
    else doc.setFont("Helvetica", "normal");
  };
  const text = (t, x, y, align = "left") => {
    if (t === undefined || t === null || t === "") return;
    doc.text(String(t), x, y, { align });
  };
  const fillRect = (x, y, w, h, rgb) => {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(x, y, w, h, "F");
  };

  let y = 36;
  // Header band
  const bandH = 62;
  fillRect(ml, y, usable, bandH, NAVY);
  doc.setFillColor(NAVY_DARK[0], NAVY_DARK[1], NAVY_DARK[2]);
  doc.rect(ml, y, 6, bandH, "F");
  doc.setTextColor(255, 255, 255);
  setFont(16, "bold");
  text(seller.name || "YOUR COMPANY", ml + 18, y + 22);
  setFont(9, "normal");
  const addrLine = [seller.addr1, seller.addr2].filter(Boolean).join(", ");
  if (addrLine) text(addrLine, ml + 18, y + 36);
  const contactLine = [seller.contact, seller.email].filter(Boolean).join("  ·  ");
  if (contactLine) text(contactLine, ml + 18, y + 49);
  if (cleanLogo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.rect(ml + usable - 96, y + 6, 88, bandH - 12, "F");
      doc.addImage(cleanLogo, getImageFormat(cleanLogo), ml + usable - 92, y + 9, 80, bandH - 18);
    } catch {
      try { doc.addImage(cleanLogo, getImageFormat(cleanLogo), ml + usable - 92, y + 9, 80, bandH - 18); } catch {}
    }
  }
  doc.setTextColor(0, 0, 0);
  y += bandH + 24;

  // Title + Meta Block (with safe spacing and full custom offset/font size support)
  const tSize = Math.max(10, Math.min(36, Number(titleFontSize) || 24));
  setFont(tSize, "bold");
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);

  const userX = (Number(titleXOffset) || 0) * 1.5;
  const userY = (Number(titleYOffset) || 0) * 1.5;
  let titleX = ml + userX;
  let textAnchor = "left";
  if (titleAlign === "center") {
    titleX = ml + (usable / 2) + userX;
    textAnchor = "center";
  } else if (titleAlign === "right") {
    titleX = ml + usable + userX;
    textAnchor = "right";
  }
  text(titleText || "INVOICE", titleX, y + userY + 4, textAnchor);

  // Metadata right-aligned
  doc.setTextColor(0, 0, 0);
  setFont(9, "normal");
  text(`Invoice #: ${meta.invoiceNo || ""}`, ml + usable, y - 6, "right");
  text(`Date: ${fmtDate(meta.date) || ""}`, ml + usable, y + 6, "right");
  text(`PO #: ${meta.supplierPo || ""}`, ml + usable, y + 18, "right");
  y += Math.max(tSize, 22) + 14;

  // Meta strip (Transport, Vessel, Ship Date)
  const stripW = usable / 3;
  const stripH = 38;
  const stripData = [
    ["Transport", meta.transportType],
    ["Vessel", meta.driverVessel],
    ["Ship Date", fmtDate(meta.poDate)],
  ];
  let sx = ml;
  stripData.forEach(([k, v]) => {
    fillRect(sx, y, stripW, stripH, SOFT);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.6);
    doc.rect(sx, y, stripW, stripH);
    setFont(8, "bold");
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    text(k.toUpperCase(), sx + 8, y + 13);
    doc.setTextColor(0, 0, 0);
    setFont(9, "normal");
    text(String(v || "—"), sx + 8, y + 27);
    sx += stripW;
  });
  y += stripH + 8;

  // Payment Terms — dedicated highlighted band
  if ((meta.paymentTerms || "").trim()) {
    const termsLines = doc.splitTextToSize(String(meta.paymentTerms), usable - 24);
    const termsH = termsLines.length * 11 + 22;
    fillRect(ml, y, usable, termsH, [255, 247, 224]);
    doc.setFillColor(240, 165, 0);
    doc.rect(ml, y, 4, termsH, "F");
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.6);
    doc.rect(ml, y, usable, termsH);
    setFont(8, "bold");
    doc.setTextColor(154, 107, 0);
    text("PAYMENT TERMS", ml + 10, y + 13);
    doc.setTextColor(0, 0, 0);
    setFont(9, "normal");
    let ty = y + 25;
    termsLines.forEach((line) => { text(line, ml + 10, ty); ty += 11; });
    y += termsH + 10;
  } else {
    y += 4;
  }

  // BUYER / CONSIGNEE & NOTIFY PARTY (Completely non-overlapping line rendering)
  const colGap = 12;
  const colW = (usable - colGap) / 2;
  const boxH_hdr = 18;

  const buyerLines = [];
  if (buyer.name) buyerLines.push({ text: buyer.name, bold: true });
  if (buyer.addr1) buyerLines.push({ text: buyer.addr1, bold: false });
  if (buyer.addr2) buyerLines.push({ text: buyer.addr2, bold: false });
  const buyerTax = [buyer.trn && `TRN: ${buyer.trn}`, buyer.gst && `GST: ${buyer.gst}`, buyer.pan && `PAN: ${buyer.pan}`].filter(Boolean).join("  ");
  if (buyerTax) buyerLines.push({ text: buyerTax, bold: false });
  const buyerContact = [buyer.contact, buyer.email].filter(Boolean).join(" · ");
  if (buyerContact) buyerLines.push({ text: buyerContact, bold: false });

  const notifyLines = [];
  const hasNotify = hasValue(notifyParty);
  if (hasNotify) {
    if (notifyParty.name) notifyLines.push({ text: notifyParty.name, bold: true });
    if (notifyParty.addr1) notifyLines.push({ text: notifyParty.addr1, bold: false });
    if (notifyParty.addr2) notifyLines.push({ text: notifyParty.addr2, bold: false });
    const notifyContact = [notifyParty.contact, notifyParty.email].filter(Boolean).join(" · ");
    if (notifyContact) notifyLines.push({ text: notifyContact, bold: false });
  } else {
    notifyLines.push({ text: "SAME AS CONSIGNEE", bold: false, italic: true, muted: true });
  }

  const maxLines = Math.max(buyerLines.length, notifyLines.length, 2);
  const boxH = boxH_hdr + (maxLines * 12) + 8;

  // Left column: BUYER / CONSIGNEE
  fillRect(ml, y, colW, boxH_hdr, SOFT);
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.6);
  doc.rect(ml, y, colW, boxH);
  setFont(8, "bold");
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  text("BUYER / CONSIGNEE", ml + 8, y + 12);

  // Right column: NOTIFY PARTY
  const rightX = ml + colW + colGap;
  fillRect(rightX, y, colW, boxH_hdr, SOFT);
  doc.rect(rightX, y, colW, boxH);
  setFont(8, "bold");
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  text("NOTIFY PARTY", rightX + 8, y + 12);

  // Draw buyer text line by line
  let by = y + boxH_hdr + 12;
  buyerLines.forEach((l) => {
    setFont(9, l.bold ? "bold" : "normal");
    doc.setTextColor(0, 0, 0);
    text(l.text, ml + 8, by);
    by += 12;
  });

  // Draw notify party text line by line
  let ny = y + boxH_hdr + 12;
  notifyLines.forEach((l) => {
    setFont(9, l.bold ? "bold" : l.italic ? "italic" : "normal");
    if (l.muted) doc.setTextColor(130, 130, 130);
    else doc.setTextColor(0, 0, 0);
    text(l.text, rightX + 8, ny);
    ny += 12;
  });

  y += boxH + 12;

  // Items table
  const cols = [usable * 0.06, usable * 0.56, usable * 0.12, usable * 0.12, usable * 0.14];
  const ih = 20;
  let ix = ml;
  const headers = ["#", "DESCRIPTION", "QTY", "RATE", "AMOUNT"];
  fillRect(ml, y, usable, ih, NAVY);
  headers.forEach((h, ci) => {
    setFont(9, "bold");
    doc.setTextColor(255, 255, 255);
    text(h, ix + 6, y + 14, ci === 0 ? "center" : ci > 1 ? "right" : "left");
    doc.setTextColor(0, 0, 0);
    ix += cols[ci];
  });
  y += ih;
  setFont(9, "normal");
  items.forEach((it, ri) => {
    ix = ml;
    const vals = [String(ri + 1), it.description, `${it.qty || ""} ${it.per || ""}`.trim(), money(parseFloat(it.rate) || 0), money((parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0))];
    if (ri % 2 === 1) fillRect(ml, y, usable, ih, [246, 250, 253]);
    vals.forEach((v, ci) => {
      text(String(v ?? ""), ix + 6, y + 14, ci === 0 ? "center" : ci > 1 ? "right" : "left");
      ix += cols[ci];
    });
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.5);
    doc.line(ml, y + ih, ml + usable, y + ih);
    y += ih;
  });

  // Totals block
  y += 8;
  const totW = 250;
  let tx = ml + usable - totW;
  const totalRows = [
    ["Subtotal", money(c.subtotal)],
    [`VAT (${vatPercent}%)`, money(c.vatAmount)],
    ["Total incl. VAT", money(c.totalInclVat)],
    [`Advance (${advancePercent}%)`, money(c.advanceAmt)],
  ];
  setFont(9, "normal");
  totalRows.forEach(([k, v]) => {
    fillRect(tx, y, totW, 18, [246, 250, 253]);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.5);
    doc.rect(tx, y, totW, 18);
    setFont(9, "bold");
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    text(k, tx + 8, y + 12);
    doc.setTextColor(0, 0, 0);
    setFont(9, "normal");
    text(v, tx + totW - 8, y + 12, "right");
    y += 18;
  });
  fillRect(tx, y, totW, 24, NAVY);
  setFont(12, "bold");
  doc.setTextColor(255, 255, 255);
  text("BALANCE DUE", tx + 8, y + 16);
  text(`${meta.currency || ""} ${money(c.balance)}`.trim(), tx + totW - 8, y + 16, "right");
  doc.setTextColor(0, 0, 0);
  y += 24 + 14;

  // Footer: Shipment Details, Bank Details, and Authorized Signatory
  const footerStartY = y;
  setFont(8, "bold");
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  text("SHIPMENT DETAILS", ml, y);
  text("BANK DETAILS", ml + 180, y);
  text("AUTHORIZED SIGNATORY", ml + usable, y, "right");
  doc.setTextColor(0, 0, 0);
  y += 10;

  // Shipment column
  setFont(8.5, "normal");
  let ny2 = y;
  const containerLines = containers
    .map((cc) => [cc.containerNo && `Container: ${cc.containerNo}`, cc.sealNo && `Seal: ${cc.sealNo}`].filter(Boolean).join("  "))
    .filter(Boolean);
  containerLines.forEach((l) => { text(l, ml, ny2); ny2 += 10; });
  if (meta.packing) meta.packing.split("\n").forEach((l) => { text(l, ml, ny2); ny2 += 10; });

  // Bank column
  let by2 = y;
  const bankLines = [`ACC NAME: ${bank.accName}`, `BANK: ${bank.bankName}`, `ACC NO: ${bank.accNo}`, `IBAN: ${bank.iban}`, `SWIFT: ${bank.swift}`].filter(Boolean);
  bankLines.forEach((l) => { text(l, ml + 180, by2); by2 += 10; });

  // Signatory column (Signature + Stamp side by side above seller name)
  const sW = Number(sigWidth) || 36;
  const sH = Number(sigHeight) || 16;
  const stW = Number(stampWidth) || 36;
  const stH = Number(stampHeight) || 20;
  const maxImgH = Math.max(sH, stH, 20);

  const sigTopY = footerStartY + 14;
  if (cleanSignature && cleanStamp) {
    const stampRight = ml + usable;
    const stampLeft = stampRight - stW;
    const sigLeft = stampLeft - sW - 8;
    try { doc.addImage(cleanSignature, getImageFormat(cleanSignature), sigLeft, sigTopY + (maxImgH - sH), sW, sH); } catch {}
    try { doc.addImage(cleanStamp, getImageFormat(cleanStamp), stampLeft, sigTopY + (maxImgH - stH), stW, stH); } catch {}
  } else if (cleanSignature) {
    const sigLeft = ml + usable - sW;
    try { doc.addImage(cleanSignature, getImageFormat(cleanSignature), sigLeft, sigTopY, sW, sH); } catch {}
  } else if (cleanStamp) {
    const stampLeft = ml + usable - stW;
    try { doc.addImage(cleanStamp, getImageFormat(cleanStamp), stampLeft, sigTopY, stW, stH); } catch {}
  }

  setFont(8, "normal");
  text(seller.name || "", ml + usable, sigTopY + maxImgH + 12, "right");

  const filename = `invoice-${meta.invoiceNo || "easyInvoice"}.pdf`;
  doc.save(filename);
  return filename;
}

/* ================================================================== */
/* Registries                                                          */
/* ================================================================== */

export const INVOICE_THEMES = [
  { id: "classic", name: "Classic (Default)", swatch: ["#1c1c1c", "#e9e9e9"], preview: null, pdf: generateInvoicePdf },
  { id: "montreal", name: "Montréal", swatch: ["#FF8C00", "#FFE8CC"], preview: MontrealInvoicePreview, pdf: generateMontrealInvoicePdf },
  { id: "minimal", name: "Minimal Clean", swatch: ["#2f2f2f", "#f4f4f4"], preview: MinimalInvoicePreview, pdf: generateMinimalInvoicePdf },
  { id: "corporate", name: "Corporate Blue", swatch: ["#0f4c81", "#dbe9f6"], preview: CorporateInvoicePreview, pdf: generateCorporateInvoicePdf },
];

export const PACKING_THEMES = [
  { id: "classic", name: "Classic (Default)", swatch: ["#1c1c1c", "#e9e9e9"], preview: null, pdf: generatePackingListPdf },
];

export const getInvoiceTheme = (id) =>
  INVOICE_THEMES.find((t) => t.id === id) || INVOICE_THEMES[0];
export const getPackingTheme = (id) =>
  PACKING_THEMES.find((t) => t.id === id) || PACKING_THEMES[0];
