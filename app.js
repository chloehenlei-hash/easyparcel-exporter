const DEFAULTS = {
  phoneCountry: "Malaysia +60",
  country: "Malaysia",
  residential: "Yes",
  weight: 1,
  length: 10,
  width: 10,
  height: 10,
  currency: "MYR",
  price: 1,
  quantity: 1,
};

const STORAGE_KEY = "coforyou.easyparcel.orders.v1";
const SHEET_URL_KEY = "coforyou.easyparcel.sheetWebAppUrl.v1";
const DEFAULT_SHEET_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbx_O9Drj7-zuMUgsIKPdxuNjhDeDAy1-XXO2rlkEC7KdN555HxmB2mO6gxklmHbWxo/exec";

const INTERNAL_HEADERS = [
  "STATUS",
  "寄出日期",
  "品牌 / 奖品",
  "IG",
  "名字",
  "电话",
  "地址",
  "物流公司",
  "TRACKING NO",
  "Amount",
  "Postcode",
  "City",
  "State",
  "检查",
];

const EASYPARCEL_HEADERS = [
  "No.",
  "Receiver Name *",
  "Receiver Phone Number Country *",
  "Receiver Phone Number *",
  "Receiver Alt Phone Number Country",
  "Receiver Alt Phone Number",
  "Receiver Company",
  "Receiver Email",
  "Receiver Address *",
  "Receiver Postcode *",
  "Receiver City *",
  "Receiver State *",
  "Receiver Country *",
  "Receiver address is residential address? (Yes/No)",
  "Receiver Tax ID",
  "Parcel Weight (kg) *",
  "Length (cm) *",
  "Width (cm) *",
  "Height (cm) *",
  "Parcel Currency *",
  "Item Name *",
  "Price Per Item *",
  "Quantity *",
  "HS Code",
  "Reference / Remark",
  "COD Currency",
  "COD Amount",
];

const STATE_BY_PREFIX = [
  { min: 1000, max: 2999, state: "Perlis" },
  { min: 5000, max: 9999, state: "Kedah" },
  { min: 10000, max: 14999, state: "Pulau Pinang" },
  { min: 15000, max: 18999, state: "Kelantan" },
  { min: 20000, max: 24999, state: "Terengganu" },
  { min: 25000, max: 28999, state: "Pahang" },
  { min: 30000, max: 36999, state: "Perak" },
  { min: 40000, max: 48999, state: "Selangor" },
  { min: 50000, max: 60000, state: "Kuala Lumpur" },
  { min: 62000, max: 62999, state: "Putrajaya" },
  { min: 63000, max: 68100, state: "Selangor" },
  { min: 70000, max: 73999, state: "Negeri Sembilan" },
  { min: 75000, max: 78999, state: "Melaka" },
  { min: 79000, max: 86999, state: "Johor" },
  { min: 87000, max: 87033, state: "Labuan" },
  { min: 88000, max: 91999, state: "Sabah" },
  { min: 93000, max: 98859, state: "Sarawak" },
];

const CITY_HINTS = [
  "Kuala Lumpur",
  "Petaling Jaya",
  "Subang Jaya",
  "Shah Alam",
  "Puchong",
  "Klang",
  "Kajang",
  "Cheras",
  "Ampang",
  "Seri Kembangan",
  "Bandar Mahkota Cheras",
  "Cyberjaya",
  "Putrajaya",
  "Serdang",
  "UPM Serdang",
  "George Town",
  "Tanjung Tokong",
  "Bayan Lepas",
  "Butterworth",
  "Ipoh",
  "Johor Bahru",
  "Melaka",
  "Seremban",
  "Kuantan",
  "Kota Bharu",
  "Kuala Terengganu",
  "Alor Setar",
  "Kangar",
  "Kota Kinabalu",
  "Kuching",
  "Miri",
  "Sibu",
];

let orders = loadOrders();

const form = document.querySelector("#entryForm");
const bulkInput = document.querySelector("#bulkInput");
const bulkStatus = document.querySelector("#bulkStatus");
const syncStatus = document.querySelector("#syncStatus");
const bulkAdd = document.querySelector("#bulkAdd");
const clearAll = document.querySelector("#clearAll");
const syncInternal = document.querySelector("#syncInternal");
const downloadInternal = document.querySelector("#downloadInternal");
const downloadEasyParcel = document.querySelector("#downloadEasyParcel");

