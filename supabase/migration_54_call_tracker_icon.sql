-- Call-Tracker-Icon in der Sidebar von "target" auf einen Telefonhörer umgestellt.
update nav_items set icon = 'phone' where key = 'call-tracker' and icon = 'target';
