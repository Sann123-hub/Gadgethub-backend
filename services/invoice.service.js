import PDFDocument from 'pdfkit';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Stream a professional invoice PDF into a Buffer */
export const generateInvoicePDF = (order) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 96;
    const grey = '#6b7280';
    const dark = '#111827';
    const gold = '#b45309';

    // ── Header ──
    doc.fontSize(22).fillColor(dark).font('Helvetica-Bold').text('Gadget Hub', 48, 48);
    doc.fontSize(9).fillColor(grey).font('Helvetica').text('GADGET MARKETPLACE  •  INVOICE', 48, 74);
    doc.moveTo(48, 96).lineTo(48 + W, 96).lineWidth(1).fillColor('#e5e7eb').stroke();

    // Invoice meta (right)
    doc.fontSize(9).fillColor(grey).text(`Invoice: ${order.invoiceNumber}`, 300, 52, { width: W - 252, align: 'right' });
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, { width: W - 252, align: 'right' });
    doc.text(`Order ID: ${String(order._id).slice(-8).toUpperCase()}`, { width: W - 252, align: 'right' });
    doc.text(`Status: ${order.status}`, { width: W - 252, align: 'right' });

    // ── Bill To ──
    const a = order.shippingAddress || {};
    doc.fillColor(dark).font('Helvetica-Bold').fontSize(11).text('Billed to', 48, 116);
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(a.fullName || 'Customer', 48, 134)
      .text(a.line1 || '', 48, 149)
      .text([a.city, a.state, a.zip].filter(Boolean).join(', '), 48, 164)
      .text(a.phone || '', 48, 179);

    // Payment method
    doc.font('Helvetica-Bold').fontSize(11).fillColor(dark).text('Payment', 330, 116);
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(order.paymentMethod, 330, 134)
      .fillColor(order.isPaid ? '#059669' : '#b45309')
      .text(order.isPaid ? 'PAID' : 'PAYMENT PENDING', 330, 149);

    // ── Items table ──
    const tableTop = 210;
    const cols = { product: 48, qty: 330, price: 390, subtotal: 470 };
    doc.rect(48, tableTop, W, 26).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
      .text('PRODUCT', cols.product + 8, tableTop + 8)
      .text('QTY', cols.qty, tableTop + 8)
      .text('UNIT PRICE', cols.price, tableTop + 8)
      .text('SUBTOTAL', cols.subtotal, tableTop + 8, { width: 90, align: 'right' });

    let y = tableTop + 26 + 10;
    doc.font('Helvetica').fontSize(9).fillColor('#111827');
    order.items.forEach((it, i) => {
      if (y > 680) { doc.addPage(); y = 60; }
      if (i % 2 === 0) doc.rect(48, y - 6, W, 24).fill('#f9fafb');
      doc.fillColor('#111827')
        .text(it.name.slice(0, 42), cols.product + 8, y, { width: 260, ellipsis: true })
        .text(String(it.qty), cols.qty, y)
        .text(fmt(it.price), cols.price, y)
        .text(fmt(it.price * it.qty - (it.discount || 0)), cols.subtotal, y, { width: 90, align: 'right' });
      y += 24;
    });

    // ── Totals ──
    y += 12;
    doc.moveTo(300, y).lineTo(48 + W, y).strokeColor('#e5e7eb').stroke();
    y += 10;
    const row = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(bold ? dark : '#374151')
        .text(label, 340, y)
        .text(value, 400, y, { width: 118, align: 'right' });
      y += 17;
    };
    row('Items subtotal', fmt(order.itemsTotal));
    if (order.discountTotal) row('Discount', `− ${fmt(order.discountTotal)}`);
    row('Tax (GST incl.)', fmt(order.taxTotal));
    row('Shipping', order.shippingFee ? fmt(order.shippingFee) : 'Free');
    doc.moveTo(300, y).lineTo(48 + W, y).strokeColor('#d1d5db').stroke();
    y += 8;
    doc.fontSize(13).font('Helvetica-Bold').fillColor(dark)
      .text('Total', 340, y)
      .fillColor(gold)
      .text(fmt(order.total), 400, y, { width: 118, align: 'right' });

    // ── Footer ──
    doc.fontSize(8).fillColor(grey).font('Helvetica')
      .text('This is a computer-generated invoice from Gadget Hub. For support write to support@gadgethub.io', 48, 760, { width: W, align: 'center' });

    doc.end();
  });