localStorage.setItem(SHEET_URL_KEY, DEFAULT_SHEET_WEB_APP_URL);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const order = readForm();
  orders = [order, ...orders];
  saveOrders();
  form.reset();
  render();
  syncInternalSheet([order], { auto: true });
});

bulkAdd.addEventListener("click", () => {
  const parsed = parseBulk(bulkInput.value);
  if (!parsed.length) {
    bulkStatus.textContent = "没有加到资料。请直接从 Google Sheet 复制整行，或用：品牌 / IG / 名字 / 电话 / 地址。";
    return;
  }
  orders = [...parsed, ...orders];
  saveOrders();
  bulkStatus.textContent = `Added ${parsed.length} order${parsed.length > 1 ? "s" : ""}.`;
  render();
  syncInternalSheet(parsed, { auto: true });
});

clearAll.addEventListener("click", () => {
  if (!orders.length) return;
  orders = [];
  saveOrders();
  render();
});

syncInternal.addEventListener("click", async () => {
  await syncInternalSheet(orders);
});

downloadInternal.addEventListener("click", () => {
  downloadCsv("coforyou-internal-records.csv", [INTERNAL_HEADERS, ...orders.map(toInternalRow)]);
});

downloadEasyParcel.addEventListener("click", () => {
  downloadCsv("easyparcel-upload.csv", [EASYPARCEL_HEADERS, ...orders.map(toEasyParcelRow)]);
});

render();

function readForm() {
  return normalizeOrder({
    status: "",
    shipDate: "",
    brand: form.brand.value,
    instagram: form.instagram.value,
    customerName: form.customerName.value,
    phone: form.phone.value,
    address: form.address.value,
    logisticsCompany: "",
    trackingNo: "",
    amount: "",
  });
}

function parseBulk(text) {
  const separator = text.includes("\t") ? "\t" : ",";
  return parseDelimited(text, separator)
    .filter((row) => row.some((cell) => clean(cell)))
    .filter((row) => !isHeaderRow(row))
    .map(rowToOrder)
    .filter((order) => order.brand && order.customerName && order.phone && order.address);
}

function parseDelimited(text, separator) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === separator) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function isHeaderRow(row) {
  const joined = row.map(clean).join("|").toLowerCase();
  return joined.includes("品牌") && joined.includes("电话") && joined.includes("地址");
}

function rowToOrder(row) {
  const cells = row.map(clean);
  const looksLikeInternalSheet = cells.length >= 7 && looksLikePhone(cells[5]);
  if (looksLikeInternalSheet) {
    return normalizeOrder({
      status: cells[0],
      shipDate: cells[1],
      brand: cells[2],
      instagram: cells[3],
      customerName: cells[4],
      phone: cells[5],
      address: cells[6],
      logisticsCompany: cells[7],
      trackingNo: cells[8],
      amount: cells[9],
    });
  }

  return normalizeOrder({
    status: "",
    shipDate: "",
    brand: cells[0],
    instagram: cells[1],
    customerName: cells[2],
    phone: cells[3],
    address: cells.slice(4).join(separatorForAddress(row)),
    logisticsCompany: "",
    trackingNo: "",
    amount: "",
  });
}

function separatorForAddress(row) {
  return row.length > 5 ? ", " : " ";
}

function normalizeOrder(raw) {
  const address = clean(raw.address);
  const postcode = extractPostcode(address);
  const state = inferState(postcode);
  const city = inferCity(address, postcode, state);
  const warnings = [];
  if (!postcode) warnings.push("Missing postcode");
  if (!city) warnings.push("Missing city");
  if (!state) warnings.push("Missing state");

  return {
    id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    createdAt: new Date().toISOString(),
    status: clean(raw.status),
    shipDate: clean(raw.shipDate),
    brand: clean(raw.brand),
    instagram: clean(raw.instagram),
    customerName: clean(raw.customerName),
    phoneOriginal: clean(raw.phone),
    phone: normalizePhone(raw.phone),
    address,
    logisticsCompany: clean(raw.logisticsCompany),
    trackingNo: clean(raw.trackingNo),
    amount: clean(raw.amount),
    postcode,
    city,
    state,
    warnings,
  };
}

