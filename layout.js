/* Detail-page layout: how a saved arrangement is reconciled with the sections
   the running build actually has.

   What is stored is an OVERRIDE — an order and a hidden list — never a literal
   list of what to draw. A literal list rots the moment a release adds a
   section: everyone who ever opened the customiser would keep the arrangement
   they saved and silently never see the new card, and nothing would throw to
   say so. Resolving against the registry on every render means a new section
   arrives on its own, in the place its registration implies.

   Pure on purpose: the reconciliation is the part that has to be right, and it
   can be checked without a browser. */

/* ids of `registry` in display order, each marked shown or hidden.
   `saved` is whatever came out of storage, including nothing at all. */
function resolveLayout(saved, registry){
  const reg = Array.isArray(registry) ? registry.filter(id => typeof id === 'string') : [];
  const known = new Set(reg);
  const s = saved && typeof saved === 'object' ? saved : {};

  /* anything storage handed us that the build no longer has is dropped, and a
     duplicate id would otherwise render its section twice */
  const order = [];
  if(Array.isArray(s.order))
    s.order.forEach(id => { if(known.has(id) && !order.includes(id)) order.push(id); });

  /* Sections the saved order never mentioned — new in this build, or saved
     before the user ever opened the customiser. Each one lands beside the
     neighbour it registers next to, so it follows that neighbour wherever the
     user has moved it, rather than snapping back to its registry position. */
  reg.forEach((id, i) => {
    if(order.includes(id)) return;
    for(let k = i - 1; k >= 0; k--){
      const at = order.indexOf(reg[k]);
      if(at >= 0){ order.splice(at + 1, 0, id); return; }
    }
    for(let k = i + 1; k < reg.length; k++){
      const at = order.indexOf(reg[k]);
      if(at >= 0){ order.splice(at, 0, id); return; }
    }
    order.push(id);
  });

  const hidden = new Set(Array.isArray(s.hidden) ? s.hidden.filter(id => known.has(id)) : []);
  return order.map(id => ({id, on:!hidden.has(id)}));
}

/* the canonical form of `saved`, safe to write back to storage: every id real,
   every id present, hidden listed in display order so two equal layouts
   compare equal */
function normalizeLayout(saved, registry){
  const res = resolveLayout(saved, registry);
  return {
    order:  res.map(x => x.id),
    hidden: res.filter(x => !x.on).map(x => x.id)
  };
}

/* whether `saved` still describes the registry's own arrangement, so the
   customiser can say there is nothing to restore */
function isDefaultLayout(saved, registry){
  const n = normalizeLayout(saved, registry);
  const reg = Array.isArray(registry) ? registry.filter(id => typeof id === 'string') : [];
  return n.hidden.length === 0 && n.order.length === reg.length
      && n.order.every((id, i) => id === reg[i]);
}

if(typeof module !== 'undefined') module.exports = {resolveLayout, normalizeLayout, isDefaultLayout};
