# Bills

Bills created from **Menu & Billing** or table checkout are finalized as paid. Users with the
`BILL_CREATE` permission can edit a paid bill from its detail dialog.

An edit can update customer details, notes, discount, quantities, remove existing lines, or add
currently available menu items. Existing item descriptions, unit prices, and tax rates remain the
snapshots from the original bill; added items use the current menu price and tax rate. The server
validates edits and recalculates all totals with the shared Decimal billing engine.

The paid amount is set to the recalculated total, and the due amount remains zero. Each edit writes
the before-and-after values to the audit log in the same transaction. Cancelled, refunded, or
otherwise non-paid bills cannot be edited. Bills with recorded payment transactions are also
blocked so payment history is never silently changed.

Editing a bill changes its revenue amount. The bill's invoice number and original invoice date are
retained.