function looksLikePhone(value) {
  return String(value || "").replace(/\D/g, "").length >= 8;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractPostcode(address) {
  const matches = String(address || "").match(/\b\d{5}\b/g);
  return matches ? matches[matches.length - 1] : "";
}

function inferState(postcode) {
  const code = Number(postcode);
  if (!Number.isFinite(code)) return "";
  return STATE_BY_PREFIX.find((item) => code >= item.min && code <= item.max)?.state || "";
}

function inferCity(address, postcode, state) {
  const lower = String(address || "").toLowerCase();
  const hinted = CITY_HINTS.find((city) => lower.includes(city.toLowerCase()));
  if (hinted) return hinted;

  if (postcode) {
    const afterPostcode = address.split(postcode).pop() || "";
    const nextPart = afterPostcode
      .split(",")
      .map((part) => clean(part))
      .find((part) => part && part.toLowerCase() !== String(state).toLowerCase());
    if (nextPart) return nextPart;
  }

  return state || "";
}

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("60")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function toInternalRow(order) {
  return [
    order.status,
    order.shipDate,
    order.brand,
    order.instagram,
    order.customerName,
    order.phoneOriginal,
    order.address,
    order.logisticsCompany,
    order.trackingNo,
    order.amount,
    order.postcode,
    order.city,
    order.state,
    order.warnings.length ? order.warnings.join("; ") : "Ready",
  ];
}

function toEasyParcelRow(order, index) {
  return [
    index + 1,
    order.customerName,
    DEFAULTS.phoneCountry,
    order.phone,
    "",
    "",
    "",
    "",
    order.address,
    order.postcode,
    order.city,
    order.state,
    DEFAULTS.country,
    DEFAULTS.residential,
    "",
    DEFAULTS.weight,
    DEFAULTS.length,
    DEFAULTS.width,
    DEFAULTS.height,
    DEFAULTS.currency,
    order.brand,
    DEFAULTS.price,
    DEFAULTS.quantity,
    "",
    [order.instagram, order.brand].filter(Boolean).join(" - "),
    "",
    "",
  ];
}

function render() {
  const internalRows = orders.map(toInternalRow);
  const easyRows = orders.map(toEasyParcelRow);
  renderTable(document.querySelector("#internalTable"), INTERNAL_HEADERS, internalRows, 13);
  renderTable(document.querySelector("#easyparcelTable"), EASYPARCEL_HEADERS, easyRows);
  document.querySelector("#orderCount").textContent = `${orders.length} orders`;

  const warningTotal = orders.reduce((sum, order) => sum + order.warnings.length, 0);
  document.querySelector("#warningCount").textContent = warningTotal
    ? `${warningTotal} fields need checking`
    : "No warnings";
}

async function syncInternalSheet(targetOrders = orders, options = {}) {
  const url = DEFAULT_SHEET_WEB_APP_URL || localStorage.getItem(SHEET_URL_KEY) || "";
  if (!url) {
    syncStatus.textContent = "Google Sheet 还没有连接。";
    return;
  }

  if (!targetOrders.length) {
    syncStatus.textContent = "现在没有资料可以同步。";
    return;
  }

  syncStatus.textContent = options.auto ? "正在自动同步到 Google Sheet..." : "正在同步公司内部记录...";
  localStorage.setItem(SHEET_URL_KEY, url);

  const payload = {
    action: "syncInternalRecords",
    headers: INTERNAL_HEADERS,
    rows: targetOrders.map(toInternalRow),
  };

  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });
    syncStatus.textContent =
      "已同步到 Google Sheet。重复资料会自动跳过。";
  } catch (error) {
    syncStatus.textContent = "同步失败，请检查 Web App URL 或部署权限。";
  }
}

function renderTable(table, headers, rows, warningColumnIndex = -1) {
  const thead = `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`;
  const bodyRows = rows.length
    ? rows
        .map((row) => {
          return `<tr>${row
            .map((cell, index) => {
              const className =
                index === warningColumnIndex && cell !== "Ready" ? " class=\"warning\"" : "";
              return `<td${className}>${escapeHtml(cell)}</td>`;
            })
            .join("")}</tr>`;
        })
        .join("")
    : `<tr><td colspan="${headers.length}">No orders yet.</td></tr>`;
  table.innerHTML = `${thead}<tbody>${bodyRows}</tbody>`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveOrders() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}
