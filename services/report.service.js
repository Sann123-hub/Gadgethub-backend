import PDFDocument from 'pdfkit';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Complaint from '../models/Complaint.js';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Sales analytics with date range */
export const salesAnalytics = async (days = 30) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const match = { createdAt: { $gte: since }, status: { $ne: 'CANCELLED' } };

  const trend = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$total' },
        orders: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const byStatus = await Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const totals = await Order.aggregate([
    { $match: match },
    { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 }, avg: { $avg: '$total' } } }
  ]);

  return {
    trend,
    byStatus,
    totals: {
      revenue: totals[0]?.revenue || 0,
      orders: totals[0]?.orders || 0,
      avgOrder: Math.round(totals[0]?.avg || 0)
    }
  };
};

/** Full admin report bundle */
export const adminReportBundle = async (days = 30) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [sales, userStats, sellerStats, productStats, orderStatus] = await Promise.all([
    salesAnalytics(days),
    User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 }, blocked: { $sum: { $cond: ['$isBlocked', 1, 0] } } } }
    ]),
    Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.seller', revenue: { $sum: '$items.price' }, units: { $sum: '$items.qty' } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'seller' }
      },
      { $project: { revenue: 1, units: 1, name: { $first: '$seller.name' }, email: { $first: '$seller.email' } } }
    ]),
    Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ stock: { $lte: 5 } }),
      Product.aggregate([
        { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'cat' } },
        { $group: { _id: { $first: '$cat.name' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Product.find({ status: 'APPROVED' }).sort({ soldCount: -1 }).limit(10).select('name soldCount price'),
      Product.find().sort({ views: -1 }).limit(10).select('name views')
    ]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
  ]);

  const [totalProducts, lowStock, byCategory, bestSellers, mostViewed] = productStats;

  const newUsers = await User.countDocuments({ createdAt: { $gte: since } });
  const complaints = await Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

  return {
    rangeDays: days,
    sales,
    users: { byRole: userStats, newUsers },
    sellers: sellerStats,
    products: { totalProducts, lowStock, byCategory, bestSellers, mostViewed },
    orders: orderStatus,
    complaints
  };
};

/* ────────── Export builders ────────── */

export const toCSV = (rows, headers) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = headers.map((h) => esc(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => esc(typeof h.key === 'function' ? h.key(r) : r[h.key])).join(',')).join('\n');
  return `${head}\n${body}`;
};

// Minimal SpreadsheetML — opens natively in Excel as a real workbook
export const toExcelXML = (rows, headers, sheetName = 'Report') => {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cell = (v) => (typeof v === 'number' && !isNaN(v) ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`);
  const head = `<Row>${headers.map((h) => `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(h.label)}</Data></Cell>`).join('')}</Row>`;
  const body = rows.map((r) => `<Row>${headers.map((h) => cell(typeof h.key === 'function' ? h.key(r) : r[h.key])).join('')}</Row>`).join('');
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>
 <Worksheet ss:Name="${esc(sheetName)}"><Table>${head}${body}</Table></Worksheet>
</Workbook>`;
};

export const reportToPDF = (title, sections) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#111827').font('Helvetica-Bold').text('Gadget Hub', 48, 48);
    doc.fontSize(14).fillColor('#374151').font('Helvetica').text(title, 48, 76);
    doc.fontSize(9).fillColor('#6b7280').text(`Generated ${new Date().toLocaleString('en-IN')}`, 48, 96);
    doc.moveTo(48, 112).lineTo(547, 112).strokeColor('#e5e7eb').stroke();

    let y = 130;
    sections.forEach((sec) => {
      if (y > 720) { doc.addPage(); y = 60; }
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827').text(sec.title, 48, y);
      y += 20;

      if (sec.type === 'kv') {
        doc.font('Helvetica').fontSize(10);
        sec.rows.forEach(([k, v]) => {
          if (y > 760) { doc.addPage(); y = 60; }
          doc.fillColor('#374151').text(k, 60, y).fillColor('#111827').text(String(v), 300, y, { align: 'right', width: 240 });
          y += 17;
        });
        y += 10;
      } else if (sec.type === 'table') {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a');
        sec.headers.forEach((h, i) => doc.text(h, 60 + i * 160, y));
        y += 14;
        doc.font('Helvetica').fillColor('#374151');
        sec.rows.forEach((r) => {
          if (y > 760) { doc.addPage(); y = 60; }
          sec.headers.forEach((h, i) => doc.text(String(r[i] ?? ''), 60 + i * 160, y, { width: 150, ellipsis: true }));
          y += 16;
        });
        y += 10;
      }
    });

    doc.end();
  });
