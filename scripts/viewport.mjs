/** Preserve scroll and editing position across ApplicationV2 HTML replacements. */
const SCROLLERS=['.awb-main','.awb-mapping-list','.awb-recipe-list','.awb-item-list'];

export function captureWorkbenchViewport(content,activeElement=null) {
  const scroll=Object.fromEntries(SCROLLERS.map(selector=>{
    const node=content?.querySelector?.(selector);
    return [selector,node?{top:node.scrollTop,left:node.scrollLeft}:null];
  }));
  const mappingId=activeElement?.dataset?.mapping ?? null;
  const editing=mappingId!==null;
  let selection=null;
  if(editing)try{selection={start:activeElement.selectionStart,end:activeElement.selectionEnd};}catch{}
  return {scroll,mappingId,selection};
}

export function restoreWorkbenchViewport(content,state) {
  if(!state)return;
  for(const [selector,position] of Object.entries(state.scroll??{})){
    if(!position)continue;
    const node=content?.querySelector?.(selector);
    if(!node)continue;
    node.scrollTop=position.top;
    node.scrollLeft=position.left;
  }
  if(state.mappingId===null)return;
  const inputs=content?.querySelectorAll?.('[data-mapping]')??[];
  const input=Array.from(inputs).find(x=>x.dataset.mapping===state.mappingId);
  if(!input)return;
  input.focus?.({preventScroll:true});
  if(state.selection && Number.isInteger(state.selection.start)){
    try{input.setSelectionRange(state.selection.start,state.selection.end);}catch{}
  }
}
