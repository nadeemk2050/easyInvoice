import { useState, useRef, useMemo, useEffect } from "react";
import { numToWords } from "./pdfGenerator";
import { INVOICE_THEMES, PACKING_THEMES, getInvoiceTheme, getPackingTheme } from "./themes";
import ManagementMenu from "./ManagementModals";
import AuthPage from "./AuthPage";
import { auth, onAuthStateChanged, db } from "./firebase";
import { doc, onSnapshot, setDoc, updateDoc, deleteField } from "firebase/firestore";
import { signOut } from "firebase/auth";
import "./App.css";

// User-scoped localStorage helpers (UID is set inside App component via _uid)
function uGet(key) { try { return localStorage.getItem(_uid + "_" + key); } catch { return null; } }
function uSet(key, val) { try { localStorage.setItem(_uid + "_" + key, val); } catch {} }
function uRemove(key) { try { localStorage.removeItem(_uid + "_" + key); } catch {} }

const money = (n) =>
  (isNaN(n) ? 0 : n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const BORDER = "1.5px solid #000";

const td = (extra) => ({
  border: BORDER,
  padding: "5px 6px",
  fontSize: 10.5,
  verticalAlign: "middle",
  borderRadius: 2,
  ...extra,
});

// Join multi-line values into a single continuous line (e.g. "Area\nU.A.E" -> "Area, U.A.E")
const inlineJoin = (s) => (s || "").replace(/\s*\n\s*/g, ", ");

// Borderless cell for SELLER / BUYER / NOTIFY PARTY sections (heading highlight only)
const tdn = (extra) => td({ border: "none", ...extra });

// These are re-initialized inside App() with the user UID
let _uid = "anon";
function _key(raw) { return _uid + "_" + raw; }

// Tracks localStorage keys whose local writes have NOT yet been confirmed by
// Firestore. A stale snapshot must never overwrite these keys, otherwise new
// local data (e.g. a just-added customer) gets silently "auto-removed".
const localDirty = {};

function loadHistory() {
  try {
    const raw = localStorage.getItem(_key("easyinvoice_history"));
    if (!raw) return [];
    let list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];

    // Clean up large base64 images from legacy history to free localStorage space
    let needsClean = false;
    const cleanedList = list.map(item => {
      if (item && (item.logo || item.signature || item.stamp)) {
        needsClean = true;
        const { logo: _logo, signature: _signature, stamp: _stamp, ...rest } = item;
        return rest;
      }
      return item;
    });

    if (needsClean) {
      localStorage.setItem(_key("easyinvoice_history"), JSON.stringify(cleanedList));
      return cleanedList;
    }
    return list;
  } catch {
    return [];
  }
}

function saveToHistory(invoice) {
  const list = loadHistory();
  const newInvNo = (invoice.meta?.invoiceNo || "").trim();
  const newRefNo = (invoice.meta?.refNo || "").trim();
  const dup = list.find((inv) => {
    const invNo = (inv.meta?.invoiceNo || "").trim();
    const refNo = (inv.meta?.refNo || "").trim();
    return (newInvNo && invNo && invNo.toLowerCase() === newInvNo.toLowerCase()) ||
           (newRefNo && refNo && refNo.toLowerCase() === newRefNo.toLowerCase());
  });
  if (dup) return false;

  // Strip large base64 image data to prevent QuotaExceededError in localStorage
  const { logo: _logo, signature: _signature, stamp: _stamp, ...cleanInvoice } = invoice;

  list.unshift({ ...cleanInvoice, savedAt: new Date().toISOString() });
  localStorage.setItem(_key("easyinvoice_history"), JSON.stringify(list.slice(0, 50)));
  return true;
}

function loadPackingHistory() {
  try {
    const raw = localStorage.getItem(_key("easyinvoice_packinghistory"));
    if (!raw) return [];
    let list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];
    return list;
  } catch {
    return [];
  }
}

function saveToPackingHistory(packList) {
  const list = loadPackingHistory();
  const newInvNo = (packList.meta?.invoiceNo || "").trim();
  const newRefNo = (packList.meta?.refNo || "").trim();
  const dup = list.find((item) => {
    const invNo = (item.meta?.invoiceNo || "").trim();
    const refNo = (item.meta?.refNo || "").trim();
    return (newInvNo && invNo && invNo.toLowerCase() === newInvNo.toLowerCase()) ||
           (newRefNo && refNo && refNo.toLowerCase() === newRefNo.toLowerCase());
  });
  if (dup) return false;

  const { logo: _logo, signature: _signature, stamp: _stamp, ...cleanPackList } = packList;

  list.unshift({ ...cleanPackList, savedAt: new Date().toISOString() });
  localStorage.setItem(_key("easyinvoice_packinghistory"), JSON.stringify(list.slice(0, 50)));
  return true;
}


function loadList(key) {
  try { return JSON.parse(localStorage.getItem(_key(key))) || []; } catch { return []; }
}

function field(label, value, onChange, placeholder, small, listId, disabled) {
  return (
    <label style={{ display: "block", marginBottom: 8, opacity: disabled ? 0.7 : 1 }}>
      <span
        style={{
          fontSize: 11,
          color: "#6b6b6b",
          fontWeight: 600,
          letterSpacing: 0.3,
        }}
      >
        {label} {disabled && "(Change in Menu)"}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        list={listId}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          display: "block",
          width: "100%",
          marginTop: 3,
          padding: small ? "5px 7px" : "7px 8px",
          fontSize: 13,
          border: "1px solid #d4d4d4",
          borderRadius: 5,
          outline: "none",
          fontFamily: "inherit",
          boxSizing: "border-box",
          backgroundColor: disabled ? "#f5f5f5" : "#fff",
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
    </label>
  );
}

function CustomerDropdown({ value, onChange, onAddNew, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const customers = loadList("easyinvoice_customers");
  const filtered = customers.filter((c) =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <label ref={ref} style={{ display: "block", marginBottom: 8, position: "relative" }}>
      <span style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600, letterSpacing: 0.3 }}>Name</span>
      <input value={value} onChange={(e) => {
        const val = e.target.value;
        onChange(val);
        setOpen(true);
        setSearch(val);
        const exactMatch = customers.find(c => c.name?.toLowerCase() === val.toLowerCase());
        if (exactMatch && onSelect) {
          onSelect(exactMatch);
        }
      }}
        onFocus={() => setOpen(true)}
        placeholder="Type or select customer"
        style={{ display: "block", width: "100%", marginTop: 3, padding: "7px 8px", fontSize: 13,
          border: "1px solid #d4d4d4", borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "#fff",
          border: "1px solid #d4d4d4", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 220, overflow: "auto", marginTop: 2 }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid #eee" }}>
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers…"
              style={{ width: "100%", padding: "5px 6px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, outline: "none", boxSizing: "border-box" }} />
          </div>
          {filtered.map((c, i) => (
            <div key={i} onMouseDown={() => { if (onSelect) { onSelect(c); } else { onChange(c.name); } setOpen(false); }}
              style={{ padding: "7px 10px", cursor: "pointer", borderBottom: "1px solid #f5f5f5", fontSize: 13 }}
              onMouseEnter={(e) => e.target.style.background = "#f0f0f0"}
              onMouseLeave={(e) => e.target.style.background = "#fff"}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{c.contact ? c.contact + (c.email ? " · " : "") : ""}{c.email || ""}</div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: "8px 10px", fontSize: 12, color: "#888" }}>No customers found</div>}
          <div onMouseDown={(e) => { e.preventDefault(); onAddNew && onAddNew(); setOpen(false); }}
            style={{ padding: "8px 10px", fontSize: 12, color: "#1a4fa0", cursor: "pointer", borderTop: "1px solid #eee", textAlign: "center", fontWeight: 600 }}>
            + Add new customer
          </div>
        </div>
      )}
    </label>
  );
}

function dateField(label, value, onChange) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ display: "block", width: "100%", marginTop: 3, padding: "6px 8px", fontSize: 13,
          border: "1px solid #d4d4d4", borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
          colorScheme: "light", cursor: "pointer",
        }} />
    </label>
  );
}

