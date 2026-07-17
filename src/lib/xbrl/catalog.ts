// The v1 concept catalog and the hand-authored Northwind mapping.
//
// CATALOG: a hand-curated subset of long-stable us-gaap elements — the
// core statement lines every simple filer uses. This is NOT a taxonomy
// import; the full us-gaap taxonomy is ~17K concepts and its ingestion is
// v2 work. Every qname below is a real us-gaap element whose name has
// been stable across releases; periodType and balance are as declared by
// the taxonomy. If a name here is ever found to drift from the pinned
// release, fix it HERE — the DB rows are seeded from this file.
//
// MAPPING: which Northwind account codes roll into which concept. This is
// the judgment-laden artifact the sketch called out. Two deliberate moves:
//
//   * Northwind has NO retained-earnings account (RE = cumulative P&L),
//     so RetainedEarningsAccumulatedDeficit maps to every P&L code — the
//     INSTANT window makes that life-to-date net income. StockholdersEquity
//     and LiabilitiesAndStockholdersEquity include the P&L codes for the
//     same reason.
//   * The code sets for Assets vs LiabilitiesAndStockholdersEquity
//     partition the chart, so "A = L+E" in the validator is exactly the
//     trial balance tying — a broken mapping breaks the check loudly.

import type { ConceptDef, MappingDef } from "./types";

export const US_GAAP_2024 = {
  name: "US GAAP Financial Reporting Taxonomy (hand-curated v1 subset)",
  namespace: "http://fasb.org/us-gaap/2024",
  version: "2024",
  prefix: "us-gaap",
  // Published entry point recorded for schemaRef; v1 does not fetch it.
  schemaRefHref: "https://xbrl.fasb.org/us-gaap/2024/entire/us-gaap-entryPoint-std-2024.xsd",
} as const;

