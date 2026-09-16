import { DocumentType, PrintDocument } from "../../domain/device/print-job.js";
import { randomUUID } from "node:crypto";

export interface OrderDocumentInput {
  readonly orderId: string;
  readonly customerName: string;
  readonly items: readonly { readonly name: string; readonly quantity: number; readonly price: number }[];
  readonly total: number;
  readonly shippingAddress?: string | undefined;
  readonly paymentMethod?: string | undefined;
}

export interface InventoryReportInput {
  readonly reportId?: string | undefined;
  readonly category: string;
  readonly totalSkus: number;
  readonly lowStockItems: readonly { readonly sku: string; readonly name: string; readonly inStock: number }[];
}

export class DocumentService {
  public generateOrderDocument(input: OrderDocumentInput): PrintDocument {
    const docId = `doc-order-${input.orderId}`;
    const dateStr = new Date().toLocaleString();

    let lines = [
      "============================================================",
      "             TENTACIONES AI COMMERCE - PACKING SLIP          ",
      "============================================================",
      `Order ID:       ${input.orderId}`,
      `Date:           ${dateStr}`,
      `Customer:       ${input.customerName}`,
      `Shipping To:    ${input.shippingAddress || "Standard Warehouse Delivery"}`,
      `Payment:        ${input.paymentMethod || "Webpay Demo Verified"}`,
      "------------------------------------------------------------",
      "ITEMS DISPATCH CHECKLIST:",
    ];

    input.items.forEach((item, idx) => {
      lines.push(` [ ] ${idx + 1}. ${item.name} x${item.quantity} - $${item.price.toFixed(2)}`);
    });

    lines.push("------------------------------------------------------------");
    lines.push(`TOTAL:          $${input.total.toFixed(2)} USD`);
    lines.push("============================================================");
    lines.push("  * Thank you for shopping with Tentaciones AI Commerce *  ");
    lines.push("============================================================");

    return {
      documentId: docId,
      type: "ORDER",
      title: `Order Packing Slip #${input.orderId}`,
      content: lines.join("\n"),
      format: "PLAIN_TEXT",
      pageCount: 1,
      copies: 1,
    };
  }

  public generateReceiptDocument(input: OrderDocumentInput): PrintDocument {
    const docId = `doc-receipt-${input.orderId}`;
    const dateStr = new Date().toLocaleString();

    let lines = [
      "************************************************************",
      "                 CUSTOMER PURCHASE RECEIPT                  ",
      "                 Tentaciones AI Operating                   ",
      "************************************************************",
      `Receipt No:     ${input.orderId}`,
      `Date/Time:      ${dateStr}`,
      `Customer:       ${input.customerName}`,
      "------------------------------------------------------------",
    ];

    input.items.forEach((item) => {
      lines.push(` ${item.name.padEnd(36)} x${item.quantity}  $${item.price.toFixed(2)}`);
    });

    lines.push("------------------------------------------------------------");
    lines.push(`Grand Total:    $${input.total.toFixed(2)} USD`);
    lines.push("============================================================");
    lines.push("  Note: Operational internal document. Non-fiscal copy.    ");
    lines.push("************************************************************");

    return {
      documentId: docId,
      type: "RECEIPT",
      title: `Purchase Receipt #${input.orderId}`,
      content: lines.join("\n"),
      format: "PLAIN_TEXT",
      pageCount: 1,
      copies: 1,
    };
  }

  public generateInventoryReport(input: InventoryReportInput): PrintDocument {
    const docId = input.reportId || `doc-inv-${randomUUID().substring(0, 8)}`;
    const dateStr = new Date().toLocaleString();

    let lines = [
      "============================================================",
      "            DAILY INVENTORY RECONCILIATION REPORT           ",
      "============================================================",
      `Report ID:      ${docId}`,
      `Generated At:   ${dateStr}`,
      `Category:       ${input.category}`,
      `Total SKUs:     ${input.totalSkus}`,
      "------------------------------------------------------------",
      "LOW STOCK ALERTS REQUIRING REORDER:",
    ];

    if (input.lowStockItems.length === 0) {
      lines.push("  All items within healthy replenishment thresholds.");
    } else {
      input.lowStockItems.forEach((item) => {
        lines.push(`  [ALERT] SKU: ${item.sku} | ${item.name} | In Stock: ${item.inStock}`);
      });
    }

    lines.push("============================================================");

    return {
      documentId: docId,
      type: "INVENTORY_REPORT",
      title: `Inventory Report: ${input.category}`,
      content: lines.join("\n"),
      format: "PLAIN_TEXT",
      pageCount: 1,
      copies: 1,
    };
  }

  public createCustomDocument(
    type: DocumentType,
    title: string,
    content: string,
    options?: { readonly pageCount?: number; readonly copies?: number }
  ): PrintDocument {
    return {
      documentId: `doc-custom-${randomUUID().substring(0, 8)}`,
      type,
      title,
      content,
      format: "PLAIN_TEXT",
      pageCount: options?.pageCount ?? 1,
      copies: options?.copies ?? 1,
    };
  }

  public generateDocument(input: {
    readonly type: DocumentType;
    readonly title: string;
    readonly content: Record<string, unknown> | string;
    readonly tenantId?: string | undefined;
    readonly metadata?: Record<string, unknown> | undefined;
  }): PrintDocument {
    const docId = `doc-${input.type.toLowerCase()}-${randomUUID().substring(0, 8)}`;
    let textContent = "";

    if (typeof input.content === "string") {
      textContent = input.content;
    } else if (input.type === "ORDER" && input.content.orderId) {
      return this.generateOrderDocument(input.content as any);
    } else if (input.type === "RECEIPT" && input.content.orderId) {
      return this.generateReceiptDocument(input.content as any);
    } else if (input.type === "INVENTORY_REPORT" && input.content.category) {
      return this.generateInventoryReport(input.content as any);
    } else {
      // General format
      const lines: string[] = [
        "============================================================",
        `                 ${input.title.toUpperCase()}              `,
        "============================================================",
        `Document ID:    ${docId}`,
        `Generated At:   ${new Date().toLocaleString()}`,
        `Tenant:         ${input.tenantId || "default"}`,
        "------------------------------------------------------------",
      ];
      if (typeof input.content === "object" && input.content !== null) {
        for (const [k, v] of Object.entries(input.content)) {
          lines.push(` ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
        }
      }
      lines.push("============================================================");
      textContent = lines.join("\n");
    }

    return {
      documentId: docId,
      type: input.type,
      title: input.title,
      content: textContent,
      format: "PLAIN_TEXT",
      pageCount: 1,
      copies: 1,
    };
  }
}