function textArea(label, value, onChange, listId, placeholder) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span
        style={{
          fontSize: 11,
          color: "#6b6b6b",
          fontWeight: 600,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </span>
      <textarea
        value={value}
        list={listId}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        style={{
          display: "block",
          width: "100%",
          marginTop: 3,
          padding: "7px 8px",
          fontSize: 13,
          border: "1px solid #d4d4d4",
          borderRadius: 5,
          outline: "none",
          fontFamily: "inherit",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
    </label>
  );
}

function Section({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: open ? 22 : 0 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "#1c1c1c",
          borderBottom: "2px solid #1c1c1c",
          paddingBottom: 6,
          marginBottom: open ? 12 : 0,
          cursor: "pointer",
          userSelect: "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 14, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▼
        </span>
      </div>
      {open && <div style={{ paddingTop: 4 }}>{children}</div>}
    </div>
  );
}

export default function App() {
  // ---------- ALL hooks must be before any early return ----------
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [seller, setSeller] = useState({
    name: "AXIOM POLYMER INDUSTRY LLC",
    addr1: "UMM AL THOOB, NEW IND AREA",
    addr2: "UMM AL QUWAIN",
    trn: "101010101010101",
    contactPerson: "",
    contact: "+971 58 8576814",
    email: "",
  });

  const [buyer, setBuyer] = useState({
    name: "GOLCHA ASSOCIATES",
    addr1: "GOLCHA GARDENS, VILLE PARLE",
    addr2: "MH, THANE",
    gst: "",
    pan: "",
    contact: "",
    email: "",
  });

  const [notifyParty, setNotifyParty] = useState({
    name: "",
    addr1: "",
    addr2: "",
    email: "",
    contact: "",
  });

  const [containers, setContainers] = useState([]);

  const [meta, setMeta] = useState({
    invoiceNo: "EX/AS/0098/26",
    refNo: "",
    date: "2026-06-02",
    supplierPo: "ALS228989088",
    poDate: "2026-05-25",
    transportType: "SEA",
    driverVessel: "KSL 009",
    loadingAt: "SAJJA INDUSTRIAL AREA\nU.A.E",
    finalDestination: "MUNDRA\nINDIA",
    packing:
      "40 JUMBO BAGS ON 40 PALLETS STRAPPED\nCONT NO MRSU9998798, SEAL ML-AE88786688",
    paymentTerms: "30% ADVANCE PAID ON BL\n35% ON LOADING AND SO N\n35% WILL PAY UPON DELIVERY",
    currency: "USD",
    subunit: "CENTS",
    originOfGoods: "U.A.E",
    amountInWords: "",
  });

  const [bank, setBank] = useState({
    accName: "AXIOM POLYMERS INDUSTRY LLC",
    bankName: "RAS AL KHAIMAH BANK PTSJ",
    accNo: "3533 73737 838383 838383",
    iban: "8888 9999 99999 999999 99999999",
    swift: "",
    address: "SHARJAH BR",
  });

  const [vatPercent, setVatPercent] = useState(5);
  const [advancePercent, setAdvancePercent] = useState(30);

  const [items, setItems] = useState([
    {
      description: "PC BOTTLE REGRIND - GRADE B",
      qty: "26.500",
      rate: "1120",
      per: "MTS",
    },
  ]);

  const [packingItems, setPackingItems] = useState([
    {
      containerSeal: "",
      typeOfPacking: "",
      descriptionOfGoods: "",
      grossWeight: "",
      tareWeight: "",
      netWeight: "",
    }
  ]);

  // Load permanent images (initial value, will be updated after auth)
  const [logo, setLogo] = useState(null);
  const [signature, setSignature] = useState(null);
  const [stamp, setStamp] = useState(null);
  const logoInput = useRef(null);
  const sigInput = useRef(null);
  const stampInput = useRef(null);
  const invoiceRef = useRef(null);
  const [imgSelector, setImgSelector] = useState(null); // 'logo' | 'signature' | 'stamp' | null
  const [imgPw, setImgPw] = useState("");
  const [logoWidth, setLogoWidth] = useState(50);
  const [logoHeight, setLogoHeight] = useState(14);
  const [sigWidth, setSigWidth] = useState(35);
  const [sigHeight, setSigHeight] = useState(12);
  const [stampWidth, setStampWidth] = useState(36);
  const [stampHeight, setStampHeight] = useState(18);
  const [sizeLock, setSizeLock] = useState(true);
  const [sizePw, setSizePw] = useState("");
  const [titleText, setTitleText] = useState("COMMERCIAL INVOICE");
  const [titleFontSize, setTitleFontSize] = useState(16);
  const [titleAlign, setTitleAlign] = useState("right");
  const [titleXOffset, setTitleXOffset] = useState(0);
  const [titleYOffset, setTitleYOffset] = useState(0);
  const [syncCounter, setSyncCounter] = useState(0);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // Invoices list view (open by default)
  const [showHistory, setShowHistory] = useState(true);
  const [history, setHistory] = useState([]);
  const [isPackingMode, setIsPackingMode] = useState(false);
  const [showPackingHistory, setShowPackingHistory] = useState(false);
  const [packingHistory, setPackingHistory] = useState([]);
  const [activeOpts, setActiveOpts] = useState(null);
  const [toast, setToast] = useState("");
  const [showPackingPrompt, setShowPackingPrompt] = useState(false);
  const [invoiceThemeId, setInvoiceThemeId] = useState("classic");
  const [packingThemeId, setPackingThemeId] = useState("classic");
  const [editingIndex, setEditingIndex] = useState(null);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(false);
  const [packingSearchQuery, setPackingSearchQuery] = useState("");
  const [showPackingSearch, setShowPackingSearch] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const selectInvoiceTheme = (id) => {
    setInvoiceThemeId(id);
    try { localStorage.setItem(_uid + "_easyinvoice_invoiceTheme", id); } catch {}
  };
  const selectPackingTheme = (id) => {
    setPackingThemeId(id);
    try { localStorage.setItem(_uid + "_easyinvoice_packingTheme", id); } catch {}
  };
  const activeInvoiceTheme = getInvoiceTheme(invoiceThemeId);
  const activePackingTheme = getPackingTheme(packingThemeId);
  const ActiveInvoiceThemePreview = activeInvoiceTheme.preview;

  // ---------- helpers ----------
  const handleImage = (file, setter) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setter(e.target.result);
    reader.readAsDataURL(file);
  };

  const updateItem = (i, key, val) => {
    const next = [...items];
    next[i] = { ...next[i], [key]: val };
    setItems(next);
  };
  const addItem = () =>
    setItems([...items, { description: "", qty: "", rate: "", per: "" }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const updatePackingItem = (i, key, val) => {
    const next = [...packingItems];
    let nextVal = val;
    if (key === "grossWeight" || key === "tareWeight") {
      const gross = key === "grossWeight" ? val : next[i].grossWeight;
      const tare = key === "tareWeight" ? val : next[i].tareWeight;
      next[i] = {
        ...next[i],
        [key]: val,
        netWeight: ((parseFloat(gross) || 0) - (parseFloat(tare) || 0)).toFixed(3)
      };
    } else {
      next[i] = { ...next[i], [key]: val };
    }
    setPackingItems(next);
  };
  const addPackingItem = () =>
    setPackingItems([...packingItems, { containerSeal: "", typeOfPacking: "", descriptionOfGoods: "", grossWeight: "", tareWeight: "", netWeight: "" }]);
  const removePackingItem = (i) => setPackingItems(packingItems.filter((_, idx) => idx !== i));

  // ---------- calculations ----------
  const totalQty = useMemo(
    () => items.reduce((s, it) => s + (parseFloat(it.qty) || 0), 0),
    [items]
  );
  const subtotal = useMemo(
    () =>
      items.reduce(
        (s, it) =>
          s + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0),
        0
      ),
    [items]
  );
  const vatAmount = (subtotal * (parseFloat(vatPercent) || 0)) / 100;
  const totalInclVat = subtotal + vatAmount;
  const advanceAmt =
    (totalInclVat * (parseFloat(advancePercent) || 0)) / 100;
  const balance = totalInclVat - advanceAmt;

  const autoWords = useMemo(() => {
    return numToWords(totalInclVat, meta.currency, meta.subunit);
  }, [totalInclVat, meta.currency, meta.subunit]);

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

  const blankRows = Math.max(0, 5 - items.length);

  // ---------- Build invoice data (shared by save & download) ----------
  const buildInvoiceData = () => ({
    seller,
    buyer,
    notifyParty,
    containers,
    meta: {
      ...meta,
      amountInWords: meta.amountInWords || autoWords,
    },
    bank,
    items,
    vatPercent: parseFloat(vatPercent) || 0,
    advancePercent: parseFloat(advancePercent) || 0,
    logo,
    signature,
    stamp,
    logoWidth,
    logoHeight,
    sigWidth,
    sigHeight,
    stampWidth,
    stampHeight,
    titleText,
    titleFontSize,
    titleAlign,
    titleXOffset,
    titleYOffset,
  });

  // ---------- Pre-fill packing list from current invoice ----------
  const populatePackingFromInvoice = () => {
    const containerList = Array.isArray(containers) ? containers : [];
    const itemList = Array.isArray(items) ? items : [];
    const descriptions = itemList.map((it) => it.description || "").filter(Boolean);
    const firstPackingLine = (meta.packing || "").split("\n")[0].trim();

    // Total quantity / weight from invoice items
    const totalInvoiceWeight = itemList.reduce((s, it) => s + (parseFloat(it.qty) || 0), 0);
    const formatWeight = (val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) return "";
      return num % 1 === 0 ? num.toString() : num.toFixed(3);
    };

    let rows = [];
    if (containerList.length > 0) {
      rows = containerList.map((c, idx) => {
        let weightVal = "";
        if (containerList.length === 1) {
          // Single container gets the total invoice weight
          weightVal = totalInvoiceWeight > 0 ? (totalInvoiceWeight % 1 === 0 ? totalInvoiceWeight.toString() : totalInvoiceWeight.toFixed(3)) : "";
        } else if (itemList[idx] && parseFloat(itemList[idx].qty) > 0) {
          weightVal = formatWeight(itemList[idx].qty);
        } else if (totalInvoiceWeight > 0) {
          const split = totalInvoiceWeight / containerList.length;
          weightVal = split % 1 === 0 ? split.toString() : split.toFixed(3);
        }

        return {
          containerSeal: [
            c.containerNo ? `CONT : ${c.containerNo}` : "",
            c.sealNo ? `SL : ${c.sealNo}` : "",
          ].filter(Boolean).join("\n"),
          typeOfPacking: firstPackingLine || "",
          descriptionOfGoods: descriptions[idx] || (descriptions.length ? descriptions.join("\n") : ""),
          grossWeight: weightVal,
          tareWeight: weightVal ? "0" : "",
          netWeight: weightVal,
        };
      });
    } else {
      rows = itemList.map((it) => {
        const weightVal = formatWeight(it.qty);
        return {
          containerSeal: "",
          typeOfPacking: firstPackingLine || "",
          descriptionOfGoods: it.description || "",
          grossWeight: weightVal,
          tareWeight: weightVal ? "0" : "",
          netWeight: weightVal,
        };
      });
    }
    if (rows.length === 0) {
      const weightVal = totalInvoiceWeight > 0 ? (totalInvoiceWeight % 1 === 0 ? totalInvoiceWeight.toString() : totalInvoiceWeight.toFixed(3)) : "";
      rows = [{
        containerSeal: "",
        typeOfPacking: firstPackingLine || "",
        descriptionOfGoods: descriptions.join("\n") || "",
        grossWeight: weightVal,
        tareWeight: weightVal ? "0" : "",
        netWeight: weightVal,
      }];
    }

    setPackingItems(rows);
    setTitleText("PACKING LIST");
    setIsPackingMode(true);
    setShowHistory(false);
    setShowPackingHistory(false);
    setEditingIndex(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Packing list pre-filled with invoice details & weights!");
  };

  // ---------- PDF download ----------
  const downloadPDF = async () => {
    setPdfBusy(true);
    setPdfError("");
    try {
      const invoiceData = buildInvoiceData();
      await activeInvoiceTheme.pdf(invoiceData);
      // Save to history (reject duplicate invoice numbers)
      const saved = saveToHistory(invoiceData);
      setHistory(loadHistory());
      if (saved) {
        showToast("PDF downloaded & invoice saved!");
      } else {
        showToast("PDF downloaded (duplicate invoice no — not saved to history)");
      }
      setShowPackingPrompt(true);
    } catch (err) {
      console.error("PDF generation failed", err);
      setPdfError(
        "PDF generation failed. Try 'Print instead' and choose Save as PDF."
      );
    }
    setPdfBusy(false);
  };

  const handleSavePackingList = () => {
    const data = {
      seller,
      buyer,
      notifyParty,
      meta,
      packingItems,
      logo,
      signature,
      stamp,
    };
    const saved = saveToPackingHistory(data);
    setPackingHistory(loadPackingHistory());
    showToast(saved ? "Packing List saved!" : "Duplicate invoice/reference no — not saved");
  };

  const handleDownloadPackingList = async () => {
    setPdfBusy(true);
    setPdfError("");
    try {
      const pdfData = {
        seller,
        buyer,
        notifyParty,
        meta,
        packingItems,
        logo,
        signature,
        stamp,
        logoWidth,
        logoHeight,
        sigWidth,
        sigHeight,
        stampWidth,
        stampHeight,
        titleText: titleText === "COMMERCIAL INVOICE" ? "PACKING LIST" : titleText,
        titleFontSize,
        titleAlign,
        titleXOffset,
        titleYOffset,
      };
      await activePackingTheme.pdf(pdfData);
      saveToPackingHistory(pdfData);
      setPackingHistory(loadPackingHistory());
      showToast("Packing List downloaded & saved!");
    } catch (err) {
      console.error("PDF generation failed", err);
      setPdfError("PDF generation failed.");
    }
    setPdfBusy(false);
  };

  const handleUpdatePackingList = () => {
    if (editingIndex === null) return;
    const list = loadPackingHistory();
    const data = {
      seller,
      buyer,
      notifyParty,
      meta,
      packingItems,
      logo,
      signature,
      stamp,
      savedAt: new Date().toISOString()
    };
    list[editingIndex] = data;
    localStorage.setItem(_key("easyinvoice_packinghistory"), JSON.stringify(list));
    setPackingHistory(list);
    showToast("Packing List updated!");
  };

  const handleUpdateInvoice = () => {
    if (editingIndex === null) return;
    const list = loadHistory();
    const data = {
      seller,
      buyer,
      notifyParty,
      containers,
      meta,
      bank,
      items,
      vatPercent: parseFloat(vatPercent) || 0,
      advancePercent: parseFloat(advancePercent) || 0,
      logo,
      signature,
      stamp,
      savedAt: new Date().toISOString()
    };
    list[editingIndex] = data;
    localStorage.setItem(_key("easyinvoice_history"), JSON.stringify(list));
    setHistory(list);
    showToast("Invoice updated!");
    setShowPackingPrompt(true);
  };

  // ---------- Load from history ----------
  const loadInvoice = (data) => {
    setSeller(data.seller || seller);
    setBuyer(data.buyer || buyer);
    setNotifyParty(data.notifyParty || notifyParty || {});
    setContainers(data.containers || []);
    setMeta(data.meta || meta);
    setBank(data.bank || bank);
    setTitleText(data.titleText || "COMMERCIAL INVOICE");
    setIsPackingMode(false);
    setVatPercent(data.vatPercent ?? vatPercent);
    setAdvancePercent(data.advancePercent ?? advancePercent);
    setItems(data.items || items);
    // Keep currently active logo/signature/stamp, but load them if legacy history item has them
    if (data.logo) setLogo(data.logo);
    if (data.signature) setSignature(data.signature);
    if (data.stamp) setStamp(data.stamp);
    setShowHistory(false);
    showToast("Invoice loaded from history!");
  };

  const deleteHistoryItem = (idx) => {
    const list = loadHistory();
    list.splice(idx, 1);
    localStorage.setItem(_key("easyinvoice_history"), JSON.stringify(list));
    setHistory(list);
  };

  const downloadFromHistory = async (data) => {
    // Fill in logo, signature, and stamp from current states since they are stripped in history
    const pdfData = {
      ...data,
      logo: data.logo || logo,
      signature: data.signature || signature,
      stamp: data.stamp || stamp,
      logoWidth,
      logoHeight,
      sigWidth,
      sigHeight,
      stampWidth,
      stampHeight,
      titleText,
      titleFontSize,
      titleAlign,
      titleXOffset,
      titleYOffset,
    };
    await activeInvoiceTheme.pdf(pdfData);
    showToast("PDF downloaded!");
  };

  // ---------- Auth effect (must be after all hooks) ----------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Load saved images + history when user is available
  useEffect(() => {
    if (user) {
      _uid = user?.uid || "";
      try {
        const savedCompany = localStorage.getItem(_uid + "_easyinvoice_company");
        if (savedCompany) {
          const comp = JSON.parse(savedCompany);
          setSeller({
            name: comp.name || "",
            addr1: comp.addr1 || "",
            addr2: comp.addr2 || "",
            trn: comp.trn || "",
            contactPerson: comp.contact || "",
            contact: comp.contact || "",
            email: comp.email || "",
          });
        }

        const savedLogo = localStorage.getItem(_uid + "_easyinvoice_selectedLogo");
        if (savedLogo) setLogo(savedLogo);
        const savedSig = localStorage.getItem(_uid + "_easyinvoice_selectedSignature");
        if (savedSig) setSignature(savedSig);
        const savedStamp = localStorage.getItem(_uid + "_easyinvoice_selectedStamp");
        if (savedStamp) setStamp(savedStamp);

        const savedLogoW = localStorage.getItem(_uid + "_easyinvoice_logoWidth");
        if (savedLogoW) setLogoWidth(parseFloat(savedLogoW));
        const savedLogoH = localStorage.getItem(_uid + "_easyinvoice_logoHeight");
        if (savedLogoH) setLogoHeight(parseFloat(savedLogoH));

        const savedSigW = localStorage.getItem(_uid + "_easyinvoice_sigWidth");
        if (savedSigW) setSigWidth(parseFloat(savedSigW));
        const savedSigH = localStorage.getItem(_uid + "_easyinvoice_sigHeight");
        if (savedSigH) setSigHeight(parseFloat(savedSigH));

        const savedStampW = localStorage.getItem(_uid + "_easyinvoice_stampWidth");
        if (savedStampW) setStampWidth(parseFloat(savedStampW));
        const savedStampH = localStorage.getItem(_uid + "_easyinvoice_stampHeight");
        if (savedStampH) setStampHeight(parseFloat(savedStampH));

        const savedTitleText = localStorage.getItem(_uid + "_easyinvoice_titleText");
        if (savedTitleText) setTitleText(savedTitleText);
        const savedTitleSize = localStorage.getItem(_uid + "_easyinvoice_titleFontSize");
        if (savedTitleSize) setTitleFontSize(parseFloat(savedTitleSize));
        const savedTitleAlign = localStorage.getItem(_uid + "_easyinvoice_titleAlign");
        if (savedTitleAlign) setTitleAlign(savedTitleAlign);
        const savedTitleX = localStorage.getItem(_uid + "_easyinvoice_titleXOffset");
        if (savedTitleX) setTitleXOffset(parseFloat(savedTitleX));
        const savedTitleY = localStorage.getItem(_uid + "_easyinvoice_titleYOffset");
        if (savedTitleY) setTitleYOffset(parseFloat(savedTitleY));

        const savedInvTheme = localStorage.getItem(_uid + "_easyinvoice_invoiceTheme");
        if (savedInvTheme) setInvoiceThemeId(savedInvTheme);
        const savedPackTheme = localStorage.getItem(_uid + "_easyinvoice_packingTheme");
        if (savedPackTheme) setPackingThemeId(savedPackTheme);

        const savedContainers = localStorage.getItem(_uid + "_easyinvoice_containers");
        if (savedContainers) {
          try {
            setContainers(JSON.parse(savedContainers));
          } catch {}
        }

        const savedBanks = localStorage.getItem(_uid + "_easyinvoice_banks");
        if (savedBanks) {
          const banks = JSON.parse(savedBanks);
          if (Array.isArray(banks) && banks.length > 0) {
            setBank({
              accName: banks[0].accName || "",
              bankName: banks[0].bankName || "",
              accNo: banks[0].accNo || "",
              iban: banks[0].iban || "",
              swift: banks[0].swift || "",
              address: banks[0].address || "",
            });
          }
        }
      } catch {}
      setHistory(loadHistory());
      setPackingHistory(loadPackingHistory());
    }
  }, [user]);

  // Sync to Firebase on local changes (Monkey-patching localStorage)
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    const originalSetItem = localStorage.setItem;
    const originalRemoveItem = localStorage.removeItem;

    localStorage.setItem = function (key, value) {
      originalSetItem.apply(this, arguments);

      if (window.isSyncingFromFirestore) return;

      if (key.startsWith(uid + "_")) {
        // Trigger React UI update for datalists & local lists immediately
        setSyncCounter((prev) => prev + 1);

        const cleanKey = key.substring(uid.length + 1);
        // Mark as pending so a stale snapshot can't overwrite this newer local value
        localDirty[key] = true;

        let valToStore = value;
        try {
          valToStore = JSON.parse(value);
        } catch {}

        const docRef = doc(db, "user_data", uid);
        setDoc(docRef, { [cleanKey]: valToStore }, { merge: true })
          .then(() => {
            // Confirmed synced — snapshots may now apply for this key
            localDirty[key] = false;
          })
          .catch((err) => {
            console.warn("Firestore sync warning:", err);
            // Keep localDirty = true: the server copy is stale for this key,
            // so snapshots must not overwrite the newer local value.
          });
      }
    };

    localStorage.removeItem = function (key) {
      originalRemoveItem.apply(this, arguments);

      if (window.isSyncingFromFirestore) return;

      if (key.startsWith(uid + "_")) {
        setSyncCounter((prev) => prev + 1);
        const cleanKey = key.substring(uid.length + 1);
        // Mark as pending so a stale snapshot can't resurrect the deleted value
        localDirty[key] = true;
        const docRef = doc(db, "user_data", uid);
        updateDoc(docRef, { [cleanKey]: deleteField() })
          .then(() => {
            localDirty[key] = false;
          })
          .catch((err) => {
            console.warn("Firestore delete warning:", err);
          });
      }
    };

    return () => {
      localStorage.setItem = originalSetItem;
      localStorage.removeItem = originalRemoveItem;
    };
  }, [user]);

  // Firestore Snapshot listener for real-time synchronization between clients
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const docRef = doc(db, "user_data", uid);

    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        window.isSyncingFromFirestore = true;
        const data = docSnap.data();

        let updatedAny = false;

        // Write all snapshot fields to localStorage
        Object.keys(data).forEach((key) => {
          const rawKey = uid + "_" + key;
          const val = data[key];
          const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);

          // Never overwrite a key that has a newer local write still pending
          // sync (or whose last sync failed) — otherwise local data gets lost.
          if (localDirty[rawKey]) return;

          if (localStorage.getItem(rawKey) !== strVal) {
            localStorage.setItem(rawKey, strVal);
            updatedAny = true;
          }
        });

        // Sync React States for immediate live updates on screen
        if (data.easyinvoice_selectedLogo !== undefined) setLogo(data.easyinvoice_selectedLogo);
        if (data.easyinvoice_selectedSignature !== undefined) setSignature(data.easyinvoice_selectedSignature);
        if (data.easyinvoice_selectedStamp !== undefined) setStamp(data.easyinvoice_selectedStamp);

        if (data.easyinvoice_logoWidth !== undefined) setLogoWidth(Number(data.easyinvoice_logoWidth));
        if (data.easyinvoice_logoHeight !== undefined) setLogoHeight(Number(data.easyinvoice_logoHeight));

        if (data.easyinvoice_sigWidth !== undefined) setSigWidth(Number(data.easyinvoice_sigWidth));
        if (data.easyinvoice_sigHeight !== undefined) setSigHeight(Number(data.easyinvoice_sigHeight));

        if (data.easyinvoice_stampWidth !== undefined) setStampWidth(Number(data.easyinvoice_stampWidth));
        if (data.easyinvoice_stampHeight !== undefined) setStampHeight(Number(data.easyinvoice_stampHeight));

        if (data.easyinvoice_titleText !== undefined) setTitleText(data.easyinvoice_titleText);
        if (data.easyinvoice_titleFontSize !== undefined) setTitleFontSize(Number(data.easyinvoice_titleFontSize));
        if (data.easyinvoice_titleAlign !== undefined) setTitleAlign(data.easyinvoice_titleAlign);
        if (data.easyinvoice_titleXOffset !== undefined) setTitleXOffset(Number(data.easyinvoice_titleXOffset));
        if (data.easyinvoice_titleYOffset !== undefined) setTitleYOffset(Number(data.easyinvoice_titleYOffset));

        if (Array.isArray(data.easyinvoice_history)) {
          setHistory(data.easyinvoice_history);
        }

        if (Array.isArray(data.easyinvoice_packinghistory)) {
          setPackingHistory(data.easyinvoice_packinghistory);
        }

        if (data.easyinvoice_company) {
          const comp = data.easyinvoice_company;
          setSeller({
            name: comp.name || "",
            addr1: comp.addr1 || "",
            addr2: comp.addr2 || "",
            trn: comp.trn || "",
            contactPerson: comp.contact || "",
            contact: comp.contact || "",
            email: comp.email || "",
          });
        }

        if (updatedAny) {
          // Increment sync counter to force App component to re-read datalists from localStorage
          setSyncCounter((prev) => prev + 1);
        }

        window.isSyncingFromFirestore = false;
      } else {
        // First login: upload all local storage items for this user to initialize firestore
        const initialData = {};
        for (let i = 0; i < localStorage.length; i++) {
          const rawKey = localStorage.key(i);
          if (rawKey.startsWith(uid + "_")) {
            const cleanKey = rawKey.substring(uid.length + 1);
            const val = localStorage.getItem(rawKey);
            try {
              initialData[cleanKey] = JSON.parse(val);
            } catch {
              initialData[cleanKey] = val;
            }
          }
        }
        if (Object.keys(initialData).length > 0) {
          setDoc(docRef, initialData, { merge: true }).catch((err) => {
            console.warn("Firestore initial save warning:", err);
          });
        }
      }
    }, (err) => {
      console.warn("Firestore snapshot listener warning:", err);
    });

    return unsub;
  }, [user]);

  // Show auth pages before rendering the invoice app
  if (authLoading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f4f2", fontFamily: "Arial" }}>
      <div style={{ fontSize: 16, color: "#888" }}>Loading…</div>
    </div>;
  }

  if (!user) {
    return <AuthPage onLogin={() => {}} />;
  }

  // Set UID for scoped localStorage
  _uid = user?.uid || "";

  const enteredContainers = containers.filter(c => (c.containerNo && c.containerNo.trim()) || (c.sealNo && c.sealNo.trim()));
  const hasContainers = enteredContainers.length > 0;
  const hasNotify = Object.values(notifyParty).some((v) => v && v.trim());

  // ---------- Datalists from saved management data ----------
  const dlCurrencies = loadList("easyinvoice_currencies");
  const dlLoading = loadList("easyinvoice_loadingLocs");
  const dlFinalDest = loadList("easyinvoice_finalDests");
  const dlOrigins = loadList("easyinvoice_origins");
  const dlPaymentTerms = loadList("easyinvoice_paymentTerms");
  const dlItemNames = loadList("easyinvoice_itemNames");
  const dlQtyUnits = loadList("easyinvoice_qtyUnits");
  const dlCustomers = loadList("easyinvoice_customers");
  const dlBanks = loadList("easyinvoice_banks");

  // ---------- render ----------
  return (
    <div
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        background: "#f4f4f2",
        minHeight: "100vh",
      }}
    >
      {/* Datalists for autocomplete */}
      <datalist id="dl-currency">{dlCurrencies.map((c, i) => <option key={i} value={typeof c === "string" ? c : c.code} />)}</datalist>
      <datalist id="dl-loading">{dlLoading.map((c, i) => <option key={i} value={c} />)}</datalist>
      <datalist id="dl-finalDest">{dlFinalDest.map((c, i) => <option key={i} value={c} />)}</datalist>
      <datalist id="dl-origins">{dlOrigins.map((c, i) => <option key={i} value={c} />)}</datalist>
      <datalist id="dl-paymentTerms">{dlPaymentTerms.map((c, i) => <option key={i} value={c} />)}</datalist>
      <datalist id="dl-itemNames">{dlItemNames.map((c, i) => <option key={i} value={c} />)}</datalist>
      <datalist id="dl-qtyUnits">{dlQtyUnits.map((c, i) => <option key={i} value={c} />)}</datalist>
      <datalist id="dl-customers">{dlCustomers.map((c, i) => <option key={i} value={c.name} />)}</datalist>

      <style>{`
        .app-layout {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 20px;
        }
        @media (max-width: 991px) {
          .app-layout {
            grid-template-columns: 1fr;
            padding: 10px !important;
            gap: 15px;
          }
          .print-area-wrapper {
            overflow-x: auto;
            width: 100%;
            -webkit-overflow-scrolling: touch;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            background: #fff;
          }
          .print-area {
            min-width: 794px;
          }
        }
        @media print {
          .no-print { display: none !important; }
          .print-area { box-shadow: none !important; margin: 0 !important; }
          body { background: white !important; }
        }
        input:focus, textarea:focus { border-color: #1c1c1c !important; }
        button { font-family: inherit; cursor: pointer; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#1c1c1c",
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 9999,
            animation: "slideUp 0.3s ease",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {toast}
        </div>
      )}

      {/* Create Packing List Prompt */}
      {showPackingPrompt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 4000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowPackingPrompt(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 26,
              maxWidth: 430,
              width: "90%",
              textAlign: "center",
              boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: "#1c1c1c" }}>
              Create Packing List too?
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "#555", lineHeight: 1.55 }}>
              Want to insert this invoice's data to make the packing list also?
              <br />
              <span style={{ fontSize: 12, color: "#888" }}>
                The packing list form will open pre-filled — you can fill the remaining details and save/download it.
              </span>
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  setShowPackingPrompt(false);
                  populatePackingFromInvoice();
                }}
                style={{
                  flex: 1,
                  padding: "11px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                  background: "#1a4fa0",
                  border: "none",
                  borderRadius: 7,
                  cursor: "pointer",
                }}
              >
                Yes, create packing list
              </button>
              <button
                onClick={() => setShowPackingPrompt(false)}
                style={{
                  flex: 1,
                  padding: "11px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1c1c1c",
                  background: "#fff",
                  border: "1px solid #1c1c1c",
                  borderRadius: 7,
                  cursor: "pointer",
                }}
              >
                No, just save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoices List Panel (Full Page View) */}
      {showHistory && (
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "40px 20px",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 28,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: "-0.5px" }}>
                Invoices List
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Manage, edit, and download your saved invoices.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {showInvoiceSearch && (
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={invoiceSearchQuery}
                  onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    border: "1px solid #1c1c1c",
                    borderRadius: 8,
                    outline: "none",
                    width: 200,
                  }}
                  autoFocus
                />
              )}
              <button
                onClick={() => {
                  setShowInvoiceSearch(!showInvoiceSearch);
                  if (showInvoiceSearch) setInvoiceSearchQuery("");
                }}
                style={{
                  padding: "8px 10px",
                  fontSize: 14,
                  border: "1px solid #1c1c1c",
                  borderRadius: 8,
                  background: showInvoiceSearch ? "#1c1c1c" : "#fff",
                  color: showInvoiceSearch ? "#fff" : "#1c1c1c",
                  cursor: "pointer",
                }}
                title="Search Invoices"
              >
                🔍
              </button>
              <ManagementMenu uid={user?.uid || ""} sellers={seller} setSellers={setSeller} setBuyer={setBuyer} onPackingListClick={() => { setShowPackingHistory(true); setShowHistory(false); setIsPackingMode(true); }} onInvoiceListClick={() => { setShowHistory(true); setShowPackingHistory(false); setIsPackingMode(false); }} onDataChange={() => setSyncCounter((c) => c + 1)} />
              <button
                onClick={() => { setShowHistory(false); setIsPackingMode(false); setEditingIndex(null); }}
                style={{
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "none",
                  borderRadius: 8,
                  background: "#1c1c1c",
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                }}
              >
                ➕ Create Invoice
              </button>
            </div>
          </div>

          {/* List Card */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 28,
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
            }}
          >
            {activeOpts !== null && <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setActiveOpts(null)} />}
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#888" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <p style={{ margin: 0, fontSize: 14 }}>
                  No saved invoices yet. Click <strong>Create Invoice</strong> to get started.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 800 }}>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "100px 90px 1.2fr 1fr 1.5fr 80px 100px 150px", gap: 10, padding: "12px 8px", borderBottom: "2px solid #1c1c1c", fontSize: 12, fontWeight: 700, color: "#555" }}>
                    <div>Date</div>
                    <div>Transport</div>
                    <div>Invoice No</div>
                    <div>Ref No</div>
                    <div>Buyer Name</div>
                    <div style={{ textAlign: "right" }}>Qty</div>
                    <div style={{ textAlign: "right" }}>Value</div>
                    <div style={{ textAlign: "right" }}>Actions</div>
                  </div>
                  {history
                    .filter((inv) => {
                      if (!invoiceSearchQuery) return true;
                      const q = invoiceSearchQuery.toLowerCase();
                      const dateStr = inv.savedAt ? new Date(inv.savedAt).toLocaleDateString() : "";
                      const itemsStr = inv.items?.map(it => it.description || "").join(" ").toLowerCase() || "";
                      return (
                        inv.meta?.invoiceNo?.toLowerCase().includes(q) ||
                        inv.meta?.refNo?.toLowerCase().includes(q) ||
                        inv.buyer?.name?.toLowerCase().includes(q) ||
                        inv.meta?.transportType?.toLowerCase().includes(q) ||
                        dateStr.includes(q) ||
                        itemsStr.includes(q)
                      );
                    })
                    .map((inv, i) => {
                    const totalQ = inv.items?.reduce((s, it) => s + (parseFloat(it.qty) || 0), 0) || 0;
                    const totalV = inv.items?.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0), 0) || 0;
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 90px 1.2fr 1fr 1.5fr 80px 100px 150px", gap: 10, padding: "14px 8px", borderBottom: "1px solid #eee", fontSize: 13, alignItems: "center" }}>
                        <div style={{ color: "#666" }}>{inv.savedAt ? new Date(inv.savedAt).toLocaleDateString() : ""}</div>
                        <div style={{ color: "#666" }}>{inv.meta?.transportType || "—"}</div>
                        <div style={{ fontWeight: 700, color: "#1c1c1c" }}>{inv.meta?.invoiceNo || "—"}</div>
                        <div style={{ color: "#444" }}>{inv.meta?.refNo || "—"}</div>
                        <div style={{ color: "#444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={inv.buyer?.name}>{inv.buyer?.name || "—"}</div>
                        <div style={{ textAlign: "right", color: "#444" }}>{totalQ ? totalQ.toFixed(2) : "0.00"}</div>
                        <div style={{ textAlign: "right", fontWeight: 600 }}>{totalV ? totalV.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "0.00"}</div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => { loadInvoice(inv); setIsPackingMode(false); setEditingIndex(i); }}
                            style={{ padding: "6px 10px", fontSize: 12, border: "1px solid #d4d4d4", borderRadius: 6, background: "#fff", cursor: "pointer" }} title="Edit Invoice">✏️ Edit</button>
                          <button onClick={() => downloadFromHistory(inv)}
                            style={{ padding: "6px 10px", fontSize: 12, border: "1px solid #d4d4d4", borderRadius: 6, background: "#fff", cursor: "pointer" }} title="Download PDF">⬇️ PDF</button>
                           <button onClick={() => { 
                            const pw = prompt("Enter password 'abcd' to delete this invoice:");
                            if (pw === "abcd") {
                              deleteHistoryItem(i);
                            } else if (pw !== null) {
                              alert("Wrong password!");
                            }
                          }}
                            style={{ padding: "6px 10px", fontSize: 12, border: "1px solid #ffcdd2", borderRadius: 6, background: "#ffe9e9", cursor: "pointer", color: "#b3261e" }} title="Delete">🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Packing Lists Details Panel */}
      {showPackingHistory && (
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "40px 20px",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 28,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: "-0.5px" }}>
                Packing Lists Details
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Manage, edit, and download your saved packing lists.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {showPackingSearch && (
                <input
                  type="text"
                  placeholder="Search packing lists..."
                  value={packingSearchQuery}
                  onChange={(e) => setPackingSearchQuery(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    border: "1px solid #1c1c1c",
                    borderRadius: 8,
                    outline: "none",
                    width: 200,
                  }}
                  autoFocus
                />
              )}
              <button
                onClick={() => {
                  setShowPackingSearch(!showPackingSearch);
                  if (showPackingSearch) setPackingSearchQuery("");
                }}
                style={{
                  padding: "8px 10px",
                  fontSize: 14,
                  border: "1px solid #1c1c1c",
                  borderRadius: 8,
                  background: showPackingSearch ? "#1c1c1c" : "#fff",
                  color: showPackingSearch ? "#fff" : "#1c1c1c",
                  cursor: "pointer",
                }}
                title="Search Packing Lists"
              >
                🔍
              </button>
              <ManagementMenu uid={user?.uid || ""} sellers={seller} setSellers={setSeller} setBuyer={setBuyer} onPackingListClick={() => { setShowPackingHistory(true); setShowHistory(false); setIsPackingMode(true); }} onInvoiceListClick={() => { setShowHistory(true); setShowPackingHistory(false); setIsPackingMode(false); }} onDataChange={() => setSyncCounter((c) => c + 1)} />
              <button
                onClick={() => {
                  setShowPackingHistory(false);
                  setIsPackingMode(true);
                  setTitleText("PACKING LIST");
                  // Reset forms to empty packing list
                  setPackingItems([{ containerSeal: "", typeOfPacking: "", descriptionOfGoods: "", grossWeight: "", tareWeight: "", netWeight: "" }]);
                }}
                style={{
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "none",
                  borderRadius: 8,
                  background: "#1c1c1c",
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                }}
              >
                ➕ Create Packing List
              </button>
            </div>
          </div>

          {/* List Card */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 28,
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
            }}
          >
            {packingHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#888" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <p style={{ margin: 0, fontSize: 14 }}>
                  No saved packing lists yet. Click <strong>Create Packing List</strong> to get started.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 800 }}>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "100px 90px 1.2fr 1fr 1.5fr 110px 150px", gap: 10, padding: "12px 8px", borderBottom: "2px solid #1c1c1c", fontSize: 12, fontWeight: 700, color: "#555" }}>
                    <div>Date</div>
                    <div>Transport</div>
                    <div>Packing Ref No</div>
                    <div>Ref No</div>
                    <div>Buyer Name</div>
                    <div style={{ textAlign: "right" }}>Total Net Wt (MTS)</div>
                    <div style={{ textAlign: "right" }}>Actions</div>
                  </div>
                  {packingHistory
                    .filter((pack) => {
                      if (!packingSearchQuery) return true;
                      const q = packingSearchQuery.toLowerCase();
                      const dateStr = pack.savedAt ? new Date(pack.savedAt).toLocaleDateString() : "";
                      const goodsStr = pack.packingItems?.map(it => it.descriptionOfGoods || "").join(" ").toLowerCase() || "";
                      return (
                        pack.meta?.invoiceNo?.toLowerCase().includes(q) ||
                        pack.meta?.refNo?.toLowerCase().includes(q) ||
                        pack.buyer?.name?.toLowerCase().includes(q) ||
                        pack.meta?.transportType?.toLowerCase().includes(q) ||
                        dateStr.includes(q) ||
                        goodsStr.includes(q)
                      );
                    })
                    .map((pack, i) => {
                    const totalNet = pack.packingItems?.reduce((s, it) => s + (parseFloat(it.netWeight) || 0), 0) || 0;
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 90px 1.2fr 1fr 1.5fr 110px 150px", gap: 10, padding: "14px 8px", borderBottom: "1px solid #eee", fontSize: 13, alignItems: "center" }}>
                        <div style={{ color: "#666" }}>{pack.savedAt ? new Date(pack.savedAt).toLocaleDateString() : ""}</div>
                        <div style={{ color: "#666" }}>{pack.meta?.transportType || "—"}</div>
                        <div style={{ fontWeight: 700, color: "#1c1c1c" }}>{pack.meta?.invoiceNo || "—"}</div>
                        <div style={{ color: "#444" }}>{pack.meta?.refNo || "—"}</div>
                        <div style={{ color: "#444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={pack.buyer?.name}>{pack.buyer?.name || "—"}</div>
                        <div style={{ textAlign: "right", fontWeight: 600 }}>{totalNet ? totalNet.toFixed(3) : "0.000"}</div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => {
                            setSeller(pack.seller || seller);
                            setBuyer(pack.buyer || buyer);
                            setNotifyParty(pack.notifyParty || notifyParty || {});
                            setMeta(pack.meta || meta);
                            setPackingItems(pack.packingItems || packingItems);
                            setTitleText(pack.titleText || "PACKING LIST");
                            if (pack.logo) setLogo(pack.logo);
                            if (pack.signature) setSignature(pack.signature);
                            if (pack.stamp) setStamp(pack.stamp);
                            setShowPackingHistory(false);
                            setIsPackingMode(true);
                            setEditingIndex(i);
                            showToast("Packing list loaded!");
                          }}
                            style={{ padding: "6px 10px", fontSize: 12, border: "1px solid #d4d4d4", borderRadius: 6, background: "#fff", cursor: "pointer" }}>✏️ Edit</button>
                          <button onClick={() => {
                            const pdfData = {
                              ...pack,
                              logo: pack.logo || logo,
                              signature: pack.signature || signature,
                              stamp: pack.stamp || stamp,
                              logoWidth,
                              logoHeight,
                              sigWidth,
                              sigHeight,
                              stampWidth,
                              stampHeight,
                              titleText: pack.titleText || "PACKING LIST",
                              titleFontSize,
                              titleAlign,
                              titleXOffset,
                              titleYOffset,
                            };
                            activePackingTheme.pdf(pdfData);
                            showToast("PDF downloaded!");
                          }}
                            style={{ padding: "6px 10px", fontSize: 12, border: "1px solid #d4d4d4", borderRadius: 6, background: "#fff", cursor: "pointer" }}>⬇️ PDF</button>
                          <button onClick={() => {
                            const pw = prompt("Enter password 'abcd' to delete this packing list:");
                            if (pw === "abcd") {
                              const list = loadPackingHistory();
                              list.splice(i, 1);
                              localStorage.setItem(_key("easyinvoice_packinghistory"), JSON.stringify(list));
                              setPackingHistory(list);
                            } else if (pw !== null) {
                              alert("Wrong password!");
                            }
                          }}
                            style={{ padding: "6px 10px", fontSize: 12, border: "1px solid #ffcdd2", borderRadius: 6, background: "#ffe9e9", cursor: "pointer", color: "#b3261e" }}>🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!showHistory && !showPackingHistory && (
        <div
          className="app-layout"
          style={{
            padding: 20,
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
        {/* ========== FORM PANEL ========== */}
        <div
          className="no-print"
          style={{
            background: "#fff",
            borderRadius: 10,
            padding: 18,
            height: "fit-content",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>easyInvoice</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 18 }}>
                Fill in the details — the preview updates live.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <ManagementMenu uid={user?.uid || ""} sellers={seller} setSellers={setSeller} setBuyer={setBuyer} onPackingListClick={() => { setShowPackingHistory(true); setShowHistory(false); setIsPackingMode(true); }} onInvoiceListClick={() => { setShowHistory(true); setShowPackingHistory(false); setIsPackingMode(false); }} onDataChange={() => setSyncCounter((c) => c + 1)} />
              <button
                onClick={() => {
                  if (isPackingMode) {
                    setShowPackingHistory(true);
                  } else {
                    setShowHistory(true);
                  }
                }}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "1px solid #1c1c1c",
                  borderRadius: 5,
                  background: "#fff",
                }}
                title={isPackingMode ? "Packing Lists" : "Invoices List"}
              >
                📋 {isPackingMode ? "Packing Lists" : "Invoices List"}
              </button>
              {/* Logout moved to menu */}
            </div>
          </div>

          <Section title="Theme">
            <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6 }}>
              Invoice Theme
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {INVOICE_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectInvoiceTheme(t.id)}
                  title={`Use "${t.name}" for the invoice preview & PDF`}
                  style={{
                    padding: "8px 10px",
                    fontSize: 11.5,
                    fontWeight: 600,
                    textAlign: "left",
                    border: invoiceThemeId === t.id ? "2px solid #1a4fa0" : "1px solid #d4d4d4",
                    borderRadius: 8,
                    background: invoiceThemeId === t.id ? "#eef4fc" : "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ display: "flex", borderRadius: 4, overflow: "hidden", border: "1px solid #ddd", flexShrink: 0 }}>
                    <span style={{ width: 14, height: 18, background: t.swatch[0] }} />
                    <span style={{ width: 14, height: 18, background: t.swatch[1] }} />
                  </span>
                  <span style={{ lineHeight: 1.25 }}>{t.name}</span>
                  {invoiceThemeId === t.id && <span style={{ marginLeft: "auto", color: "#1a4fa0", fontWeight: 800 }}>✓</span>}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6 }}>
              Packing List Theme
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {PACKING_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectPackingTheme(t.id)}
                  title={`Use "${t.name}" for the packing list preview & PDF`}
                  style={{
                    padding: "8px 10px",
                    fontSize: 11.5,
                    fontWeight: 600,
                    textAlign: "left",
                    border: packingThemeId === t.id ? "2px solid #1a4fa0" : "1px solid #d4d4d4",
                    borderRadius: 8,
                    background: packingThemeId === t.id ? "#eef4fc" : "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ display: "flex", borderRadius: 4, overflow: "hidden", border: "1px solid #ddd", flexShrink: 0 }}>
                    <span style={{ width: 14, height: 18, background: t.swatch[0] }} />
                    <span style={{ width: 14, height: 18, background: t.swatch[1] }} />
                  </span>
                  <span style={{ lineHeight: 1.25 }}>{t.name}</span>
                  {packingThemeId === t.id && <span style={{ marginLeft: "auto", color: "#1a4fa0", fontWeight: 800 }}>✓</span>}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: "#888", marginTop: 10, lineHeight: 1.5 }}>
              The preview &amp; downloaded PDF update instantly. <b>Classic</b> remains the default theme — nothing about it has changed.
            </div>
          </Section>

          <Section title="Header">
            {/* Password Unlock Box for Dimensions */}
            {logo || signature || stamp ? (
              sizeLock ? (
                <div style={{ marginBottom: 12, border: "1px solid #d4d4d4", borderRadius: 6, padding: 8, background: "#fafafa" }}>
                  <label style={{ fontSize: 10.5, color: "#555", fontWeight: 700, display: "block", marginBottom: 4 }}>🔒 Unlock Dimensions to Edit:</label>
                  <input
                    type="password"
                    value={sizePw}
                    onChange={(e) => {
                      setSizePw(e.target.value);
                      if (e.target.value === "abcd") {
                        setSizeLock(false);
                        showToast("Dimensions unlocked!");
                      }
                    }}
                    placeholder="Enter password 'abcd'"
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "4px 6px",
                      fontSize: 12,
                      border: "1px solid #d4d4d4",
                      borderRadius: 4,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ) : (
                <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #c8e6c9", borderRadius: 6, padding: "6px 8px", background: "#e8f5e9" }}>
                  <span style={{ fontSize: 11, color: "#2e7d32", fontWeight: 700 }}>🔓 Dimensions Unlocked</span>
                  <button onClick={() => { setSizeLock(true); setSizePw(""); }} style={{ fontSize: 10, background: "#fff", border: "1px solid #d4d4d4", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Lock</button>
                </div>
              )
            ) : null}

            {/* Logo Row */}
            <div style={{ display: "flex", gap: 8, marginBottom: logo ? 6 : 10 }}>
              <button
                onClick={() => {
                  const saved = loadList("easyinvoice_logos");
                  if (saved.length > 0) { setImgSelector("logo"); setImgPw(""); }
                  else logoInput.current.click();
                }}
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  fontSize: 12,
                  border: "1px dashed #999",
                  borderRadius: 6,
                  background: "#fafafa",
                }}
              >
                {logo ? "Change logo" : "+ Add logo"}
              </button>
              {logo && (
                <button
                  onClick={() => { setLogo(null); localStorage.removeItem(_uid + "_easyinvoice_selectedLogo"); }}
                  style={{
                    padding: "8px 10px",
                    fontSize: 12,
                    border: "1px solid #d4d4d4",
                    borderRadius: 6,
                    background: "#fff",
                  }}
                >
                  Remove
                </button>
              )}
              <input
                ref={logoInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  handleImage(e.target.files[0], (dataUrl) => {
                    setLogo(dataUrl);
                    localStorage.setItem(_uid + "_easyinvoice_selectedLogo", dataUrl);
                  });
                }}
              />
            </div>
            {logo && (
              <div style={{ padding: "8px", border: "1px solid #e8e8e8", borderRadius: 6, marginBottom: 12, background: "#fafafa", opacity: sizeLock ? 0.75 : 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6 }}>Logo Dimensions (mm):</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 4 }}>
                  <span style={{ width: 12 }}>W:</span>
                  <input type="range" min="10" max="150" value={logoWidth} disabled={sizeLock} onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setLogoWidth(val);
                    localStorage.setItem(_uid + "_easyinvoice_logoWidth", val);
                  }} style={{ flex: 1, height: 4, cursor: sizeLock ? "not-allowed" : "pointer" }} />
                  <span style={{ width: 30, textAlign: "right", fontWeight: 600 }}>{logoWidth}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ width: 12 }}>H:</span>
                  <input type="range" min="5" max="80" value={logoHeight} disabled={sizeLock} onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setLogoHeight(val);
                    localStorage.setItem(_uid + "_easyinvoice_logoHeight", val);
                  }} style={{ flex: 1, height: 4, cursor: sizeLock ? "not-allowed" : "pointer" }} />
                  <span style={{ width: 30, textAlign: "right", fontWeight: 600 }}>{logoHeight}</span>
                </div>
              </div>
            )}

            {/* Signature Row */}
            <div style={{ display: "flex", gap: 8, marginBottom: signature ? 6 : 10 }}>
              <button
                onClick={() => {
                  const saved = loadList("easyinvoice_signatures");
                  if (saved.length > 0) { setImgSelector("signature"); setImgPw(""); }
                  else sigInput.current.click();
                }}
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  fontSize: 12,
                  border: "1px dashed #999",
                  borderRadius: 6,
                  background: "#fafafa",
                }}
              >
                {signature ? "Change signature/stamp" : "+ Add signature/stamp"}
              </button>
              {signature && (
                <button
                  onClick={() => { setSignature(null); localStorage.removeItem(_uid + "_easyinvoice_selectedSignature"); }}
                  style={{
                    padding: "8px 10px",
                    fontSize: 12,
                    border: "1px solid #d4d4d4",
                    borderRadius: 6,
                    background: "#fff",
                  }}
                >
                  Remove
                </button>
              )}
              <input
                ref={sigInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  handleImage(e.target.files[0], (dataUrl) => {
                    setSignature(dataUrl);
                    localStorage.setItem(_uid + "_easyinvoice_selectedSignature", dataUrl);
                  });
                }}
              />
            </div>
            {signature && (
              <div style={{ padding: "8px", border: "1px solid #e8e8e8", borderRadius: 6, marginBottom: 12, background: "#fafafa", opacity: sizeLock ? 0.75 : 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6 }}>Signature Dimensions (mm):</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 4 }}>
                  <span style={{ width: 12 }}>W:</span>
                  <input type="range" min="10" max="100" value={sigWidth} disabled={sizeLock} onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSigWidth(val);
                    localStorage.setItem(_uid + "_easyinvoice_sigWidth", val);
                  }} style={{ flex: 1, height: 4, cursor: sizeLock ? "not-allowed" : "pointer" }} />
                  <span style={{ width: 30, textAlign: "right", fontWeight: 600 }}>{sigWidth}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ width: 12 }}>H:</span>
                  <input type="range" min="5" max="60" value={sigHeight} disabled={sizeLock} onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSigHeight(val);
                    localStorage.setItem(_uid + "_easyinvoice_sigHeight", val);
                  }} style={{ flex: 1, height: 4, cursor: sizeLock ? "not-allowed" : "pointer" }} />
                  <span style={{ width: 30, textAlign: "right", fontWeight: 600 }}>{sigHeight}</span>
                </div>
              </div>
            )}

            {/* Stamp Row */}
            <div style={{ display: "flex", gap: 8, marginBottom: stamp ? 6 : 10 }}>
              <button
                onClick={() => {
                  const saved = loadList("easyinvoice_stamps");
                  if (saved.length > 0) { setImgSelector("stamp"); setImgPw(""); }
                  else stampInput.current.click();
                }}
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  fontSize: 12,
                  border: "1px dashed #999",
                  borderRadius: 6,
                  background: "#fafafa",
                }}
              >
                {stamp ? "Change stamp" : "+ Add stamp"}
              </button>
              {stamp && (
                <button
                  onClick={() => { setStamp(null); localStorage.removeItem(_uid + "_easyinvoice_selectedStamp"); }}
                  style={{
                    padding: "8px 10px",
                    fontSize: 12,
                    border: "1px solid #d4d4d4",
                    borderRadius: 6,
                    background: "#fff",
                  }}
                >
                  Remove
                </button>
              )}
              <input
                ref={stampInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  handleImage(e.target.files[0], (dataUrl) => {
                    setStamp(dataUrl);
                    localStorage.setItem(_uid + "_easyinvoice_selectedStamp", dataUrl);
                  });
                }}
              />
            </div>
            {stamp && (
              <div style={{ padding: "8px", border: "1px solid #e8e8e8", borderRadius: 6, marginBottom: 10, background: "#fafafa", opacity: sizeLock ? 0.75 : 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6 }}>Stamp Dimensions (mm):</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 4 }}>
                  <span style={{ width: 12 }}>W:</span>
                  <input type="range" min="10" max="100" value={stampWidth} disabled={sizeLock} onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setStampWidth(val);
                    localStorage.setItem(_uid + "_easyinvoice_stampWidth", val);
                  }} style={{ flex: 1, height: 4, cursor: sizeLock ? "not-allowed" : "pointer" }} />
                  <span style={{ width: 30, textAlign: "right", fontWeight: 600 }}>{stampWidth}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ width: 12 }}>H:</span>
                  <input type="range" min="5" max="60" value={stampHeight} disabled={sizeLock} onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setStampHeight(val);
                    localStorage.setItem(_uid + "_easyinvoice_stampHeight", val);
                  }} style={{ flex: 1, height: 4, cursor: sizeLock ? "not-allowed" : "pointer" }} />
                  <span style={{ width: 30, textAlign: "right", fontWeight: 600 }}>{stampHeight}</span>
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, padding: "8px", border: "1px solid #e8e8e8", borderRadius: 6, background: "#fafafa" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6 }}>
                {isPackingMode ? "Document Heading:" : "Invoice Heading:"}
              </div>
              <div style={{ marginBottom: 6 }}>
                {isPackingMode ? (
                  <input
                    type="text"
                    disabled
                    value="PACKING LIST"
                    style={{ display: "block", width: "100%", padding: "5px", fontSize: 12, border: "1px solid #d4d4d4", borderRadius: 4, boxSizing: "border-box", background: "#eee", cursor: "not-allowed" }}
                  />
                ) : (
                  <>
                    <select
                      value={["COMMERCIAL INVOICE", "INVOICE", "TAX INVOICE", "PROFORMA INVOICE"].includes(titleText) ? titleText : "CUSTOM"}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== "CUSTOM") {
                          setTitleText(val);
                          localStorage.setItem(_uid + "_easyinvoice_titleText", val);
                        } else {
                          setTitleText("");
                          localStorage.setItem(_uid + "_easyinvoice_titleText", "");
                        }
                      }}
                      style={{ display: "block", width: "100%", padding: "5px", fontSize: 12, border: "1px solid #d4d4d4", borderRadius: 4, outline: "none", boxSizing: "border-box" }}
                    >
                      <option value="COMMERCIAL INVOICE">COMMERCIAL INVOICE</option>
                      <option value="INVOICE">INVOICE</option>
                      <option value="TAX INVOICE">TAX INVOICE</option>
                      <option value="PROFORMA INVOICE">PROFORMA INVOICE</option>
                      <option value="CUSTOM">Custom Heading...</option>
                    </select>
                    {!["COMMERCIAL INVOICE", "INVOICE", "TAX INVOICE", "PROFORMA INVOICE"].includes(titleText) ? (
                      <input
                        type="text"
                        value={titleText}
                        onChange={(e) => {
                          setTitleText(e.target.value);
                          localStorage.setItem(_uid + "_easyinvoice_titleText", e.target.value);
                        }}
                        placeholder="Enter custom heading"
                        style={{ display: "block", width: "100%", marginTop: 4, padding: "5px", fontSize: 12, border: "1px solid #d4d4d4", borderRadius: 4, boxSizing: "border-box" }}
                      />
                    ) : null}
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                <button
                  disabled={sizeLock}
                  onClick={() => { setTitleAlign("left"); localStorage.setItem(_uid + "_easyinvoice_titleAlign", "left"); }}
                  style={{ flex: 1, padding: "4px", fontSize: 10, fontWeight: 600, border: "1px solid #d4d4d4", borderRadius: 4, background: titleAlign === "left" ? "#1c1c1c" : "#fff", color: titleAlign === "left" ? "#fff" : "#333", cursor: sizeLock ? "not-allowed" : "pointer" }}
                >Left</button>
                <button
                  disabled={sizeLock}
                  onClick={() => { setTitleAlign("center"); localStorage.setItem(_uid + "_easyinvoice_titleAlign", "center"); }}
                  style={{ flex: 1, padding: "4px", fontSize: 10, fontWeight: 600, border: "1px solid #d4d4d4", borderRadius: 4, background: titleAlign === "center" ? "#1c1c1c" : "#fff", color: titleAlign === "center" ? "#fff" : "#333", cursor: sizeLock ? "not-allowed" : "pointer" }}
                >Center</button>
                <button
                  disabled={sizeLock}
                  onClick={() => { setTitleAlign("right"); localStorage.setItem(_uid + "_easyinvoice_titleAlign", "right"); }}
                  style={{ flex: 1, padding: "4px", fontSize: 10, fontWeight: 600, border: "1px solid #d4d4d4", borderRadius: 4, background: titleAlign === "right" ? "#1c1c1c" : "#fff", color: titleAlign === "right" ? "#fff" : "#333", cursor: sizeLock ? "not-allowed" : "pointer" }}
                >Right</button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 4, opacity: sizeLock ? 0.75 : 1 }}>
                <span style={{ width: 40 }}>Size:</span>
                <input type="range" min="8" max="32" value={titleFontSize} disabled={sizeLock} onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setTitleFontSize(val);
                  localStorage.setItem(_uid + "_easyinvoice_titleFontSize", val);
                }} style={{ flex: 1, height: 4, cursor: sizeLock ? "not-allowed" : "pointer" }} />
                <span style={{ width: 25, textAlign: "right", fontWeight: 600 }}>{titleFontSize}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 4, opacity: sizeLock ? 0.75 : 1 }}>
                <span style={{ width: 40 }}>Move X:</span>
                <input type="range" min="-100" max="100" value={titleXOffset} disabled={sizeLock} onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setTitleXOffset(val);
                  localStorage.setItem(_uid + "_easyinvoice_titleXOffset", val);
                }} style={{ flex: 1, height: 4, cursor: sizeLock ? "not-allowed" : "pointer" }} />
                <span style={{ width: 25, textAlign: "right", fontWeight: 600 }}>{titleXOffset}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: sizeLock ? 0.75 : 1 }}>
                <span style={{ width: 40 }}>Move Y:</span>
                <input type="range" min="-20" max="20" value={titleYOffset} disabled={sizeLock} onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setTitleYOffset(val);
                  localStorage.setItem(_uid + "_easyinvoice_titleYOffset", val);
                }} style={{ flex: 1, height: 4, cursor: sizeLock ? "not-allowed" : "pointer" }} />
                <span style={{ width: 25, textAlign: "right", fontWeight: 600 }}>{titleYOffset}</span>
              </div>
            </div>
          </Section>

          {/* Image selector modal (password-protected) */}
          {imgSelector && (() => {
            const keyMap = { logo: "easyinvoice_logos", signature: "easyinvoice_signatures", stamp: "easyinvoice_stamps" };
            const setterMap = { logo: setLogo, signature: setSignature, stamp: setStamp };
            const storageMap = { logo: "easyinvoice_selectedLogo", signature: "easyinvoice_selectedSignature", stamp: "easyinvoice_selectedStamp" };
            const inputMap = { logo: logoInput, signature: sigInput, stamp: stampInput };
            const savedImages = loadList(keyMap[imgSelector]);
            const setter = setterMap[imgSelector];
            const storageKey = storageMap[imgSelector];
            return (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setImgSelector(null)}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 520, width: "90%", maxHeight: "80vh", overflow: "auto" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Select {imgSelector}</h3>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Password</label>
                    <input type="password" value={imgPw} onChange={(e) => setImgPw(e.target.value)}
                      style={{ display: "block", width: "100%", marginTop: 3, padding: "6px 8px", fontSize: 13, border: "1px solid #d4d4d4", borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                      placeholder="Enter password" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {savedImages.map((img) => (
                      <div key={img.id} style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 8, textAlign: "center", cursor: "pointer" }}
                        onClick={() => {
                          if (imgPw !== "abcd") { alert("Wrong password"); return; }
                          setter(img.dataUrl);
                          localStorage.setItem(_uid + "_" + storageKey, img.dataUrl);
                          setImgSelector(null);
                          showToast(`${imgSelector} selected permanently!`);
                        }}>
                        <img src={img.dataUrl} alt={img.name} style={{ maxWidth: "100%", maxHeight: 80, objectFit: "contain", marginBottom: 4 }} />
                        <div style={{ fontSize: 10, color: "#888" }}>{img.name}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => { setImgSelector(null); inputMap[imgSelector].current.click(); }}
                    style={{ marginTop: 12, padding: "8px 16px", fontSize: 12, border: "1px dashed #999", borderRadius: 6, background: "#fafafa", width: "100%", cursor: "pointer" }}>
                    Or upload a new image
                  </button>
                </div>
              </div>
            );
          })()}

          <Section title="Invoice details">
            {field(isPackingMode ? "Packing Ref No" : "Invoice No", meta.invoiceNo, (v) =>
              setMeta({ ...meta, invoiceNo: v })
            )}
            {field("Ref Number", meta.refNo || "", (v) =>
              setMeta({ ...meta, refNo: v })
            )}
            {dateField("Date", meta.date, (v) =>
              setMeta({ ...meta, date: v })
            )}
            {field("Supplier PO", meta.supplierPo, (v) =>
              setMeta({ ...meta, supplierPo: v })
            )}
            {dateField("PO Date", meta.poDate, (v) =>
              setMeta({ ...meta, poDate: v })
            )}
            {field("Transport Type", meta.transportType, (v) =>
              setMeta({ ...meta, transportType: v })
            )}
            {field("Driver / Vessel No", meta.driverVessel, (v) =>
              setMeta({ ...meta, driverVessel: v })
            )}
            {textArea("Loading At", meta.loadingAt, (v) =>
              setMeta({ ...meta, loadingAt: v })
            , "dl-loading")}
            {textArea("Final Destination", meta.finalDestination, (v) =>
              setMeta({ ...meta, finalDestination: v })
            , "dl-finalDest")}
            {textArea("Packing", meta.packing, (v) =>
              setMeta({ ...meta, packing: v })
            )}
            {textArea("Payment Terms", meta.paymentTerms, (v) =>
              setMeta({ ...meta, paymentTerms: v })
            , "dl-paymentTerms")}
            {field("Currency", meta.currency, (v) => {
              const upperV = v.toUpperCase();
              const matched = dlCurrencies.find(c => 
                (typeof c === "string" ? c : c.code)?.toUpperCase() === upperV
              );
              const sub = matched && typeof matched === "object" ? matched.subunit : (meta.subunit || "CENTS");
              setMeta({ ...meta, currency: v, subunit: sub });
            }, "", true, "dl-currency")}
            {field("Currency Subunit (e.g. Fils, Cent, Paisa)", meta.subunit || "", (v) =>
              setMeta({ ...meta, subunit: v })
            , "e.g. Cents", true)}
            {textArea("Amount In Words", meta.amountInWords, (v) =>
              setMeta({ ...meta, amountInWords: v })
            , "", autoWords)}
          </Section>

          <Section title="Seller">
            {field("Name", seller.name, (v) =>
              setSeller({ ...seller, name: v })
            , "", false, null, true)}
            {field("Address line 1", seller.addr1, (v) =>
              setSeller({ ...seller, addr1: v })
            , "", false, null, true)}
            {field("Address line 2", seller.addr2, (v) =>
              setSeller({ ...seller, addr2: v })
            , "", false, null, true)}
            {field("TRN No", seller.trn, (v) =>
              setSeller({ ...seller, trn: v })
            , "", false, null, true)}
            {field("Contact", seller.contact, (v) =>
              setSeller({ ...seller, contact: v })
            , "", false, null, true)}
            {field("Email", seller.email, (v) =>
              setSeller({ ...seller, email: v })
            , "", false, null, true)}
          </Section>

          <Section title="Buyer / Consignee">
            <CustomerDropdown value={buyer.name} onChange={(v) => setBuyer({ ...buyer, name: v })}
              onSelect={(c) => setBuyer({
                name: c.name || "",
                addr1: c.addr1 || "",
                addr2: c.addr2 || "",
                gst: c.gst || "",
                pan: c.pan || "",
                contact: c.contact || "",
                email: c.email || "",
              })}
              onAddNew={() => { const btn = document.querySelector('button[title="Menu"]'); if(btn) btn.click(); setTimeout(() => { document.querySelectorAll('button').forEach(b => { if(b.textContent.includes('Manage Customers')) b.click(); }); }, 100); }} />
            {field("Address line 1", buyer.addr1, (v) =>
              setBuyer({ ...buyer, addr1: v })
            )}
            {field("Address line 2", buyer.addr2, (v) =>
              setBuyer({ ...buyer, addr2: v })
            )}
            {field("GST", buyer.gst, (v) => setBuyer({ ...buyer, gst: v }))}
            {field("PAN", buyer.pan, (v) => setBuyer({ ...buyer, pan: v }))}
            {field("Contact", buyer.contact, (v) =>
              setBuyer({ ...buyer, contact: v })
            )}
            {field("Email", buyer.email, (v) =>
              setBuyer({ ...buyer, email: v })
            )}
          </Section>

          <Section title="Notify Party">
            <CustomerDropdown value={notifyParty.name} onChange={(v) => setNotifyParty({ ...notifyParty, name: v })}
              onSelect={(c) => setNotifyParty({
                name: c.name || "",
                addr1: c.addr1 || "",
                addr2: c.addr2 || "",
                email: c.email || "",
                contact: c.contact || "",
              })} />
            {field("Address line 1", notifyParty.addr1, (v) =>
              setNotifyParty({ ...notifyParty, addr1: v })
            )}
            {field("Address line 2", notifyParty.addr2, (v) =>
              setNotifyParty({ ...notifyParty, addr2: v })
            )}
            {field("Email", notifyParty.email, (v) =>
              setNotifyParty({ ...notifyParty, email: v })
            )}
            {field("Contact", notifyParty.contact, (v) =>
              setNotifyParty({ ...notifyParty, contact: v })
            )}
          </Section>

          {!isPackingMode && (
            <Section title="Marks and Numbers">
              {containers.length === 0 && (
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontStyle: "italic" }}>
                  No containers added. Leave empty if no container marks are required.
                </div>
              )}
              {containers.map((c, i) => (
                <div key={i} style={{ border: "1px solid #e8e8e8", borderRadius: 6, padding: 8, marginBottom: 8, background: "#fafafa" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1 }}>
                      {field(`Container No (${i + 1})`, c.containerNo || "", (v) => {
                        const next = [...containers];
                        next[i] = { ...next[i], containerNo: v };
                        setContainers(next);
                        localStorage.setItem(_uid + "_easyinvoice_containers", JSON.stringify(next));
                      }, "e.g. MRSU9998798", true)}
                    </div>
                    <div style={{ flex: 1 }}>
                      {field(`Seal No (${i + 1})`, c.sealNo || "", (v) => {
                        const next = [...containers];
                        next[i] = { ...next[i], sealNo: v };
                        setContainers(next);
                        localStorage.setItem(_uid + "_easyinvoice_containers", JSON.stringify(next));
                      }, "e.g. ML-AE88786688", true)}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const next = containers.filter((_, idx) => idx !== i);
                      setContainers(next);
                      localStorage.setItem(_uid + "_easyinvoice_containers", JSON.stringify(next));
                    }}
                    style={{ fontSize: 11, color: "#b3261e", background: "none", border: "none", padding: "2px 0", marginTop: 2, cursor: "pointer", fontWeight: 600 }}
                  >
                    ✕ Remove Container
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    const next = [...containers, { containerNo: "", sealNo: "" }];
                    setContainers(next);
                    localStorage.setItem(_uid + "_easyinvoice_containers", JSON.stringify(next));
                  }}
                  style={{ flex: 1, padding: "8px", fontSize: 12, border: "1px dashed #999", borderRadius: 6, background: "#fff", cursor: "pointer", fontWeight: 600 }}
                >
                  + Add Container
                </button>
                {containers.length > 0 && (
                  <button
                    onClick={() => {
                      setContainers([]);
                      localStorage.setItem(_uid + "_easyinvoice_containers", JSON.stringify([]));
                    }}
                    style={{ padding: "8px 12px", fontSize: 12, border: "1px solid #e0e0e0", borderRadius: 6, background: "#fff", color: "#b3261e", cursor: "pointer" }}
                    title="Remove all containers"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </Section>
          )}


          {isPackingMode ? (
            <Section title="Packing Details">
              {packingItems.map((it, i) => (
                <div key={i} style={{ border: "1px solid #e8e8e8", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                  {textArea("Container & Seal No.", it.containerSeal || "", (v) => updatePackingItem(i, "containerSeal", v), "", "e.g. 1 x 40\" HC\nCONT : REGU 511023 0\nSL : AEDXB260622")}
                  {field("Type of Packing", it.typeOfPacking || "", (v) => updatePackingItem(i, "typeOfPacking", v), "e.g. 37 JUMBO BAGS", true)}
                  {textArea("Description of Goods", it.descriptionOfGoods || "", (v) => updatePackingItem(i, "descriptionOfGoods", v), "", "e.g. PC BOTTLE REGRIND\nHSN CODE : 39074000")}
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1 }}>
                      {field("Gross Wt (MTS)", it.grossWeight || "", (v) => updatePackingItem(i, "grossWeight", v), "", true)}
                    </div>
                    <div style={{ flex: 1 }}>
                      {field("Tare Wt (MTS)", it.tareWeight || "", (v) => updatePackingItem(i, "tareWeight", v), "", true)}
                    </div>
                    <div style={{ flex: 1 }}>
                      {field("Net Wt (MTS)", it.netWeight || "", (v) => updatePackingItem(i, "netWeight", v), "", true)}
                    </div>
                  </div>
                  {packingItems.length > 1 && (
                    <button
                      onClick={() => removePackingItem(i)}
                      style={{ fontSize: 11, color: "#b3261e", background: "none", border: "none", padding: 0, marginTop: 2 }}
                    >
                      Remove row
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addPackingItem}
                style={{ width: "100%", padding: "8px", fontSize: 12, border: "1px dashed #999", borderRadius: 6, background: "#fafafa" }}
              >
                + Add packing item
              </button>
              <div style={{ marginTop: 10 }}>
                {field("Origin of Goods", meta.originOfGoods, (v) => setMeta({ ...meta, originOfGoods: v }), "", true, "dl-origins")}
              </div>
            </Section>
          ) : (
            <Section title="Items Details">
              {items.map((it, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #e8e8e8",
                    borderRadius: 6,
                    padding: 8,
                    marginBottom: 8,
                  }}
                >
                  {field(
                    `Material Description (row ${i + 1})`,
                    it.description,
                    (v) => updateItem(i, "description", v),
                    "",
                    true,
                    "dl-itemNames"
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1 }}>
                      {field("Qty", it.qty, (v) => updateItem(i, "qty", v), "", true)}
                    </div>
                    <div style={{ flex: 1 }}>
                      {field("Rate", it.rate, (v) => updateItem(i, "rate", v), "", true)}
                    </div>
                    <div style={{ flex: 1 }}>
                      {field("Per", it.per, (v) => updateItem(i, "per", v), "", true, "dl-qtyUnits")}
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(i)}
                      style={{
                        fontSize: 11,
                        color: "#b3261e",
                        background: "none",
                        border: "none",
                        padding: 0,
                        marginTop: 2,
                      }}
                    >
                      Remove row
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addItem}
                style={{
                  width: "100%",
                  padding: "8px",
                  fontSize: 12,
                  border: "1px dashed #999",
                  borderRadius: 6,
                  background: "#fafafa",
                }}
              >
                + Add line item
              </button>
              <div style={{ marginTop: 10 }}>
                {field("Origin of Goods", meta.originOfGoods, (v) =>
                  setMeta({ ...meta, originOfGoods: v })
                , "", true, "dl-origins")}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    {field("VAT %", String(vatPercent), setVatPercent, "", true)}
                  </div>
                  <div style={{ flex: 1 }}>
                    {field("Advance %", String(advancePercent), setAdvancePercent, "", true)}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {!isPackingMode && (
            <Section title="Bank details">
              {dlBanks && dlBanks.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Select Saved Bank</label>
                  <select 
                    onChange={(e) => {
                      const idx = e.target.value;
                      if (idx !== "") {
                        const selected = dlBanks[idx];
                        setBank({
                          accName: selected.accName || "",
                          bankName: selected.bankName || "",
                          accNo: selected.accNo || "",
                          iban: selected.iban || "",
                          swift: selected.swift || "",
                          address: selected.address || "",
                        });
                      }
                    }}
                    style={{ display: "block", width: "100%", marginTop: 3, padding: "7px 8px", fontSize: 13, border: "1px solid #d4d4d4", borderRadius: 5, outline: "none", background: "#fff", fontFamily: "inherit" }}
                  >
                    <option value="">-- Choose a Saved Bank --</option>
                    {dlBanks.map((bk, idx) => (
                      <option key={idx} value={idx}>{bk.bankName} ({bk.accNo})</option>
                    ))}
                  </select>
                </div>
              )}
              {field("Account Name", bank.accName, (v) =>
                setBank({ ...bank, accName: v })
              )}
              {field("Bank Name", bank.bankName, (v) =>
                setBank({ ...bank, bankName: v })
              )}
              {field("Account No", bank.accNo, (v) =>
                setBank({ ...bank, accNo: v })
              )}
              {field("IBAN No", bank.iban, (v) =>
                setBank({ ...bank, iban: v })
              )}
              {field("Swift No", bank.swift, (v) =>
                setBank({ ...bank, swift: v })
              )}
              {field("Address", bank.address, (v) =>
                setBank({ ...bank, address: v })
              )}
            </Section>
          )}

          {editingIndex !== null ? (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button
                onClick={isPackingMode ? handleUpdatePackingList : handleUpdateInvoice}
                style={{ flex: 1, padding: "10px", fontSize: 12, fontWeight: 700, color: "#fff", background: "#1a4fa0", border: "none", borderRadius: 7, cursor: "pointer" }}
              >
                🔄 Update {isPackingMode ? "Packing" : "Invoice"}
              </button>
              <button
                onClick={isPackingMode ? handleSavePackingList : () => {
                  const data = { seller, buyer, notifyParty, containers, meta, bank, items, vatPercent: parseFloat(vatPercent) || 0, advancePercent: parseFloat(advancePercent) || 0, logo, signature, stamp };
                  const saved = saveToHistory(data);
                  setHistory(loadHistory());
                  showToast(saved ? "Saved as new Invoice!" : "Duplicate invoice/ref no — not saved");
                  setShowPackingPrompt(true);
                }}
                style={{ flex: 1, padding: "10px", fontSize: 12, fontWeight: 600, color: "#1c1c1c", background: "#fff", border: "1px solid #1c1c1c", borderRadius: 7, cursor: "pointer" }}
              >
                💾 Save As New
              </button>
            </div>
          ) : (
            <button
              onClick={isPackingMode ? handleSavePackingList : () => {
                const data = { seller, buyer, notifyParty, containers, meta, bank, items, vatPercent: parseFloat(vatPercent) || 0, advancePercent: parseFloat(advancePercent) || 0, logo, signature, stamp };
                const saved = saveToHistory(data);
                setHistory(loadHistory());
                showToast(saved ? "Invoice saved!" : "Duplicate invoice/ref no — not saved");
                setShowPackingPrompt(true);
              }}
              style={{ width: "100%", padding: "10px", fontSize: 12, fontWeight: 600, color: "#1c1c1c", background: "#fff", border: "1px solid #1c1c1c", borderRadius: 7, marginTop: 4, cursor: "pointer" }}>
              💾 Save {isPackingMode ? "Packing List" : "Invoice"}
            </button>
          )}
          <button
            onClick={isPackingMode ? handleDownloadPackingList : downloadPDF}
            disabled={pdfBusy}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              background: pdfBusy ? "#8a8a8a" : "#1c1c1c",
              border: "none",
              borderRadius: 7,
              marginTop: 6,
            }}
          >
            {pdfBusy ? "Generating PDF…" : `⬇ Download ${isPackingMode ? "Packing List" : "PDF"}`}
          </button>
          <button
            onClick={() => window.print()}
            style={{
              width: "100%",
              padding: "10px",
              fontSize: 12,
              fontWeight: 600,
              color: "#1c1c1c",
              background: "#fff",
              border: "1px solid #d4d4d4",
              borderRadius: 7,
              marginTop: 8,
            }}
          >
            🖨 Print / Save as PDF (browser)
          </button>
          {pdfError && (
            <div
              style={{
                fontSize: 11,
                color: "#b3261e",
                marginTop: 8,
                lineHeight: 1.4,
              }}
            >
              {pdfError}
            </div>
          )}
        </div>

        {/* ========== INVOICE PREVIEW ========== */}
        <div className="print-area-wrapper">
          <div
            ref={invoiceRef}
            className="print-area"
          style={{
            background: "#fff",
            padding: 28,
            fontFamily: "Arial, Helvetica, sans-serif",
            color: "#000",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            borderRadius: 4,
            maxWidth: 900,
            containerType: "inline-size",
          }}
        >
          {!isPackingMode && invoiceThemeId !== "classic" ? (
            <ActiveInvoiceThemePreview
              seller={seller}
              buyer={buyer}
              notifyParty={notifyParty}
              containers={containers}
              meta={meta}
              items={items}
              bank={bank}
              vatPercent={vatPercent}
              advancePercent={advancePercent}
              logo={logo}
              signature={signature}
              stamp={stamp}
              logoWidth={logoWidth}
              logoHeight={logoHeight}
              sigWidth={sigWidth}
              sigHeight={sigHeight}
              stampWidth={stampWidth}
              stampHeight={stampHeight}
              titleText={titleText}
              titleFontSize={titleFontSize}
              titleAlign={titleAlign}
              titleXOffset={titleXOffset}
              titleYOffset={titleYOffset}
            />
          ) : (
            <>
          {/* Top: logo + title */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              marginBottom: 14,
              position: "relative",
              minHeight: `${Math.max(logoHeight, 14) * 0.476}cqw`,
            }}
          >
            <div
              style={{
                width: "50%",
                height: `${logoHeight * 0.476}cqw`,
                display: "flex",
                alignItems: "center",
              }}
            >
              {logo ? (
                <img
                  src={logo}
                  alt="logo"
                  style={{
                    width: `${logoWidth * 0.476}cqw`,
                    height: `${logoHeight * 0.476}cqw`,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <div
                  style={{
                    fontSize: "4.5cqw",
                    fontWeight: 800,
                    color: seller.name ? "#000" : "#ccc",
                  }}
                >
                  {seller.name || "YOUR COMPANY"}
                </div>
              )}
            </div>
            <div
              style={{
                position: "absolute",
                top: `${titleYOffset * 0.476}cqw`,
                left: titleAlign === "left" ? "0" : "auto",
                right: titleAlign === "right" ? "0" : "auto",
                width: "100%",
                textAlign: titleAlign,
                transform: `translateX(${titleXOffset * 0.476}cqw)`,
                fontSize: `${titleFontSize * 0.168}cqw`,
                fontWeight: 800,
                letterSpacing: 0.5,
                pointerEvents: "none",
              }}
            >
              {isPackingMode ? "PACKING LIST" : (titleText || "INVOICE")}
            </div>
          </div>

          {/* Seller + Meta */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 0 }}>
            <tbody>
              <tr>
                <td
                  style={td({ width: "50%", border: "none" })}
                >
                  <div
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 700,
                      fontStyle: "italic",
                      marginBottom: 2,
                      background: "#e9e9e9",
                      padding: "3px 6px",
                      borderRadius: 2,
                    }}
                  >
                    SELLER
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", borderRadius: 3 }}>
                    <tbody>
                      {seller.name && (
                        <tr>
                          <td style={tdn({ fontWeight: 700 })}>{seller.name}</td>
                        </tr>
                      )}
                      {seller.addr1 && (
                        <tr>
                          <td style={tdn()}>{seller.addr1}</td>
                        </tr>
                      )}
                      {seller.addr2 && (
                        <tr>
                          <td style={tdn()}>{seller.addr2}</td>
                        </tr>
                      )}
                      {seller.trn && (
                        <tr>
                          <td style={tdn()}>TRN NO : {seller.trn}</td>
                        </tr>
                      )}
                      {seller.contact && (
                        <tr>
                          <td style={tdn()}>CONTACT : {seller.contact}</td>
                        </tr>
                      )}
                      {seller.email && (
                        <tr>
                          <td style={tdn()}>EMAIL : {seller.email}</td>
                        </tr>
                      )}
                      {Array.from({ length: Math.max(0, 8 - [seller.name, seller.addr1, seller.addr2, seller.trn, seller.contact, seller.email].filter(Boolean).length) }).map((_, i) => (
                        <tr key={`s${i}`}>
                          <td style={tdn()}>&nbsp;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
                <td
                  style={td({
                    border: "none",
                    width: "50%",
                    verticalAlign: "top",
                  })}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          INVOICE NO
                        </td>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          DATE
                        </td>
                      </tr>
                      <tr>
                        <td style={td({ textAlign: "center" })}>
                          {meta.invoiceNo}
                        </td>
                        <td style={td({ textAlign: "center" })}>
                          {fmtDate(meta.date)}
                        </td>
                      </tr>
                      <tr>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          SUPPLIER PO
                        </td>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          PO DATE
                        </td>
                      </tr>
                      <tr>
                        <td style={td({ textAlign: "center" })}>
                          {meta.supplierPo}
                        </td>
                        <td style={td({ textAlign: "center" })}>
                          {fmtDate(meta.poDate)}
                        </td>
                      </tr>
                      <tr>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          TRANSPORT TYPE
                        </td>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          DRIVER /VESSEL NO
                        </td>
                      </tr>
                      <tr>
                        <td style={td({ textAlign: "center" })}>
                          {meta.transportType}
                        </td>
                        <td style={td({ textAlign: "center" })}>
                          {meta.driverVessel}
                        </td>
                      </tr>
                      <tr>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          LOADING AT
                        </td>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          FINAL DESTINATION
                        </td>
                      </tr>
                      <tr>
                        <td style={td({ textAlign: "center" })}>
                          {inlineJoin(meta.loadingAt)}
                        </td>
                        <td style={td({ textAlign: "center" })}>
                          {inlineJoin(meta.finalDestination)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Buyer + Misc */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 0 }}>
            <tbody>
              <tr>
                <td
                  style={td({
                    width: "50%",
                    border: "none",
                    verticalAlign: "top",
                    padding: 0,
                  })}
                >
                  <div
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 700,
                      fontStyle: "italic",
                      marginBottom: 2,
                      marginTop: 0,
                      background: "#e9e9e9",
                      padding: "3px 6px",
                      borderRadius: 2,
                    }}
                  >
                    BUYER / CONSIGNEE
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", borderRadius: 3 }}>
                    <tbody>
                      {buyer.name && (
                        <tr>
                          <td style={tdn({ fontWeight: 700 })}>{buyer.name}</td>
                        </tr>
                      )}
                      {buyer.addr1 && (
                        <tr>
                          <td style={tdn()}>{buyer.addr1}</td>
                        </tr>
                      )}
                      {buyer.addr2 && (
                        <tr>
                          <td style={tdn()}>{buyer.addr2}</td>
                        </tr>
                      )}
                      {(buyer.gst || buyer.pan) && (
                        <tr>
                          <td style={tdn()}>
                            {buyer.gst && `GST: ${buyer.gst}`}
                            {buyer.gst && buyer.pan && "     "}
                            {buyer.pan && `PAN: ${buyer.pan}`}
                          </td>
                        </tr>
                      )}
                      {buyer.contact && (
                        <tr>
                          <td style={tdn()}>CONTACT : {buyer.contact}</td>
                        </tr>
                      )}
                      {buyer.email && (
                        <tr>
                          <td style={tdn()}>EMAIL : {buyer.email}</td>
                        </tr>
                      )}
                      {Array.from({ length: Math.max(0, 8 - [buyer.name, buyer.addr1, buyer.addr2, (buyer.gst || buyer.pan), buyer.contact, buyer.email].filter(Boolean).length) }).map((_, i) => (
                        <tr key={`b${i}`}>
                          <td style={tdn()}>&nbsp;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Notify Party under Buyer — always shown */}
                  <div
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 700,
                      fontStyle: "italic",
                      marginBottom: 2,
                      marginTop: 0,
                      background: "#e9e9e9",
                      padding: "3px 6px",
                      borderRadius: 2,
                    }}
                  >
                    NOTIFY PARTY
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", borderRadius: 3 }}>
                    <tbody>
                      {notifyParty.name && notifyParty.name !== "—" && (
                        <tr>
                          <td style={tdn({ fontWeight: 700 })}>{notifyParty.name}</td>
                        </tr>
                      )}
                      {notifyParty.addr1 && (
                        <tr>
                          <td style={tdn()}>{notifyParty.addr1}</td>
                        </tr>
                      )}
                      {notifyParty.addr2 && (
                        <tr>
                          <td style={tdn()}>{notifyParty.addr2}</td>
                        </tr>
                      )}
                      {notifyParty.email && (
                        <tr>
                          <td style={tdn()}>EMAIL : {notifyParty.email}</td>
                        </tr>
                      )}
                      {notifyParty.contact && (
                        <tr>
                          <td style={tdn()}>CONTACT : {notifyParty.contact}</td>
                        </tr>
                      )}
                      {!Object.values(notifyParty).some((v) => v && v.trim()) && (
                        <tr>
                          <td style={tdn({ fontStyle: "italic", color: "#888" })}>SAME AS CONSIGNEE</td>
                        </tr>
                      )}
                      {Array.from({
                        length: Math.max(0, 8 - [
                          notifyParty.name && notifyParty.name !== "—",
                          notifyParty.addr1,
                          notifyParty.addr2,
                          notifyParty.email,
                          notifyParty.contact,
                          !Object.values(notifyParty).some((v) => v && v.trim()),
                        ].filter(Boolean).length),
                      }).map((_, i) => (
                        <tr key={`np${i}`}>
                          <td style={tdn()}>&nbsp;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
                <td
                  style={td({
                    width: "50%",
                    border: "none",
                    verticalAlign: "top",
                    padding: 0,
                  })}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          PACKING
                        </td>
                      </tr>
                      <tr>
                        <td style={td()}>
                          {inlineJoin(meta.packing)}
                        </td>
                      </tr>
                      <tr>
                        <td
                          style={td({
                            fontWeight: 700,
                            background: "#e9e9e9",
                          })}
                        >
                          PAYMENT TERMS
                        </td>
                      </tr>
                      <tr>
                        <td style={td({ whiteSpace: "pre-line" })}>
                          {meta.paymentTerms}
                        </td>
                      </tr>
                      <tr>
                        <td style={td({ fontWeight: 700, background: "#e9e9e9" })}>
                          ORIGIN OF GOODS
                        </td>
                      </tr>
                      <tr>
                        <td style={td({ whiteSpace: "pre-line" })}>
                          {meta.originOfGoods}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Line items table */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 4,
            }}
          >
            <thead>
              {isPackingMode ? (
                <tr>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center", width: "6%" })}>
                    SR.
                  </td>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center", width: "25%" })}>
                    CONTAINER & SEAL NO.
                  </td>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center", width: "20%" })}>
                    TYPE OF PACKING
                  </td>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center" })}>
                    DESCRIPTION OF GOODS
                  </td>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center", width: "22%" })}>
                    QUANTITY (MTS)
                  </td>
                </tr>
              ) : (
                <tr>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center", width: "6%" })}>
                    SR.
                  </td>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center" })}>
                    MATERIAL DESCRIPTION
                  </td>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center", width: "10%" })}>
                    QTY
                  </td>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center", width: "10%" })}>
                    RATE
                  </td>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center", width: "8%" })}>
                    PER
                  </td>
                  <td style={td({ fontWeight: 700, background: "#e9e9e9", textAlign: "center", width: "14%" })}>
                    AMOUNT
                  </td>
                </tr>
              )}
            </thead>
            <tbody>
              {isPackingMode ? (
                <>
                  {packingItems.map((it, i) => (
                    <tr key={i}>
                      <td style={td({ textAlign: "center" })}>{i + 1}</td>
                      <td style={td({ whiteSpace: "pre-line" })}>{it.containerSeal}</td>
                      <td style={td({ whiteSpace: "pre-line" })}>{it.typeOfPacking}</td>
                      <td style={td({ whiteSpace: "pre-line" })}>{it.descriptionOfGoods}</td>
                      <td style={td({ textAlign: "right" })}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}><span>Gross:</span><span>{parseFloat(it.grossWeight || 0).toFixed(3)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}><span>Tare:</span><span>{parseFloat(it.tareWeight || 0).toFixed(3)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, borderTop: "1px solid #ddd", marginTop: 2, paddingTop: 1, fontWeight: "bold" }}><span>Net:</span><span>{parseFloat(it.netWeight || 0).toFixed(3)}</span></div>
                      </td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(0, 5 - packingItems.length) }).map((_, i) => (
                    <tr key={"blank_pack" + i}>
                      <td style={td()}>&nbsp;</td>
                      <td style={td()}></td>
                      <td style={td()}></td>
                      <td style={td()}></td>
                      <td style={td()}></td>
                    </tr>
                  ))}
                  <tr>
                    <td style={td({ fontWeight: 700, textAlign: "center", background: "#e9e9e9" })} colSpan={4}>
                      TOTAL WEIGHT (MTS)
                    </td>
                    <td style={td({ fontWeight: 700, textAlign: "right", background: "#e9e9e9" })}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}><span>Gross:</span><span>{packingItems.reduce((s, it) => s + (parseFloat(it.grossWeight) || 0), 0).toFixed(3)}</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}><span>Tare:</span><span>{packingItems.reduce((s, it) => s + (parseFloat(it.tareWeight) || 0), 0).toFixed(3)}</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, borderTop: "1px solid #888", marginTop: 2, paddingTop: 1, fontWeight: "bold" }}><span>Net:</span><span>{packingItems.reduce((s, it) => s + (parseFloat(it.netWeight) || 0), 0).toFixed(3)}</span></div>
                    </td>
                  </tr>
                </>
              ) : (
                <>
                  {items.map((it, i) => {
                    const amt = (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0);
                    return (
                      <tr key={i}>
                        <td style={td({ textAlign: "center" })}>{i + 1}</td>
                        <td style={td()}>{it.description}</td>
                        <td style={td({ textAlign: "right" })}>{it.qty}</td>
                        <td style={td({ textAlign: "right" })}>{it.rate}</td>
                        <td style={td({ textAlign: "center" })}>{it.per}</td>
                        <td style={td({ textAlign: "right" })}>
                          {amt ? money(amt) : ""}
                        </td>
                      </tr>
                    );
                  })}
                  {Array.from({ length: blankRows }).map((_, i) => (
                    <tr key={"blank" + i}>
                      <td style={td()}>&nbsp;</td>
                      <td style={td()}></td>
                      <td style={td()}></td>
                      <td style={td()}></td>
                      <td style={td()}></td>
                      <td style={td()}></td>
                    </tr>
                  ))}
                  <tr>
                    <td style={td({ fontWeight: 700, textAlign: "center", background: "#e9e9e9" })} colSpan={2}>
                      TOTAL
                    </td>
                    <td style={td({ fontWeight: 700, textAlign: "right", background: "#e9e9e9" })}>
                      {totalQty ? totalQty.toFixed(3) : ""}
                    </td>
                    <td style={td({ background: "#e9e9e9" })}></td>
                    <td style={td({ fontWeight: 700, textAlign: "center", background: "#e9e9e9" })}>
                      {meta.currency}
                    </td>
                    <td style={td({ fontWeight: 700, textAlign: "right", background: "#e9e9e9" })}>
                      {money(subtotal)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          {/* Amount in words + totals (Only in invoice mode) */}
          {!isPackingMode && (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 10,
                border: BORDER,
                borderRadius: 3,
              }}
            >
              <tbody>
                <tr>
                  {/* Left: MARKS & NO. + AMOUNT IN WORDS */}
                  <td
                    style={{
                      width: "55%",
                      padding: 0,
                      verticalAlign: "top",
                      border: "none",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        {hasContainers && (
                          <>
                            <tr>
                              <td style={{ fontWeight: 700, background: "#e9e9e9", padding: "3px 6px", fontSize: 10.5, border: "none" }}>
                                MARKS & NO.
                              </td>
                            </tr>
                            {enteredContainers.map((c, idx) => (
                              <tr key={idx}>
                                <td style={{ padding: "3px 6px", fontSize: 10.5, border: "none", borderBottom: idx === enteredContainers.length - 1 ? BORDER : "none" }}>
                                  {c.containerNo && `CONT NO: ${c.containerNo}`}
                                  {c.containerNo && c.sealNo && ", "}
                                  {c.sealNo && `SEAL NO: ${c.sealNo}`}
                                </td>
                              </tr>
                            ))}
                          </>
                        )}
                        <tr>
                          <td style={{ fontWeight: 700, background: "#e9e9e9", padding: "3px 6px", fontSize: 10.5, border: "none" }}>
                            AMOUNT IN WORDS
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "3px 6px", fontSize: 10.5, minWidth: 0, height: 40, border: "none", verticalAlign: "top" }}>
                            {meta.amountInWords || autoWords}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                  {/* Right: Amount Balance Calculation box */}
                  <td
                    style={{
                      width: "45%",
                      padding: 0,
                      verticalAlign: "top",
                      border: "none",
                      borderLeft: BORDER,
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        {[
                          ["VAT @ " + vatPercent + "%", vatAmount ? money(vatAmount) : "-", false, false],
                          ["TOTAL INCL VAT", money(totalInclVat), true, false],
                          ["ADVANCE " + advancePercent + "%", money(advanceAmt), false, false],
                          ["BALANCE", money(balance), true, true],
                        ].map(([label, value, bold, isBalance], i) => (
                          <tr key={label} style={{ borderBottom: i < 3 ? BORDER : "none" }}>
                            <td
                              style={{
                                padding: "3px 6px",
                                fontSize: isBalance ? 10 : 10.5,
                                fontWeight: bold ? "bold" : "normal",
                                border: "none",
                                color: isBalance ? "#1a4fa0" : "#000",
                              }}
                            >
                              {label}
                            </td>
                            <td
                              style={{
                                padding: "3px 6px",
                                fontSize: isBalance ? 10 : 10.5,
                                fontWeight: bold ? "bold" : "normal",
                                textAlign: "right",
                                border: "none",
                                color: isBalance ? "#1a4fa0" : "#000",
                              }}
                            >
                              {value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Bank details + Signature (Bank details only in invoice mode, Signature in both) */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 10,
              border: BORDER,
              borderRadius: 3,
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    width: "55%",
                    padding: 0,
                    verticalAlign: "top",
                    border: "none",
                  }}
                >
                  {!isPackingMode && (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        <tr>
                          <td style={{ fontWeight: 700, padding: "5px 6px", fontSize: 10.5, border: "none" }}>
                            BANK DETAILS
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 6px", fontSize: 10.5, border: "none" }}>
                            ACC NAME : <b>{bank.accName}</b>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 6px", fontSize: 10.5, border: "none" }}>BANK NAME : {bank.bankName}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 6px", fontSize: 10.5, border: "none" }}>ACC NO : {bank.accNo}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 6px", fontSize: 10.5, border: "none" }}>IBAN NO : {bank.iban}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 6px", fontSize: 10.5, border: "none" }}>SWIFT NO : {bank.swift}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "5px 6px", fontSize: 10.5, border: "none" }}>ADDRESS : {bank.address}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </td>
                <td
                  style={{
                    width: "45%",
                    padding: "5px 6px",
                    verticalAlign: "bottom",
                    textAlign: "center",
                    border: "none",
                    borderLeft: BORDER,
                  }}
                >
                  <div style={{ fontSize: 11, marginBottom: 4 }}>FOR</div>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    {seller.name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "center",
                      alignItems: "center",
                      minHeight: 60,
                      flexWrap: "wrap",
                    }}
                  >
                    {signature && (
                      <img src={signature} alt="signature" style={{ width: `${sigWidth * 0.476}cqw`, height: `${sigHeight * 0.476}cqw`, objectFit: "contain" }} />
                    )}
                    {stamp && (
                      <img src={stamp} alt="stamp" style={{ width: `${stampWidth * 0.476}cqw`, height: `${stampHeight * 0.476}cqw`, objectFit: "contain" }} />
                    )}
                    {!signature && !stamp && (
                      <div style={{ fontSize: 10, color: "#ccc" }}>—</div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 4 }}>
                    AUTH SIGNATORY
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
            </>
          )}
        </div>
      </div>
      </div>
      )}
    </div>
  );
}

