/* Pure list-reordering helpers for the saved-locations list.

   Kept out of the drag handler so the arithmetic that decides where a card
   lands can be checked without a browser. */

/* a copy of `arr` with the item at `from` moved to `to`; out-of-range indices
   leave the order alone rather than dropping or duplicating an entry */
function moveItem(arr, from, to){
  const out = (arr || []).slice();
  if(from < 0 || to < 0 || from >= out.length || to >= out.length) return out;
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
}

/* index of the slot whose centre sits closest to `y`; -1 for an empty list.
   Ties go to the lower index, so a card resting exactly between two slots
   settles upward instead of flickering between them. */
function targetIndex(centres, y){
  if(!centres || !centres.length) return -1;
  let best = 0, bestD = Math.abs(centres[0] - y);
  for(let i = 1; i < centres.length; i++){
    const d = Math.abs(centres[i] - y);
    if(d < bestD){ best = i; bestD = d; }
  }
  return best;
}

if(typeof module !== 'undefined') module.exports = {moveItem, targetIndex};
