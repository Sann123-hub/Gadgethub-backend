import { asyncHandler, ok, ApiError } from '../utils/helpers.js';
import { adminReportBundle, toCSV, toExcelXML, reportToPDF } from '../services/report.service.js';

/** GET /api/admin/reports?days=30 — full JSON bundle */
export const adminReports = asyncHandler(async (req, res) => {
  const days = Math.min(365, Number(req.query.days) || 30);
  const bundle = await adminReportBundle(days);
  ok(res, { report: bundle });
});

/** GET /api/admin/reports/:kind?days=30&format=pdf|csv|excel — kind: sales|products|users|sellers|orders */
export const downloadAdminReport = asyncHandler(async (req, res) => {
  const { kind, format = 'csv' } = req.params;
  const days = Math.min(365, Number(req.query.days) || 30);
  const bundle = await adminReportBundle(days);
  const stamp = new Date().toISOString().slice(0, 10);

  let rows, headers, title;

  switch (kind) {
    case 'sales':
      rows = bundle.sales.trend.map((t) => ({ date: t._id, revenue: t.revenue, orders: t.orders }));
      headers = [
        { label: 'Date', key: 'date' },
        { label: 'Revenue', key: 'revenue' },
        { label: 'Orders', key: 'orders' }
      ];
      title = `Sales Report (last ${days} days)`;
      break;
    case 'products':
      rows = [
        ...bundle.products.bestSellers.map((p) => ({ name: p.name, metric: 'Units sold', value: p.soldCount, extra: p.price })),
        ...bundle.products.mostViewed.map((p) => ({ name: p.name, metric: 'Views', value: p.views, extra: '' })),
        ...bundle.products.byCategory.map((c) => ({ name: c._id || 'Uncategorized', metric: 'Products in category', value: c.count, extra: '' }))
      ];
      headers = [
        { label: 'Product / Category', key: 'name' },
        { label: 'Metric', key: 'metric' },
        { label: 'Value', key: 'value' },
        { label: 'Price', key: 'extra' }
      ];
      title = 'Products Report';
      break;
    case 'users':
      rows = bundle.users.byRole.map((r) => ({ role: r._id || 'UNKNOWN', count: r.count, blocked: r.blocked }));
      headers = [
        { label: 'Role', key: 'role' },
        { label: 'Count', key: 'count' },
        { label: 'Blocked', key: 'blocked' }
      ];
      title = 'Users Report';
      break;
    case 'sellers':
      rows = bundle.sellers.map((s) => ({ name: s.name || s.email, revenue: s.revenue, units: s.units }));
      headers = [
        { label: 'Seller', key: 'name' },
        { label: 'Revenue', key: 'revenue' },
        { label: 'Units sold', key: 'units' }
      ];
      title = 'Sellers Report';
      break;
    case 'orders':
      rows = bundle.orders.map((o) => ({ status: o._id, count: o.count }));
      headers = [
        { label: 'Status', key: 'status' },
        { label: 'Orders', key: 'count' }
      ];
      title = 'Orders Report';
      break;
    default:
      throw new ApiError(422, 'Report kind must be: sales, products, users, sellers or orders.');
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="admin-${kind}-report-${stamp}.csv"`);
    return res.send(toCSV(rows, headers));
  }
  if (format === 'excel') {
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="admin-${kind}-report-${stamp}.xls"`);
    return res.send(toExcelXML(rows, headers, kind));
  }
  if (format === 'pdf') {
    const pdf = await reportToPDF(title, [
      { title, type: 'table', headers: headers.map((h) => h.label), rows: rows.map((r) => headers.map((h) => r[h.key])) }
    ]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="admin-${kind}-report-${stamp}.pdf"`);
    return res.send(pdf);
  }
  throw new ApiError(422, 'Format must be: pdf, csv or excel.');
});