export const CONCEPTS: ConceptDef[] = [
  // --- Balance sheet: assets (instant, debit) ---
  { qname: "us-gaap:Assets", label: "Total assets", periodType: "INSTANT", balance: "DEBIT" },
  { qname: "us-gaap:AssetsCurrent", label: "Total current assets", periodType: "INSTANT", balance: "DEBIT" },
  { qname: "us-gaap:CashAndCashEquivalentsAtCarryingValue", label: "Cash and cash equivalents", periodType: "INSTANT", balance: "DEBIT" },
  { qname: "us-gaap:AccountsReceivableNetCurrent", label: "Accounts receivable, net", periodType: "INSTANT", balance: "DEBIT" },
  { qname: "us-gaap:DueFromRelatedPartiesCurrent", label: "Due from related parties", periodType: "INSTANT", balance: "DEBIT" },
  { qname: "us-gaap:PrepaidExpenseCurrent", label: "Prepaid expenses", periodType: "INSTANT", balance: "DEBIT" },
  { qname: "us-gaap:InventoryNet", label: "Inventory, net", periodType: "INSTANT", balance: "DEBIT" },
  { qname: "us-gaap:PropertyPlantAndEquipmentNet", label: "Property, plant and equipment, net", periodType: "INSTANT", balance: "DEBIT" },
  { qname: "us-gaap:OperatingLeaseRightOfUseAsset", label: "Operating lease right-of-use asset", periodType: "INSTANT", balance: "DEBIT" },
  // --- Balance sheet: liabilities (instant, credit) ---
  { qname: "us-gaap:Liabilities", label: "Total liabilities", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:LiabilitiesCurrent", label: "Total current liabilities", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:AccountsPayableCurrent", label: "Accounts payable", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:AccruedLiabilitiesCurrent", label: "Accrued liabilities", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:ContractWithCustomerLiabilityCurrent", label: "Deferred revenue (contract liability)", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:OtherLiabilitiesCurrent", label: "Other current liabilities", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:DueToRelatedPartiesCurrent", label: "Due to related parties", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:OperatingLeaseLiabilityCurrent", label: "Operating lease liability, current", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:LongTermDebtNoncurrent", label: "Long-term debt", periodType: "INSTANT", balance: "CREDIT" },
  // --- Balance sheet: equity (instant, credit) ---
  { qname: "us-gaap:StockholdersEquity", label: "Total stockholders' equity", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:CommonStockValue", label: "Common stock", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:AdditionalPaidInCapital", label: "Additional paid-in capital", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:RetainedEarningsAccumulatedDeficit", label: "Retained earnings (accumulated deficit)", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:LiabilitiesAndStockholdersEquity", label: "Total liabilities and stockholders' equity", periodType: "INSTANT", balance: "CREDIT" },
  // --- Income statement (duration) ---
  { qname: "us-gaap:Revenues", label: "Revenues", periodType: "DURATION", balance: "CREDIT" },
  { qname: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", label: "Revenue from contracts with customers", periodType: "DURATION", balance: "CREDIT" },
  { qname: "us-gaap:CostOfRevenue", label: "Cost of revenue", periodType: "DURATION", balance: "DEBIT" },
  { qname: "us-gaap:GrossProfit", label: "Gross profit", periodType: "DURATION", balance: "CREDIT" },
  { qname: "us-gaap:OperatingExpenses", label: "Operating expenses", periodType: "DURATION", balance: "DEBIT" },
  { qname: "us-gaap:SellingGeneralAndAdministrativeExpense", label: "Selling, general and administrative expense", periodType: "DURATION", balance: "DEBIT" },
  { qname: "us-gaap:DepreciationDepletionAndAmortization", label: "Depreciation, depletion and amortization", periodType: "DURATION", balance: "DEBIT" },
  { qname: "us-gaap:OperatingIncomeLoss", label: "Operating income (loss)", periodType: "DURATION", balance: "CREDIT" },
  { qname: "us-gaap:InterestExpense", label: "Interest expense", periodType: "DURATION", balance: "DEBIT" },
  { qname: "us-gaap:IncomeTaxExpenseBenefit", label: "Income tax expense (benefit)", periodType: "DURATION", balance: "DEBIT" },
  { qname: "us-gaap:CostsAndExpenses", label: "Costs and expenses", periodType: "DURATION", balance: "DEBIT" },
  { qname: "us-gaap:NetIncomeLoss", label: "Net income (loss)", periodType: "DURATION", balance: "CREDIT" },
];

// Northwind chart (ledger-core seed COA, 37 accounts).
const ASSET_CODES = ["1000", "1010", "1200", "1210", "1300", "1400", "1500", "1510", "1600"];
const LIABILITY_CODES = ["2000", "2100", "2200", "2300", "2400", "2600"];
const EQUITY_CODES = ["3000", "3100"];
const REVENUE_CODES = ["4000", "4100", "4900"];
const EXPENSE_CODES = [
  "5000", "5100", "5900",
  "6000", "6100", "6200",
  "7000", "7100", "7200", "7300", "7400", "7500",
  "8000", "8100", "8200", "8300", "8310",
];
const PNL_CODES = [...REVENUE_CODES, ...EXPENSE_CODES];

export const NORTHWIND_MAPPING: MappingDef[] = [
  { conceptQname: "us-gaap:Assets", accountCodes: ASSET_CODES },
  { conceptQname: "us-gaap:CashAndCashEquivalentsAtCarryingValue", accountCodes: ["1000", "1010"] },
  { conceptQname: "us-gaap:AccountsReceivableNetCurrent", accountCodes: ["1200", "1210"] },
  { conceptQname: "us-gaap:DueFromRelatedPartiesCurrent", accountCodes: ["1300"] },
  { conceptQname: "us-gaap:PrepaidExpenseCurrent", accountCodes: ["1400"] },
  { conceptQname: "us-gaap:PropertyPlantAndEquipmentNet", accountCodes: ["1500", "1510"] },
  { conceptQname: "us-gaap:OperatingLeaseRightOfUseAsset", accountCodes: ["1600"] },
  { conceptQname: "us-gaap:Liabilities", accountCodes: LIABILITY_CODES },
  { conceptQname: "us-gaap:AccountsPayableCurrent", accountCodes: ["2000"] },
  { conceptQname: "us-gaap:AccruedLiabilitiesCurrent", accountCodes: ["2100"] },
  { conceptQname: "us-gaap:ContractWithCustomerLiabilityCurrent", accountCodes: ["2200"] },
  { conceptQname: "us-gaap:OtherLiabilitiesCurrent", accountCodes: ["2300"] },
  { conceptQname: "us-gaap:DueToRelatedPartiesCurrent", accountCodes: ["2400"] },
  { conceptQname: "us-gaap:OperatingLeaseLiabilityCurrent", accountCodes: ["2600"] },
  // Equity concepts include P&L codes: RE = cumulative net income (no RE account in the chart).
  { conceptQname: "us-gaap:StockholdersEquity", accountCodes: [...EQUITY_CODES, ...PNL_CODES] },
  { conceptQname: "us-gaap:CommonStockValue", accountCodes: ["3000"] },
  { conceptQname: "us-gaap:AdditionalPaidInCapital", accountCodes: ["3100"] },
  { conceptQname: "us-gaap:RetainedEarningsAccumulatedDeficit", accountCodes: PNL_CODES },
  { conceptQname: "us-gaap:LiabilitiesAndStockholdersEquity", accountCodes: [...LIABILITY_CODES, ...EQUITY_CODES, ...PNL_CODES] },
  { conceptQname: "us-gaap:Revenues", accountCodes: REVENUE_CODES },
  { conceptQname: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", accountCodes: REVENUE_CODES },
  { conceptQname: "us-gaap:CostOfRevenue", accountCodes: ["5000", "5100"] },
  { conceptQname: "us-gaap:GrossProfit", accountCodes: [...REVENUE_CODES, "5000", "5100"] },
  { conceptQname: "us-gaap:OperatingExpenses", accountCodes: ["5900", "6000", "6100", "6200", "7000", "7100", "7200", "7300", "7400", "7500"] },
  { conceptQname: "us-gaap:SellingGeneralAndAdministrativeExpense", accountCodes: ["6000", "6100", "6200", "7000", "7100", "7200", "7300"] },
  { conceptQname: "us-gaap:DepreciationDepletionAndAmortization", accountCodes: ["8000"] },
  // Operating income excludes interest (8200) and FX remeasurement (8300/8310).
  { conceptQname: "us-gaap:OperatingIncomeLoss", accountCodes: [...REVENUE_CODES, "5000", "5100", "5900", "6000", "6100", "6200", "7000", "7100", "7200", "7300", "7400", "7500", "8000", "8100"] },
  { conceptQname: "us-gaap:InterestExpense", accountCodes: ["8200"] },
  { conceptQname: "us-gaap:CostsAndExpenses", accountCodes: EXPENSE_CODES },
  { conceptQname: "us-gaap:NetIncomeLoss", accountCodes: PNL_CODES },
];
